import type {
  BugbotPresentationReport,
  BugbotReconciliationPlan,
  BugbotReconciliationSnapshot,
  BugbotReconciliationTarget,
} from '../../../../contracts/bugbot_reconciliation';
import type { BugbotPresentationMutationPorts } from '../../../../ports/bugbot_reconciliation_ports';
import type { BugbotReviewNavigation } from '../../../../ports/bugbot_review_navigation_ports';
import {
  isBugbotStatusComment,
  renderBugbotReviewSnapshot,
  renderBugbotStatusCard,
} from '../../../../policies/bugbot_review_presentation_policy';
import {
  isTrustedBugbotAuthor,
  selectOwnedBugbotReviews,
  type OwnedBugbotReview,
} from '../../../../policies/bugbot_review_ownership_policy';
import { buildBugbotReviewProjection } from '../../../../../domain/bugbot/review_projection';

const MAX_REVIEW_UPDATES_PER_RUN = 20;
const REVIEW_UPDATE_CONCURRENCY = 4;

export type { BugbotPresentationMutationPorts } from '../../../../ports/bugbot_reconciliation_ports';

interface PlannedReviewUpdate {
  readonly ownedReview: OwnedBugbotReview;
  readonly body: string;
}

export interface BugbotPresentationSynchronizationInput {
  readonly target: BugbotReconciliationTarget;
  readonly snapshot: BugbotReconciliationSnapshot;
  readonly plan: BugbotReconciliationPlan;
  readonly ports: BugbotPresentationMutationPorts;
}

/**
 * Synchronizes only user-facing durable presentation. It receives a completed
 * semantic plan and has no responsibility for provider reads or lifecycle
 * classification.
 */
export async function synchronizeBugbotReviewPresentation(
  input: BugbotPresentationSynchronizationInput,
): Promise<BugbotPresentationReport> {
  const initialErrors = input.plan.diagnostics.map((message) => new Error(message));
  let projection = buildProjection(input, initialErrors);
  const navigation = input.snapshot.navigation;
  if (!navigation) {
    return report(projection, 0, 0, 'failed', initialErrors);
  }

  const plannedReviewUpdates = planReviewUpdates(input, projection, navigation);
  const selectedReviewUpdates = plannedReviewUpdates.slice(0, MAX_REVIEW_UPDATES_PER_RUN);
  const reviewWriteResults = await mapWithConcurrency(
    selectedReviewUpdates,
    REVIEW_UPDATE_CONCURRENCY,
    async ({ ownedReview, body }) => {
      await input.ports.updatePullRequestReview(
        input.target.pullRequestNumber,
        ownedReview.review.identity,
        body,
      );
    },
  );
  const reviewUpdates = reviewWriteResults.filter((result) => result === 'fulfilled').length;
  const reviewErrors = reviewWriteResults.flatMap((result, index) =>
    result === 'rejected'
      ? [new Error(
          `Unable to update Bugbot review ${selectedReviewUpdates[index].ownedReview.review.identity}.`,
        )]
      : [],
  );
  const pendingReviewUpdates = Math.max(
    0,
    plannedReviewUpdates.length - MAX_REVIEW_UPDATES_PER_RUN,
  );
  if (pendingReviewUpdates > 0) {
    reviewErrors.push(new Error(
      `${pendingReviewUpdates} Bugbot review status block(s) remain pending; run /copilot recheck.`,
    ));
  }

  const errorsBeforeStatus = [...initialErrors, ...reviewErrors];
  projection = buildProjection(input, errorsBeforeStatus);
  const statusResult = await synchronizeStatusCard(input, projection, navigation);
  const errors = [...errorsBeforeStatus, ...statusResult.errors];
  if (statusResult.errors.length > 0) projection = buildProjection(input, errors);
  return report(
    projection,
    reviewUpdates,
    pendingReviewUpdates,
    statusResult.operation,
    errors,
  );
}

