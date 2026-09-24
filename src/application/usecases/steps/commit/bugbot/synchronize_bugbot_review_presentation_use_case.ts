import type {
  BugbotPresentationDiagnostic,
  BugbotPresentationReport,
  BugbotReconciliationPlan,
  BugbotReconciliationSnapshot,
  BugbotReconciliationTarget,
} from '../../../../contracts/bugbot_reconciliation';
import type { BugbotPresentationMutationPorts } from '../../../../ports/bugbot_reconciliation_ports';
import type { BugbotReviewNavigation } from '../../../../ports/bugbot_review_navigation_ports';
import { ApplicationError } from '../../../../errors/application_error';
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
import { buildDuplicateMarker } from '../../../../policies/publication_identity_policy';
import {
  bugbotDiagnosticOperatorMessage,
  renderBugbotDiagnostic,
  resolveStaticBugbotCatalog,
  type BugbotMessageCatalog,
} from '../../../../policies/bugbot_message_catalog';

const REVIEW_UPDATE_BATCH_SIZE = 20;
const MAX_REVIEW_UPDATES_PER_RUN = 100;
const REVIEW_UPDATE_CONCURRENCY = 4;

export type { BugbotPresentationMutationPorts } from '../../../../ports/bugbot_reconciliation_ports';

interface PlannedReviewUpdate {
  readonly ownedReview: OwnedBugbotReview;
  readonly body: string;
}

interface PresentationFailure {
  readonly diagnostic: BugbotPresentationDiagnostic;
  readonly error: Error;
}

export interface BugbotPresentationSynchronizationInput {
  readonly target: BugbotReconciliationTarget;
  readonly snapshot: BugbotReconciliationSnapshot;
  readonly plan: BugbotReconciliationPlan;
  readonly ports: BugbotPresentationMutationPorts;
  readonly catalog?: BugbotMessageCatalog;
}

/**
 * Synchronizes only user-facing durable presentation. It receives a completed
 * semantic plan and has no responsibility for provider reads or lifecycle
 * classification.
 */
export async function synchronizeBugbotReviewPresentation(
  input: BugbotPresentationSynchronizationInput,
): Promise<BugbotPresentationReport> {
  const catalog = input.catalog ?? resolveStaticBugbotCatalog(input.target.locale);
  const initialFailures = input.plan.diagnostics.map(toPresentationFailure);
  let projection = buildProjection(input, initialFailures, catalog);
  const navigation = input.snapshot.navigation;
  if (!navigation) {
    return report(projection, 0, 0, 'failed', initialFailures.map(({ error }) => error));
  }

  const plannedReviewUpdates = planReviewUpdates(input, projection, navigation, catalog);
  const selectedReviewUpdates = plannedReviewUpdates.slice(0, MAX_REVIEW_UPDATES_PER_RUN);
  let attemptedReviewUpdates = 0;
  let reviewUpdates = 0;
  const reviewFailures: PresentationFailure[] = [];
  for (let offset = 0; offset < selectedReviewUpdates.length; offset += REVIEW_UPDATE_BATCH_SIZE) {
    const batch = selectedReviewUpdates.slice(offset, offset + REVIEW_UPDATE_BATCH_SIZE);
    const results = await mapWithConcurrency(
      batch,
      REVIEW_UPDATE_CONCURRENCY,
      async ({ ownedReview, body }) => {
        await input.ports.updatePullRequestReview(
          input.target.pullRequestNumber,
          ownedReview.review.identity,
          body,
        );
      },
    );
    attemptedReviewUpdates += batch.length;
    reviewUpdates += results.filter((result) => result === 'fulfilled').length;
    results.forEach((result, index) => {
      if (result === 'rejected') {
        reviewFailures.push(toPresentationFailure({
          code: 'review-update-failed',
          reviewIdentity: batch[index].ownedReview.review.identity,
        }));
      }
    });
    if (results.includes('rejected')) break;
  }
  const pendingReviewUpdates = Math.max(
    0,
    plannedReviewUpdates.length - attemptedReviewUpdates,
  );
  if (pendingReviewUpdates > 0) {
    reviewFailures.push(toPresentationFailure({
      code: 'review-updates-pending',
      count: pendingReviewUpdates,
    }));
  }

  const failuresBeforeStatus = [...initialFailures, ...reviewFailures];
  projection = buildProjection(input, failuresBeforeStatus, catalog);
  const statusResult = await synchronizeStatusCard(input, projection, navigation, catalog);
  const failures = [...failuresBeforeStatus, ...statusResult.failures];
  if (statusResult.failures.length > 0) projection = buildProjection(input, failures, catalog);
  return report(
    projection,
    reviewUpdates,
    pendingReviewUpdates,
    statusResult.operation,
    failures.map(({ error }) => error),
  );
}

