import {
  MAX_SUPERSEDED_DEPLOYMENT_CANDIDATES,
  type DeploymentOperationSnapshot,
} from './deployment_operation';
import { isSafeOperationId } from './managed_pull_request';

export interface DeploymentCandidateReplacementRequest {
  readonly operationId: string;
  readonly expectedRevision: number;
  readonly version: string;
  readonly candidateSha: string;
  readonly reviewedSourceSha: string;
  readonly productionBaseSha: string;
  readonly confirmedUnpublished: boolean;
}

export interface DeploymentCandidateReplacementContext {
  readonly repositoryFullName: string;
  readonly issue: number;
  readonly kind: 'release' | 'hotfix';
  readonly sourceBranch: string;
  readonly productionBranch: string;
}

/** Closed native facts; adapters must not convert failed reads into absence. */
export interface DeploymentCandidateReplacementEvidence {
  readonly launcher: {
    readonly open: boolean;
    readonly operationId: string;
    readonly revision: number;
    readonly kind: 'release' | 'hotfix';
    readonly sourceBranch: string;
  };
  readonly sourceSha: string;
  readonly productionSha: string;
  readonly oldSourceReachable: boolean;
  readonly reviewedSourceReachable: boolean;
  readonly oldSourceInProduction: boolean;
  readonly closedPromotionHeadReachable: boolean;
  readonly conflictingOpenPromotion: boolean;
  readonly nativePublicationVacant: boolean;
  readonly promotion: {
    readonly number: number;
    readonly repositoryFullName: string;
    readonly operationId: string;
    readonly issue: number;
    readonly phase: 'promotion' | 'reconciliation';
    readonly sourceBranch: string;
    readonly headSha: string;
    readonly productionBranch: string;
    readonly closed: boolean;
    readonly merged: boolean;
    readonly autoMergeEnabled: boolean;
    readonly queued: boolean;
  };
}

export type DeploymentCandidateReplacementBlock =
  | 'invalid-request' | 'unconfirmed-publication-vacancy' | 'stale-operation'
  | 'stale-revision' | 'different-version' | 'ineligible-phase' | 'publication-effects'
  | 'history-limit' | 'unchanged-source' | 'changed-launcher' | 'changed-ownership' | 'changed-source'
  | 'changed-production-base' | 'changed-lineage' | 'invalid-promotion'
  | 'active-promotion' | 'native-publication-effects';

export type DeploymentCandidateReplacementDecision =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'blocked'; readonly reason: DeploymentCandidateReplacementBlock };

const fullSha = (value: unknown): boolean => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const safeOperationId = (value: unknown): value is string => typeof value === 'string' && isSafeOperationId(value);

export function validateDeploymentCandidateReplacementIntent(
  request: Omit<DeploymentCandidateReplacementRequest, 'candidateSha' | 'productionBaseSha'>,
): DeploymentCandidateReplacementBlock | undefined {
  if (!safeOperationId(request.operationId) || !Number.isSafeInteger(request.expectedRevision)
    || request.expectedRevision < 1 || request.expectedRevision >= Number.MAX_SAFE_INTEGER
    || typeof request.version !== 'string' || request.version.length > 64 || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(request.version)
    || !fullSha(request.reviewedSourceSha)) return 'invalid-request';
  return request.confirmedUnpublished === true ? undefined : 'unconfirmed-publication-vacancy';
}

export function validateDeploymentCandidateReplacementRequest(
  request: DeploymentCandidateReplacementRequest,
): DeploymentCandidateReplacementBlock | undefined {
  const invalid = validateDeploymentCandidateReplacementIntent(request);
  if (invalid) return invalid;
  return fullSha(request.candidateSha) && fullSha(request.productionBaseSha) ? undefined : 'invalid-request';
}

