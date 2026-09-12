import type { PullRequestReviewComment } from "../../../../ports/pull_request_review_comment_ports";
import type { PullRequestReviewThreadState } from "../../../../ports/pull_request_review_comment_ports";
import {
  MAX_FINDING_BODY_LENGTH,
  truncateFindingBody,
} from "./build_bugbot_fix_prompt";
import {
  normalizeFindingIdForMarker,
  parseMarker,
} from '../../../../policies/bugbot_finding_marker_policy';
import {
  isExistingFindingFullyResolved,
  type ExistingByFindingId,
} from "../../../../../domain/bugbot/finding";
import { githubUsersMatch } from '../../../../../domain/github_user_policy';
import { isHumanResolver } from '../../../../../domain/bugbot/review_state';
import type { PreviousBugbotFinding } from './bugbot_previous_findings_context';

export interface BugbotComment {
  id: number;
  body: string | null;
  user?: { login?: string };
  createdAt?: string;
}

export interface ParsedBugbotFindingComments {
  /** Full bodies for issue-comment read-modify-write operations. */
  issueComments: BugbotComment[];
  existingByFindingId: ExistingByFindingId;
  /** Prompt-bounded PR bodies keyed by canonical finding ID. */
  prFindingIdToBody: Record<string, string>;
}

export function parseBugbotFindingComments(
  issueComments: BugbotComment[],
  pullRequestCommentsByNumber: ReadonlyMap<
    number,
    PullRequestReviewComment[]
  >,
  trustedAuthorLogin?: string,
  reviewThreadStatesByPullRequest: ReadonlyMap<number, Readonly<Record<string, PullRequestReviewThreadState>>> = new Map(),
): ParsedBugbotFindingComments {
  const existingByFindingId = parseIssueFindingMarkers(issueComments, trustedAuthorLogin);
  const pullRequestFindings = parsePullRequestFindingMarkers(
    pullRequestCommentsByNumber,
    trustedAuthorLogin,
    reviewThreadStatesByPullRequest,
  );
  mergeFindingContexts(existingByFindingId, pullRequestFindings.existingByFindingId);
  return {
    issueComments,
    existingByFindingId,
    prFindingIdToBody: pullRequestFindings.prFindingIdToBody,
  };
}

function parseIssueFindingMarkers(issueComments: BugbotComment[], trustedAuthorLogin?: string): ExistingByFindingId {
  const findings: ExistingByFindingId = {};
  for (const comment of issueComments) {
    if (!isTrustedAuthor(comment.user?.login, trustedAuthorLogin)) continue;
    for (const marker of parseMarker(comment.body)) {
      const findingId = normalizeFindingIdForMarker(marker.findingId);
      if (findingId == null) continue;
      findings[findingId] = {
        ...(findings[findingId] ?? {}),
        issue: {
          commentId: comment.id,
          resolved: marker.resolved,
          ...(marker.fingerprint ? { fingerprint: marker.fingerprint } : {}),
          ...(marker.semanticFingerprint ? { semanticFingerprint: marker.semanticFingerprint } : {}),
          ...(marker.resolution ? { resolution: marker.resolution } : {}),
        },
      };
    }
  }
  return findings;
}

function parsePullRequestFindingMarkers(
  pullRequestCommentsByNumber: ReadonlyMap<number, PullRequestReviewComment[]>,
  trustedAuthorLogin?: string,
  reviewThreadStatesByPullRequest: ReadonlyMap<number, Readonly<Record<string, PullRequestReviewThreadState>>> = new Map(),
): { existingByFindingId: ExistingByFindingId; prFindingIdToBody: Record<string, string> } {
  const existingByFindingId: ExistingByFindingId = {};
  const prFindingIdToBody: Record<string, string> = {};
  for (const [pullRequestNumber, comments] of pullRequestCommentsByNumber) {
    parsePullRequestComments(
      comments,
      pullRequestNumber,
      existingByFindingId,
      prFindingIdToBody,
      trustedAuthorLogin,
      reviewThreadStatesByPullRequest.get(pullRequestNumber),
    );
  }
  return { existingByFindingId, prFindingIdToBody };
}

