import type { BugbotReconciliationSnapshot } from '../contracts/bugbot_reconciliation';
import { extractTitleFromBody, parseMarker } from './bugbot_finding_marker_policy';
import { BUGBOT_MARKER_PREFIX } from './bugbot_constants';
import { githubUsersMatch } from '../../domain/github_user_policy';
import type {
  BugbotFinding,
  ExistingByFindingId,
} from '../../domain/bugbot/finding';
import type { BugbotProjectedFinding } from '../../domain/bugbot/review_projection';
import {
  classifyBugbotFindingState,
  type BugbotFindingState,
} from '../../domain/bugbot/review_state';

export interface BugbotObservedFindingDestinations {
  readonly issueFindingIds: ReadonlySet<string>;
  readonly pullRequestFindingIds: ReadonlySet<string>;
}

export interface BugbotProviderProjection {
  readonly findings: readonly BugbotProjectedFinding[];
  readonly observed: BugbotObservedFindingDestinations;
  readonly malformedEvidence: boolean;
}

/**
 * Converts a provider snapshot into semantic finding evidence. Issue and PR
 * destinations are projected independently and then folded conservatively, so
 * a clean destination can never hide a non-clean one.
 */
export function projectBugbotProviderEvidence(input: {
  readonly snapshot: BugbotReconciliationSnapshot;
  readonly trustedAuthorLogin?: string;
  readonly activeFindings: readonly BugbotFinding[];
  readonly existingByFindingId: ExistingByFindingId;
}): BugbotProviderProjection {
  const activeById = new Map(input.activeFindings.map((finding) => [finding.id, finding]));
  const issueFindings = new Map<string, BugbotProjectedFinding>();
  const pullRequestFindings = new Map<string, BugbotProjectedFinding>();
  const malformedFindings = new Map<string, BugbotProjectedFinding>();
  const issueFindingIds = new Set<string>();
  const pullRequestFindingIds = new Set<string>();

  for (const comment of input.snapshot.linkedIssueComments) {
    if (!isTrustedAuthor(comment.user?.login, input.trustedAuthorLogin)) continue;
    const markers = parseMarker(comment.body);
    if (markers.length === 0 && containsBugbotFindingMarkerSyntax(comment.body)) {
      const id = `malformed-issue-comment-${comment.id}`;
      malformedFindings.set(id, malformedFinding(id));
    }
    for (const marker of markers) {
      issueFindingIds.add(marker.findingId);
      const active = activeById.get(marker.findingId);
      const previous = input.existingByFindingId[marker.findingId];
      issueFindings.set(marker.findingId, {
        id: marker.findingId,
        state: classifyBugbotFindingState({
          markerResolved: marker.resolved,
          ...(marker.resolution ? { markerResolution: marker.resolution } : {}),
          currentAnalysisReportsFinding: active !== undefined,
          wasResolvedBeforeCurrentAnalysis:
            active !== undefined && previous?.issue?.resolved === true,
        }),
        title: active?.title || extractTitleFromBody(comment.body) || marker.findingId,
      });
    }
  }

  for (const comment of input.snapshot.pullRequestComments) {
    if (!isTrustedAuthor(comment.authorLogin, input.trustedAuthorLogin)) continue;
    const markers = parseMarker(comment.body);
    const url = safeProviderUrl(comment.url, input.snapshot.navigation?.pullRequestUrl);
    if (markers.length === 0 && containsBugbotFindingMarkerSyntax(comment.body)) {
      const id = `malformed-comment-${comment.identity}`;
      malformedFindings.set(id, malformedFinding(id, {
        ...(url ? { url } : {}),
        ...(comment.parentReviewIdentity
          ? { parentReviewIdentity: comment.parentReviewIdentity }
          : {}),
      }));
    }
    for (const marker of markers) {
      pullRequestFindingIds.add(marker.findingId);
      const active = activeById.get(marker.findingId);
      const previous = input.existingByFindingId[marker.findingId];
      pullRequestFindings.set(marker.findingId, {
        id: marker.findingId,
        state: projectPullRequestState({
          markerResolved: marker.resolved,
          resolution: marker.resolution,
          thread: input.snapshot.reviewThreads[comment.identity],
          threadStateAvailable: input.snapshot.completeness.reviewThreads === 'verified',
          trustedAuthorLogin: input.trustedAuthorLogin,
          currentAnalysisReportsFinding: active !== undefined,
          reopened: active !== undefined
            && [previous?.issue, previous?.pullRequest]
              .some((destination) => destination?.resolved),
        }),
        title: active?.title || extractTitleFromBody(comment.body) || marker.findingId,
        ...(url ? { url } : {}),
        ...(comment.parentReviewIdentity
          ? { parentReviewIdentity: comment.parentReviewIdentity }
          : {}),
      });
    }
  }

  for (const review of input.snapshot.reviews) {
    if (!isTrustedAuthor(review.authorLogin, input.trustedAuthorLogin)) continue;
    const markers = parseMarker(review.body);
    const url = safeProviderUrl(review.url, input.snapshot.navigation?.pullRequestUrl);
    if (markers.length === 0 && containsBugbotFindingMarkerSyntax(review.body)) {
      const id = `malformed-review-${review.identity}`;
      malformedFindings.set(id, malformedFinding(id, {
        ...(url ? { url } : {}),
        parentReviewIdentity: review.identity,
      }));
    }
    for (const marker of markers) {
      pullRequestFindingIds.add(marker.findingId);
      if (pullRequestFindings.has(marker.findingId)) continue;
      pullRequestFindings.set(marker.findingId, {
        id: marker.findingId,
        state: marker.resolved ? marker.resolution ?? 'fixed' : 'open',
        title: activeById.get(marker.findingId)?.title ?? marker.findingId,
        ...(url ? { url } : {}),
        parentReviewIdentity: review.identity,
      });
    }
  }

  const findings = new Map<string, BugbotProjectedFinding>(malformedFindings);
  for (const [findingId, issue] of issueFindings) {
    findings.set(findingId, issue);
  }
  for (const [findingId, pullRequest] of pullRequestFindings) {
    const issue = issueFindings.get(findingId);
    findings.set(
      findingId,
      issue ? mergeDestinationFindings(issue, pullRequest) : pullRequest,
    );
  }

  return {
    findings: [...findings.values()],
    observed: { issueFindingIds, pullRequestFindingIds },
    malformedEvidence: malformedFindings.size > 0,
  };
}