export function assessDeploymentCandidateReplacementState(
  operation: DeploymentOperationSnapshot,
  request: DeploymentCandidateReplacementRequest,
): DeploymentCandidateReplacementBlock | undefined {
  const invalid = validateDeploymentCandidateReplacementRequest(request);
  if (invalid) return invalid;
  const guards: readonly (readonly [boolean, DeploymentCandidateReplacementBlock])[] = [
    [operation.operationId === request.operationId, 'stale-operation'],
    [operation.revision === request.expectedRevision, 'stale-revision'],
    [operation.version === request.version, 'different-version'],
  ];
  const identityProblem = guards.find(([valid]) => !valid)?.[1];
  if (identityProblem) return identityProblem;
  return replacementSnapshotProblem(operation)
    ?? (operation.sourceSha === request.candidateSha || operation.sourceSha === request.reviewedSourceSha ? 'unchanged-source' : undefined);
}

function replacementSnapshotProblem(operation: DeploymentOperationSnapshot): DeploymentCandidateReplacementBlock | undefined {
  if (!isCandidateReplacementPreparationPhase(operation)) return 'ineligible-phase';
  if (operation.productionSha !== undefined || operation.publicationVerified !== false
    || operation.publicationReceipt !== undefined || operation.reconciliationTargets.length !== 0) return 'publication-effects';
  return (operation.supersededCandidates?.length ?? 0) >= MAX_SUPERSEDED_DEPLOYMENT_CANDIDATES ? 'history-limit' : undefined;
}

export function isCandidateReplacementPreparationPhase(operation: DeploymentOperationSnapshot): boolean {
  if (operation.phase === 'preparing' || operation.phase === 'promotion_pr_pending') return true;
  return operation.phase === 'blocked' && operation.lastFailure?.category === 'promotion'
    && (operation.lastFailure.previousPhase === 'preparing' || operation.lastFailure.previousPhase === 'promotion_pr_pending');
}

export function assessDeploymentCandidateReplacement(
  operation: DeploymentOperationSnapshot,
  request: DeploymentCandidateReplacementRequest,
  context: DeploymentCandidateReplacementContext,
  evidence: DeploymentCandidateReplacementEvidence,
): DeploymentCandidateReplacementDecision {
  const invalid = assessDeploymentCandidateReplacementState(operation, request);
  if (invalid) return { kind: 'blocked', reason: invalid };
  const reason = nativeAuthorityProblem(operation, operation, request, context, evidence);
  return reason ? { kind: 'blocked', reason } : { kind: 'allowed' };
}

export function assessRecordedCandidateReplacementRecovery(
  operation: DeploymentOperationSnapshot,
  request: DeploymentCandidateReplacementRequest,
  context: DeploymentCandidateReplacementContext,
  evidence: DeploymentCandidateReplacementEvidence,
): DeploymentCandidateReplacementDecision {
  if (!isRecordedCandidateReplacement(operation, request)) return { kind: 'blocked', reason: 'stale-operation' };
  if (!isCandidateReplacementPreparationPhase(operation)) return { kind: 'blocked', reason: 'ineligible-phase' };
  if (operation.productionSha !== undefined || operation.publicationVerified || operation.publicationReceipt !== undefined
    || operation.reconciliationTargets.length !== 0) return { kind: 'blocked', reason: 'publication-effects' };
  const previous = operation.supersededCandidates!.at(-1)!;
  const reason = nativeAuthorityProblem(operation, { operationId: previous.operationId,
    promotionPullRequest: previous.promotionPullRequest, sourceBranch: operation.sourceBranch,
    productionBranch: operation.productionBranch,
  }, request, context, evidence);
  return reason ? { kind: 'blocked', reason } : { kind: 'allowed' };
}

