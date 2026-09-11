import type { Execution } from '../../../../../data/model/execution';
import type { BugbotContextPorts } from '../../../../ports/bugbot_context_ports';
import type { BugbotFindingPublicationPorts } from '../../../../ports/bugbot_finding_publication_ports';
import type {
  PullRequestReviewComment,
  PullRequestReviewSummary,
  PullRequestReviewThreadState,
} from '../../../../ports/pull_request_review_comment_ports';
import {
  buildBugbotReviewProjection,
  type BugbotProjectedFinding,
  type BugbotReviewProjection,
} from '../../../../../domain/bugbot/review_projection';
import {
  classifyBugbotFindingState,
  type BugbotFindingState,
} from '../../../../../domain/bugbot/review_state';
import {
  isBugbotStatusComment,
  renderBugbotReviewSnapshot,
  renderBugbotStatusCard,
} from '../../../../policies/bugbot_review_presentation_policy';
import { githubUsersMatch } from '../../../../../domain/github_user_policy';
import { extractTitleFromBody, parseMarker } from './marker';
import type { BugbotContext, BugbotFinding } from './types';
import { BUGBOT_MARKER_PREFIX } from '../../../../policies/bugbot_constants';
import { PullRequestReviewOperationError } from '../../../../ports/pull_request_review_errors';
import type { BugbotReviewNavigation } from '../../../../ports/bugbot_review_navigation_ports';

const MAX_REVIEW_UPDATES_PER_RUN = 20;

export interface BugbotPresentationReport {
  readonly projection: BugbotReviewProjection;
  readonly reviewUpdates: number;
  readonly pendingReviewUpdates: number;
  readonly statusCardOperation: 'created' | 'updated' | 'unchanged' | 'failed';
  readonly errors: readonly Error[];
}

/**
 * Re-reads GitHub after finding mutations and projects one verified state to
 * every durable PR surface. Intended mutation state is never presented as if
 * the provider had already accepted it.
 */