const STATE_PRIORITY: Readonly<Record<BugbotFindingState, number>> = {
  unknown: 7,
  'verification-required': 6,
  reopened: 5,
  open: 4,
  dismissed: 3,
  obsolete: 2,
  fixed: 1,
};

function mergeDestinationFindings(
  issue: BugbotProjectedFinding,
  pullRequest: BugbotProjectedFinding,
): BugbotProjectedFinding {
  return {
    ...issue,
    ...pullRequest,
    state: STATE_PRIORITY[issue.state] >= STATE_PRIORITY[pullRequest.state]
      ? issue.state
      : pullRequest.state,
  };
}

function malformedFinding(
  id: string,
  metadata: Pick<BugbotProjectedFinding, 'url' | 'parentReviewIdentity'> = {},
): BugbotProjectedFinding {
  return {
    id,
    state: 'unknown',
    title: 'Malformed Bugbot finding marker',
    ...metadata,
  };
}

function projectPullRequestState(input: {
  readonly markerResolved: boolean;
  readonly resolution?: 'fixed' | 'obsolete' | 'dismissed';
  readonly thread?: { readonly resolved: boolean; readonly resolvedByLogin?: string };
  readonly threadStateAvailable: boolean;
  readonly trustedAuthorLogin?: string;
  readonly currentAnalysisReportsFinding: boolean;
  readonly reopened: boolean;
}): BugbotFindingState {
  if (!input.threadStateAvailable) return 'unknown';
  return classifyBugbotFindingState({
    markerResolved: input.markerResolved,
    ...(input.resolution ? { markerResolution: input.resolution } : {}),
    thread: input.thread,
    botLogin: input.trustedAuthorLogin,
    currentAnalysisReportsFinding: input.currentAnalysisReportsFinding,
    wasResolvedBeforeCurrentAnalysis: input.reopened,
  });
}

function safeProviderUrl(
  value: string | undefined,
  trustedPullRequestUrl: string | undefined,
): string | undefined {
  if (!value || value.length > 2_000 || !trustedPullRequestUrl) return undefined;
  try {
    const url = new URL(value);
    const trusted = new URL(trustedPullRequestUrl);
    const repositoryPath = trusted.pathname.replace(/\/pull\/\d+\/?$/u, '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.origin !== trusted.origin ||
      (url.pathname !== repositoryPath && !url.pathname.startsWith(`${repositoryPath}/`))
    ) {
      return undefined;
    }
    return url.toString().replace(/\(/gu, '%28').replace(/\)/gu, '%29');
  } catch {
    return undefined;
  }
}

function isTrustedAuthor(
  authorLogin: string | undefined,
  trustedAuthorLogin: string | undefined,
): boolean {
  if (!authorLogin?.trim() || !trustedAuthorLogin?.trim()) return false;
  return githubUsersMatch(authorLogin, trustedAuthorLogin);
}

function containsBugbotFindingMarkerSyntax(body: string | null): boolean {
  if (!body) return false;
  return new RegExp(`<!--\\s*${BUGBOT_MARKER_PREFIX}\\s+finding_id`, 'u').test(body);
}