function planReviewUpdates(
  input: BugbotPresentationSynchronizationInput,
  projection: BugbotPresentationReport['projection'],
  navigation: BugbotReviewNavigation,
): PlannedReviewUpdate[] {
  return selectOwnedBugbotReviews({
    reviews: input.snapshot.reviews,
    comments: input.snapshot.pullRequestComments,
    trustedAuthorLogin: input.target.trustedAuthorLogin,
    findings: input.plan.findings,
  }).flatMap((ownedReview) => {
    const body = renderBugbotReviewSnapshot(ownedReview.review.body, {
      reviewIdentity: ownedReview.review.identity,
      analyzedHeadSha: ownedReview.review.commitId ?? input.target.analyzedHeadSha,
      currentHeadSha: input.snapshot.verifiedHeadSha,
      projectionDigest: projection.digest,
      coverageStatus: projection.coverage.status,
      findings: ownedReview.findings,
      locale: input.target.locale,
      statusUrl: navigation.pullRequestUrl,
    });
    return body === ownedReview.review.body ? [] : [{ ownedReview, body }];
  });
}

async function synchronizeStatusCard(
  input: BugbotPresentationSynchronizationInput,
  projection: BugbotPresentationReport['projection'],
  navigation: BugbotReviewNavigation,
): Promise<{
  readonly operation: BugbotPresentationReport['statusCardOperation'];
  readonly errors: readonly Error[];
}> {
  if (
    !input.target.trustedAuthorLogin?.trim()
    || input.snapshot.completeness.conversation !== 'verified'
  ) {
    return statusFailure();
  }
  const statusBody = renderBugbotStatusCard(projection, input.target.locale, navigation);
  const trustedStatusComments = input.snapshot.conversationComments
    .filter((comment) =>
      isTrustedBugbotAuthor(comment.user?.login, input.target.trustedAuthorLogin)
      && isBugbotStatusComment(comment.body),
    )
    .sort((left, right) => left.id - right.id);

  let operation: BugbotPresentationReport['statusCardOperation'] = 'unchanged';
  let failed = false;
  const canonical = trustedStatusComments[0];
  try {
    if (!canonical) {
      await input.ports.comments.addComment(
        input.target.pullRequestNumber,
        statusBody,
        { commitSha: input.snapshot.verifiedHeadSha },
      );
      operation = 'created';
    } else if (!canonical.body?.startsWith(statusBody)) {
      await input.ports.comments.updateComment(
        input.target.pullRequestNumber,
        canonical.id,
        statusBody,
        { commitSha: input.snapshot.verifiedHeadSha },
      );
      operation = 'updated';
    }
  } catch {
    failed = true;
  }

  const duplicateResults = await mapWithConcurrency(
    trustedStatusComments.slice(1),
    REVIEW_UPDATE_CONCURRENCY,
    async (duplicate) => {
      await input.ports.comments.updateComment(
        input.target.pullRequestNumber,
        duplicate.id,
        [
          '## 🤖 Bugbot status moved',
          '',
          `This duplicate status card is no longer current. [Use the canonical PR status](${navigation.pullRequestUrl}).`,
        ].join('\n'),
        { commitSha: input.snapshot.verifiedHeadSha },
      );
    },
  );
  if (duplicateResults.includes('rejected')) failed = true;
  if (duplicateResults.includes('fulfilled')) operation = 'updated';
  return failed ? statusFailure() : { operation, errors: [] };
}

function buildProjection(
  input: BugbotPresentationSynchronizationInput,
  errors: readonly Error[],
): BugbotPresentationReport['projection'] {
  return buildBugbotReviewProjection({
    pullRequestNumber: input.target.pullRequestNumber,
    analyzedHeadSha: input.target.analyzedHeadSha,
    verifiedHeadSha: input.snapshot.verifiedHeadSha,
    findings: input.plan.findings,
    coverage: input.plan.coverage,
    errors: errors.map((error) => error.message.slice(0, 500)),
  });
}

function statusFailure(): {
  readonly operation: 'failed';
  readonly errors: readonly Error[];
} {
  return {
    operation: 'failed',
    errors: [new Error('Unable to create or update the canonical Bugbot PR status card.')],
  };
}

function report(
  projection: BugbotPresentationReport['projection'],
  reviewUpdates: number,
  pendingReviewUpdates: number,
  statusCardOperation: BugbotPresentationReport['statusCardOperation'],
  errors: readonly Error[],
): BugbotPresentationReport {
  return {
    projection,
    reviewUpdates,
    pendingReviewUpdates,
    statusCardOperation,
    errors,
  };
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<Array<'fulfilled' | 'rejected'>> {
  const results = Array<'fulfilled' | 'rejected'>(values.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await operation(values[index]);
        results[index] = 'fulfilled';
      } catch {
        results[index] = 'rejected';
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}