function parsePullRequestComments(
  comments: PullRequestReviewComment[],
  pullRequestNumber: number,
  existingByFindingId: ExistingByFindingId,
  prFindingIdToBody: Record<string, string>,
  trustedAuthorLogin?: string,
  reviewThreadStates: Readonly<Record<string, PullRequestReviewThreadState>> = {},
): void {
  for (const comment of comments) {
    if (!isTrustedAuthor(comment.authorLogin, trustedAuthorLogin)) continue;
    const body = comment.body ?? "";
    for (const marker of parseMarker(body)) {
      const findingId = normalizeFindingIdForMarker(marker.findingId);
      if (findingId == null) continue;
      const thread = reviewThreadStates[comment.identity];
      const threadResolved = thread?.resolved;
      const manuallyResolved = threadResolved === true && !marker.resolved
        && isHumanResolver(thread.resolvedByLogin, trustedAuthorLogin);
      const verificationRequired = (marker.resolved && threadResolved === false)
        || (!marker.resolved && threadResolved === true && !manuallyResolved);
      existingByFindingId[findingId] = {
        ...(existingByFindingId[findingId] ?? {}),
        pullRequest: {
          commentIdentity: comment.identity,
          pullRequestNumber,
          resolved: marker.resolved || manuallyResolved,
          ...(typeof threadResolved === 'boolean' ? { threadResolved } : {}),
          ...(thread?.resolvedByLogin ? { threadResolvedByLogin: thread.resolvedByLogin } : {}),
          ...(comment.parentReviewIdentity ? { parentReviewIdentity: comment.parentReviewIdentity } : {}),
          ...(comment.url ? { url: comment.url } : {}),
          ...(verificationRequired ? { verificationRequired: true } : {}),
          ...(marker.fingerprint ? { fingerprint: marker.fingerprint } : {}),
          ...(marker.semanticFingerprint ? { semanticFingerprint: marker.semanticFingerprint } : {}),
          ...(marker.resolution
            ? { resolution: marker.resolution }
            : manuallyResolved
              ? { resolution: 'dismissed' as const }
              : {}),
        },
      };
      prFindingIdToBody[findingId] = truncateFindingBody(body, MAX_FINDING_BODY_LENGTH);
    }
  }
}

function isTrustedAuthor(authorLogin: string | undefined, trustedAuthorLogin: string | undefined): boolean {
  if (!trustedAuthorLogin?.trim() || !authorLogin?.trim()) return false;
  return githubUsersMatch(authorLogin ?? '', trustedAuthorLogin);
}

function mergeFindingContexts(target: ExistingByFindingId, source: ExistingByFindingId): void {
  for (const [findingId, context] of Object.entries(source)) {
    target[findingId] = { ...(target[findingId] ?? {}), ...context };
  }
}

export function collectPreviousBugbotFindings(
  issueComments: BugbotComment[],
  existingByFindingId: ExistingByFindingId,
  prFindingIdToBody: Record<string, string>,
): PreviousBugbotFinding[] {
  return Object.entries(existingByFindingId).flatMap(([findingId, data]) => {
    if (isExistingFindingFullyResolved(data)) return [];
    const issueComment = data.issue != null && !data.issue.resolved
      ? issueComments.find((comment) => comment.id === data.issue?.commentId)
      : undefined;
    const issueBody =
      issueComment != null
        ? (issueComment.body ?? null)
        : null;
    const pullRequestBody =
      data.pullRequest != null && (!data.pullRequest.resolved || data.pullRequest.verificationRequired === true)
        ? (prFindingIdToBody[findingId] ?? null)
        : null;
    const rawBody = (issueBody ?? pullRequestBody ?? "").trim();
    return rawBody
      ? [
          {
            id: findingId,
            fullBody: truncateFindingBody(rawBody, MAX_FINDING_BODY_LENGTH),
            ...(issueComment?.createdAt ? { createdAt: issueComment.createdAt } : {}),
            ...(issueComment ? { providerId: `issue:${issueComment.id}` } : { providerId: `pull-request:${findingId}` }),
          },
        ]
      : [];
  });
}