export async function reconcileBugbotReviewState(input: {
  execution: Execution;
  loadedContext: BugbotContext;
  activeFindings: readonly BugbotFinding[];
  /** Findings that this run attempted to persist; overflow-only items are excluded. */
  expectedPublishedFindings?: readonly BugbotFinding[];
  mutationErrors?: readonly Error[];
  contextPorts: BugbotContextPorts;
  publicationPorts: BugbotFindingPublicationPorts;
}): Promise<BugbotPresentationReport | undefined> {
  const pullRequestNumber = input.loadedContext.openPrNumbers[0];
  const analyzedHeadSha = input.loadedContext.prContext?.prHeadSha;
  if (!pullRequestNumber || !analyzedHeadSha) return undefined;

  const { execution } = input;
  const token = execution.tokens.token;
  const initialErrors = [...(input.mutationErrors ?? [])];
  const trustedAuthorAvailable = Boolean(execution.tokenUser?.trim());
  if (!trustedAuthorAvailable) {
    initialErrors.push(new Error('The authenticated Bugbot identity is unavailable.'));
  }
  const [headRead, commentsRead, threadStatesRead, reviewsRead, conversationCommentsRead] =
    await Promise.allSettled([
      input.contextPorts.pullRequest.getPullRequestHeadSha(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        token,
      ),
      input.contextPorts.pullRequest.listPullRequestReviewComments(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        token,
      ),
      input.contextPorts.pullRequest.listPullRequestReviewThreadStates(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        token,
      ),
      input.contextPorts.reviewState.listPullRequestReviews(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        token,
      ),
      input.contextPorts.issue.listIssueComments(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        token,
      ),
    ]);

  if (headRead.status === 'rejected') {
    throw new PullRequestReviewOperationError('get-head-sha');
  }
  const headSha = headRead.value;

  if (!headSha || headSha !== analyzedHeadSha) {
    return {
      projection: buildBugbotReviewProjection({
        pullRequestNumber,
        analyzedHeadSha,
        verifiedHeadSha: headSha ?? analyzedHeadSha,
        findings: [],
        superseded: true,
      }),
      reviewUpdates: 0,
      pendingReviewUpdates: 0,
      statusCardOperation: 'unchanged',
      errors: [],
    };
  }
  const comments = settledRead(
    commentsRead,
    [],
    initialErrors,
    'Unable to re-read pull request review comments.',
  );
  const threadStates = settledRead(
    threadStatesRead,
    {},
    initialErrors,
    'Unable to re-read pull request review thread state.',
  );
  const reviews = settledRead(
    reviewsRead,
    [],
    initialErrors,
    'Unable to re-read pull request reviews.',
  );
  const conversationComments = settledRead(
    conversationCommentsRead,
    [],
    initialErrors,
    'Unable to re-read the pull request conversation.',
  );
  let links: BugbotReviewNavigation | undefined;
  try {
    links = input.contextPorts.navigation.forPullRequest(
      execution.owner,
      execution.repo,
      pullRequestNumber,
      headSha,
    );
  } catch {
    initialErrors.push(new Error('Unable to build safe Bugbot navigation links.'));
  }
  const projectedFindings = projectProviderFindings({
    comments,
    reviews,
    threadStates,
    trustedAuthorLogin: execution.tokenUser,
    activeFindings: input.activeFindings,
    loadedContext: input.loadedContext,
    threadStateAvailable: threadStatesRead.status === 'fulfilled',
    trustedPullRequestUrl: links?.pullRequestUrl,
  });
  if (projectedFindings.some((finding) =>
    finding.state === 'unknown' && finding.id.startsWith('malformed-'))) {
    initialErrors.push(new Error('A trusted Bugbot finding marker is malformed.'));
  }
  const projectedIds = new Set(projectedFindings.map((finding) => finding.id));
  const expectedPublishedFindings = input.expectedPublishedFindings ?? input.activeFindings;
  const expectedPublishedIds = new Set(expectedPublishedFindings.map((finding) => finding.id));
  for (const finding of expectedPublishedFindings) {
    if (projectedIds.has(finding.id)) continue;
    projectedFindings.push({
      id: finding.id,
      state: 'unknown',
      title: finding.title,
    });
    initialErrors.push(
      new Error(`Published finding ${finding.id} is not yet observable from GitHub.`),
    );
    projectedIds.add(finding.id);
  }
  for (const finding of input.activeFindings) {
    if (projectedIds.has(finding.id) || expectedPublishedIds.has(finding.id)) continue;
    projectedFindings.push({
      id: finding.id,
      state: 'open',
      title: finding.title,
    });
    projectedIds.add(finding.id);
  }
  let projection = buildBugbotReviewProjection({
    pullRequestNumber,
    analyzedHeadSha,
    verifiedHeadSha: headSha,
    findings: projectedFindings,
    errors: initialErrors.map(toSafeOperationMessage),
  });
  if (!links) {
    return {
      projection,
      reviewUpdates: 0,
      pendingReviewUpdates: 0,
      statusCardOperation: 'failed',
      errors: initialErrors,
    };
  }
  const ownedReviews = findOwnedReviews(
    reviews,
    comments,
    execution.tokenUser,
    projectedFindings,
  );
  let reviewUpdates = 0;
  const reviewErrors: Error[] = [];
  const reviewsToUpdate = ownedReviews.filter(({ review, findings }) => {
    const rendered = renderBugbotReviewSnapshot(review.body, {
      reviewIdentity: review.identity,
      analyzedHeadSha: review.commitId ?? analyzedHeadSha,
      currentHeadSha: headSha,
      projectionDigest: projection.digest,
      findings,
      locale: execution.locale?.pullRequest ?? 'en-US',
      statusUrl: links.pullRequestUrl,
    });
    return rendered !== review.body;
  });

  for (const { review, findings } of reviewsToUpdate.slice(0, MAX_REVIEW_UPDATES_PER_RUN)) {
    const rendered = renderBugbotReviewSnapshot(review.body, {
      reviewIdentity: review.identity,
      analyzedHeadSha: review.commitId ?? analyzedHeadSha,
      currentHeadSha: headSha,
      projectionDigest: projection.digest,
      findings,
      locale: execution.locale?.pullRequest ?? 'en-US',
      statusUrl: links.pullRequestUrl,
    });
    try {
      await input.publicationPorts.reviewState.updatePullRequestReview(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        review.identity,
        rendered,
        token,
      );
      reviewUpdates += 1;
    } catch {
      reviewErrors.push(new Error(`Unable to update Bugbot review ${review.identity}.`));
    }
  }
  const pendingReviewUpdates = Math.max(
    0,
    reviewsToUpdate.length - MAX_REVIEW_UPDATES_PER_RUN,
  );
  if (pendingReviewUpdates > 0) {
    reviewErrors.push(
      new Error(
        `${pendingReviewUpdates} Bugbot review status block(s) remain pending; run /copilot recheck.`,
      ),
    );
  }

  projection = buildBugbotReviewProjection({
    pullRequestNumber,
    analyzedHeadSha,
    verifiedHeadSha: headSha,
    findings: projectedFindings,
    errors: [...initialErrors, ...reviewErrors].map(toSafeOperationMessage),
  });
  const statusBody = renderBugbotStatusCard(
    projection,
    execution.locale?.pullRequest ?? 'en-US',
    links,
  );
  const trustedStatusComments = conversationComments
    .filter(
      (comment) =>
        isTrustedAuthor(comment.user?.login, execution.tokenUser) &&
        isBugbotStatusComment(comment.body),
    )
    .sort((left, right) => left.id - right.id);
  let statusCardOperation: BugbotPresentationReport['statusCardOperation'] = 'unchanged';
  const statusErrors: Error[] = [];
  try {
    if (!trustedAuthorAvailable || conversationCommentsRead.status === 'rejected') {
      throw new Error('The canonical status card cannot be adopted safely.');
    }
    const canonical = trustedStatusComments[0];
    if (!canonical) {
      await input.publicationPorts.issueComments.addComment(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        statusBody,
        token,
        { commitSha: headSha },
      );
      statusCardOperation = 'created';
    } else if (!canonical.body?.startsWith(statusBody)) {
      await input.publicationPorts.issueComments.updateComment(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        canonical.id,
        statusBody,
        token,
        { commitSha: headSha },
      );
      statusCardOperation = 'updated';
    }
    for (const duplicate of trustedStatusComments.slice(1)) {
      await input.publicationPorts.issueComments.updateComment(
        execution.owner,
        execution.repo,
        pullRequestNumber,
        duplicate.id,
        [
          '## 🤖 Bugbot status moved',
          '',
          `This duplicate status card is no longer current. [Use the canonical PR status](${links.pullRequestUrl}).`,
        ].join('\n'),
        token,
        { commitSha: headSha },
      );
      statusCardOperation = 'updated';
    }
  } catch {
    statusCardOperation = 'failed';
    statusErrors.push(
      new Error('Unable to create or update the canonical Bugbot PR status card.'),
    );
  }

  const errors = [...initialErrors, ...reviewErrors, ...statusErrors];
  if (statusErrors.length > 0) {
    projection = buildBugbotReviewProjection({
      pullRequestNumber,
      analyzedHeadSha,
      verifiedHeadSha: headSha,
      findings: projectedFindings,
      errors: errors.map(toSafeOperationMessage),
    });
  }
  return {
    projection,
    reviewUpdates,
    pendingReviewUpdates,
    statusCardOperation,
    errors,
  };
}