function nativeAuthorityProblem(
  operation: DeploymentOperationSnapshot,
  promotionOwner: Pick<DeploymentOperationSnapshot, 'operationId' | 'promotionPullRequest' | 'sourceBranch' | 'productionBranch'>,
  request: DeploymentCandidateReplacementRequest,
  context: DeploymentCandidateReplacementContext,
  evidence: DeploymentCandidateReplacementEvidence,
): DeploymentCandidateReplacementBlock | undefined {
  const oldPr = evidence.promotion;
  const guards: readonly (readonly [boolean, DeploymentCandidateReplacementBlock])[] = [
    [evidence.launcher.open && evidence.launcher.operationId === operation.operationId
      && evidence.launcher.revision === operation.revision && evidence.launcher.kind === operation.kind
      && evidence.launcher.sourceBranch === operation.sourceBranch, 'changed-launcher'],
    [operation.kind === context.kind && operation.sourceBranch === context.sourceBranch
      && operation.productionBranch === context.productionBranch, 'changed-ownership'],
    [evidence.sourceSha === request.candidateSha, 'changed-source'],
    [evidence.productionSha === request.productionBaseSha, 'changed-production-base'],
    [evidence.oldSourceReachable && evidence.reviewedSourceReachable && !evidence.oldSourceInProduction
      && evidence.closedPromotionHeadReachable, 'changed-lineage'],
    [oldPr.number === promotionOwner.promotionPullRequest && oldPr.operationId === promotionOwner.operationId
      && oldPr.issue === context.issue && oldPr.phase === 'promotion'
      && oldPr.repositoryFullName.toLowerCase() === context.repositoryFullName.toLowerCase()
      && oldPr.sourceBranch === promotionOwner.sourceBranch && oldPr.productionBranch === promotionOwner.productionBranch
      && fullSha(oldPr.headSha), 'invalid-promotion'],
    [oldPr.closed && !oldPr.merged && !oldPr.autoMergeEnabled && !oldPr.queued
      && !evidence.conflictingOpenPromotion, 'active-promotion'],
    [evidence.nativePublicationVacant, 'native-publication-effects'],
  ];
  const reason = guards.find(([valid]) => !valid)?.[1];
  return reason;
}

export function isRecordedCandidateReplacement(
  operation: DeploymentOperationSnapshot,
  request: DeploymentCandidateReplacementRequest,
): boolean {
  if (validateDeploymentCandidateReplacementRequest(request)) return false;
  const previous = operation.supersededCandidates?.at(-1);
  return previous?.operationId === request.operationId && previous.revision === request.expectedRevision
    && previous.replacementSourceSha === request.reviewedSourceSha && previous.replacementBaseSha === request.productionBaseSha
    && operation.version === request.version && operation.sourceSha === request.candidateSha;
}

/** Call only after current native authority and eligibility have been verified. */
export function buildReplacementDeploymentCandidate(
  previous: DeploymentOperationSnapshot,
  request: DeploymentCandidateReplacementRequest,
  operationId: string,
): DeploymentOperationSnapshot {
  if (assessDeploymentCandidateReplacementState(previous, request)) throw new Error('Candidate replacement identity is invalid.');
  return buildReplacementCandidateSnapshot(previous, request.candidateSha, operationId, request.reviewedSourceSha, request.productionBaseSha);
}

/** State-shape constructor only; a caller still needs native authority and explicit replacement intent. */
export function buildReplacementCandidateSnapshot(
  previous: DeploymentOperationSnapshot,
  candidateSha: string,
  operationId: string,
  reviewedSourceSha: string,
  productionBaseSha: string,
): DeploymentOperationSnapshot {
  const history = previous.supersededCandidates ?? [];
  if (replacementSnapshotProblem(previous) || !fullSha(candidateSha) || !fullSha(reviewedSourceSha)
    || !fullSha(productionBaseSha) || candidateSha === previous.sourceSha || reviewedSourceSha === previous.sourceSha
    || previous.revision >= Number.MAX_SAFE_INTEGER
    || !safeOperationId(operationId) || operationId === previous.operationId
    || history.some(candidate => candidate.operationId === operationId)
    || previous.promotionPullRequest === undefined) throw new Error('Candidate replacement identity is invalid.');
  return {
    ...previous,
    operationId,
    revision: previous.revision + 1,
    sourceSha: candidateSha,
    phase: 'preparing',
    selectedPrMode: undefined,
    promotionPullRequest: undefined,
    productionSha: undefined,
    publicationVerified: false,
    publicationReceipt: undefined,
    reconciliationTargets: [],
    lastFailure: null,
    supersededCandidates: [...history, {
      operationId: previous.operationId,
      revision: previous.revision,
      sourceSha: previous.sourceSha,
      promotionPullRequest: previous.promotionPullRequest,
      replacementSourceSha: reviewedSourceSha,
      replacementBaseSha: productionBaseSha,
    }],
  };
}
