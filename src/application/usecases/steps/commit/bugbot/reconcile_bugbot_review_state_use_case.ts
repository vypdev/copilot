import type {
  BugbotPresentationReport,
  BugbotReconciliationCredential,
  BugbotReconciliationTarget,
} from '../../../../contracts/bugbot_reconciliation';
import type { BugbotFinding } from '../../../../../domain/bugbot/finding';
import { buildBugbotReviewProjection } from '../../../../../domain/bugbot/review_projection';
import {
  buildBugbotReconciliationPlan,
  describeBugbotSnapshotFailures,
} from '../../../../policies/bugbot_reconciliation_policy';
import { projectBugbotProviderEvidence } from '../../../../policies/bugbot_provider_projection_policy';
import { extractTitleFromBody } from '../../../../policies/bugbot_finding_marker_policy';
import type { BugbotContext } from './types';
import {
  loadBugbotReconciliationSnapshot,
  type BugbotReconciliationSnapshotPorts,
} from './load_bugbot_reconciliation_snapshot_use_case';
import {
  synchronizeBugbotReviewPresentation,
  type BugbotPresentationMutationPorts,
} from './synchronize_bugbot_review_presentation_use_case';

export type { BugbotPresentationReport } from '../../../../contracts/bugbot_reconciliation';

/**
 * Orchestrates final Bugbot reconciliation. Provider acquisition, pure state
 * planning, and presentation mutations are deliberately owned by dedicated
 * collaborators.
 */
export async function reconcileBugbotReviewState(input: {
  readonly target: BugbotReconciliationTarget;
  readonly credential: BugbotReconciliationCredential;
  readonly loadedContext: BugbotContext;
  readonly activeFindings: readonly BugbotFinding[];
  /** Findings this run attempted to persist; overflow-only items are excluded. */
  readonly expectedPublishedFindings?: readonly BugbotFinding[];
  readonly mutationErrors?: readonly Error[];
  readonly snapshotPorts: BugbotReconciliationSnapshotPorts;
  readonly presentationPorts: BugbotPresentationMutationPorts;
}): Promise<BugbotPresentationReport> {
  const snapshotResult = await loadBugbotReconciliationSnapshot(
    input.target,
    input.credential,
    input.snapshotPorts,
  );
  if (snapshotResult.kind === 'superseded') {
    return {
      projection: buildBugbotReviewProjection({
        pullRequestNumber: input.target.pullRequestNumber,
        analyzedHeadSha: input.target.analyzedHeadSha,
        verifiedHeadSha: snapshotResult.verifiedHeadSha,
        findings: [],
        superseded: true,
      }),
      reviewUpdates: 0,
      pendingReviewUpdates: 0,
      statusCardOperation: 'unchanged',
      errors: [],
    };
  }

  const snapshot = snapshotResult.snapshot;
  const diagnostics = [
    ...(input.mutationErrors ?? []).map(toSafeOperationMessage),
    ...(!input.target.trustedAuthorLogin?.trim()
      ? ['The authenticated Bugbot identity is unavailable.']
      : []),
    ...describeBugbotSnapshotFailures(snapshot.completeness),
  ];
  const providerProjection = projectBugbotProviderEvidence({
    snapshot,
    trustedAuthorLogin: input.target.trustedAuthorLogin,
    activeFindings: input.activeFindings,
    existingByFindingId: input.loadedContext.existingByFindingId,
  });
  const plan = buildBugbotReconciliationPlan({
    providerProjection,
    existingByFindingId: input.loadedContext.existingByFindingId,
    previousFindingTitles: new Map(
      input.loadedContext.unresolvedFindingsWithBody.map(({ id, fullBody }) => [
        id,
        extractTitleFromBody(fullBody) || id,
      ]),
    ),
    activeFindings: input.activeFindings,
    expectedPublishedFindings:
      input.expectedPublishedFindings ?? input.activeFindings,
    diagnostics,
  });
  return synchronizeBugbotReviewPresentation({
    target: input.target,
    credential: input.credential,
    snapshot,
    plan,
    ports: input.presentationPorts,
  });
}

function toSafeOperationMessage(error: Error): string {
  return error.message.slice(0, 500);
}