function projectProviderFindings(input: {
  comments: readonly PullRequestReviewComment[];
  reviews: readonly PullRequestReviewSummary[];
  threadStates: Readonly<Record<string, PullRequestReviewThreadState>>;
  trustedAuthorLogin?: string;
  activeFindings: readonly BugbotFinding[];
  loadedContext: BugbotContext;
  threadStateAvailable: boolean;
  trustedPullRequestUrl?: string;
}): BugbotProjectedFinding[] {
  const activeById = new Map(input.activeFindings.map((finding) => [finding.id, finding]));
  const projected = new Map<string, BugbotProjectedFinding>();
  for (const comment of input.comments) {
    if (!isTrustedAuthor(comment.authorLogin, input.trustedAuthorLogin)) continue;
    const markers = parseMarker(comment.body);
    const commentUrl = safeProviderUrl(comment.url, input.trustedPullRequestUrl);
    if (markers.length === 0 && containsBugbotFindingMarkerSyntax(comment.body)) {
      projected.set(`malformed-comment-${comment.identity}`, {
        id: `malformed-comment-${comment.identity}`,
        state: 'unknown',
        title: 'Malformed Bugbot finding marker',
        ...(commentUrl ? { url: commentUrl } : {}),
        ...(comment.parentReviewIdentity
          ? { parentReviewIdentity: comment.parentReviewIdentity }
          : {}),
      });
    }
    for (const marker of markers) {
      const before = input.loadedContext.existingByFindingId[marker.findingId];
      const state = providerState({
        markerResolved: marker.resolved,
        resolution: marker.resolution,
        thread: input.threadStates[comment.identity],
        threadStateAvailable: input.threadStateAvailable,
        trustedAuthorLogin: input.trustedAuthorLogin,
        currentAnalysisReportsFinding: activeById.has(marker.findingId),
        reopened: activeById.has(marker.findingId) &&
          [before?.issue, before?.pullRequest].some((destination) => destination?.resolved),
      });
      const active = activeById.get(marker.findingId);
      projected.set(marker.findingId, {
        id: marker.findingId,
        state,
        title: active?.title ?? extractTitleFromBody(comment.body) ?? marker.findingId,
        ...(commentUrl ? { url: commentUrl } : {}),
        ...(comment.parentReviewIdentity
          ? { parentReviewIdentity: comment.parentReviewIdentity }
          : {}),
      });
    }
  }
  for (const review of input.reviews) {
    if (!isTrustedAuthor(review.authorLogin, input.trustedAuthorLogin)) continue;
    const markers = parseMarker(review.body);
    const reviewUrl = safeProviderUrl(review.url, input.trustedPullRequestUrl);
    if (markers.length === 0 && containsBugbotFindingMarkerSyntax(review.body)) {
      projected.set(`malformed-review-${review.identity}`, {
        id: `malformed-review-${review.identity}`,
        state: 'unknown',
        title: 'Malformed Bugbot finding marker',
        ...(reviewUrl ? { url: reviewUrl } : {}),
        parentReviewIdentity: review.identity,
      });
    }
    for (const marker of markers) {
      if (projected.has(marker.findingId)) continue;
      projected.set(marker.findingId, {
        id: marker.findingId,
        state: marker.resolved ? marker.resolution ?? 'fixed' : 'open',
        title: activeById.get(marker.findingId)?.title ?? marker.findingId,
        ...(reviewUrl ? { url: reviewUrl } : {}),
        parentReviewIdentity: review.identity,
      });
    }
  }
  return [...projected.values()];
}