function planReviewUpdates(
  input: BugbotPresentationSynchronizationInput,
  projection: BugbotPresentationReport['projection'],
  navigation: BugbotReviewNavigation,
  catalog: BugbotMessageCatalog,
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
      catalog,
      statusUrl: navigation.pullRequestUrl,
    });
    return body === ownedReview.review.body ? [] : [{ ownedReview, body }];
  });
}

async function synchronizeStatusCard(
  input: BugbotPresentationSynchronizationInput,
  projection: BugbotPresentationReport['projection'],
  navigation: BugbotReviewNavigation,
  catalog: BugbotMessageCatalog,
): Promise<{
  readonly operation: BugbotPresentationReport['statusCardOperation'];
  readonly failures: readonly PresentationFailure[];
}> {
  if (
    !input.target.trustedAuthorLogin?.trim()
    || input.snapshot.completeness.conversation !== 'verified'
  ) {
    return statusFailure();
  }
  const statusBody = renderBugbotStatusCard(projection, catalog, navigation);
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
          buildDuplicateMarker(canonical?.id ?? duplicate.id),
          '',
          catalog.message('bugbot.status.duplicate.superseded'),
          '',
          `[${catalog.message('bugbot.status.duplicate.viewCurrent')}](${navigation.pullRequestUrl}).`,
        ].join('\n'),
        { commitSha: input.snapshot.verifiedHeadSha },
      );
    },
  );
  if (duplicateResults.includes('rejected')) failed = true;
  if (duplicateResults.includes('fulfilled')) operation = 'updated';
  return failed ? statusFailure() : { operation, failures: [] };
}

function buildProjection(
  input: BugbotPresentationSynchronizationInput,
  failures: readonly PresentationFailure[],
  catalog: BugbotMessageCatalog,
): BugbotPresentationReport['projection'] {
  return buildBugbotReviewProjection({
    pullRequestNumber: input.target.pullRequestNumber,
    analyzedHeadSha: input.target.analyzedHeadSha,
    verifiedHeadSha: input.snapshot.verifiedHeadSha,
    findings: input.plan.findings,
    coverage: input.plan.coverage,
    errors: failures.map(({ diagnostic }) => renderBugbotDiagnostic(diagnostic, catalog).slice(0, 500)),
  });
}

function statusFailure(): {
  readonly operation: 'failed';
  readonly failures: readonly PresentationFailure[];
} {
  return {
    operation: 'failed',
    failures: [toPresentationFailure({ code: 'status-card-update-failed' })],
  };
}

function toPresentationFailure(diagnostic: BugbotPresentationDiagnostic): PresentationFailure {
  const message = bugbotDiagnosticOperatorMessage(diagnostic);
  return {
    diagnostic,
    error: diagnostic.code === 'review-updates-pending'
      ? new ApplicationError('workflow.presentation-pending', message, {
          recovery: {
            id: 'bugbot-review-blocks-pending',
            variables: { pendingCount: diagnostic.count },
          },
        })
      : new Error(message),
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