function providerState(input: {
  markerResolved: boolean;
  resolution?: 'fixed' | 'obsolete' | 'dismissed';
  thread?: PullRequestReviewThreadState;
  threadStateAvailable: boolean;
  trustedAuthorLogin?: string;
  currentAnalysisReportsFinding: boolean;
  reopened: boolean;
}): BugbotFindingState {
  if (!input.threadStateAvailable) return 'unknown';
  return classifyBugbotFindingState({
    markerResolved: input.markerResolved,
    ...(input.resolution ? { markerResolution: input.resolution } : {}),
    ...(input.thread ? { thread: input.thread } : {}),
    ...(input.trustedAuthorLogin ? { botLogin: input.trustedAuthorLogin } : {}),
    currentAnalysisReportsFinding: input.currentAnalysisReportsFinding,
    wasResolvedBeforeCurrentAnalysis: input.reopened,
  });
}

function findOwnedReviews(
  reviews: readonly PullRequestReviewSummary[],
  comments: readonly PullRequestReviewComment[],
  trustedAuthorLogin: string | undefined,
  findings: readonly BugbotProjectedFinding[],
): Array<{ review: PullRequestReviewSummary; findings: BugbotProjectedFinding[] }> {
  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  const childFindingIds = new Map<string, Set<string>>();
  for (const comment of comments) {
    if (
      !comment.parentReviewIdentity ||
      !isTrustedAuthor(comment.authorLogin, trustedAuthorLogin)
    ) continue;
    const ids = childFindingIds.get(comment.parentReviewIdentity) ?? new Set<string>();
    for (const marker of parseMarker(comment.body)) ids.add(marker.findingId);
    childFindingIds.set(comment.parentReviewIdentity, ids);
  }
  return reviews.flatMap((review) => {
    if (!isTrustedAuthor(review.authorLogin, trustedAuthorLogin)) return [];
    const ids = childFindingIds.get(review.identity) ?? new Set<string>();
    for (const marker of parseMarker(review.body)) ids.add(marker.findingId);
    if (ids.size === 0) return [];
    return [{
      review,
      findings: [...ids]
        .map((id) => findingById.get(id))
        .filter((finding): finding is BugbotProjectedFinding => finding !== undefined),
    }];
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
  return Boolean(
    authorLogin?.trim() &&
      trustedAuthorLogin?.trim() &&
      githubUsersMatch(authorLogin ?? '', trustedAuthorLogin ?? ''),
  );
}

function toSafeOperationMessage(error: Error): string {
  return error.message.slice(0, 500);
}

function containsBugbotFindingMarkerSyntax(body: string | null): boolean {
  if (!body) return false;
  return new RegExp(`<!--\\s*${BUGBOT_MARKER_PREFIX}\\s+finding_id`, 'u').test(body);
}

function settledRead<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  errors: Error[],
  safeMessage: string,
): T {
  if (result.status === 'fulfilled') return result.value;
  errors.push(new Error(safeMessage));
  return fallback;
}
