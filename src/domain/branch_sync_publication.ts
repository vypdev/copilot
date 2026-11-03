export const BRANCH_SYNC_PUBLICATION_REASONS = Object.freeze(['workflow-write-required', 'push-failed', 'candidate-unverified'] as const);
export const BRANCH_SYNC_REMOTE_STATES = Object.freeze(['unchanged', 'published', 'changed', 'unverified'] as const);
export interface BranchSyncPublicationDiagnostic {
  readonly reason: typeof BRANCH_SYNC_PUBLICATION_REASONS[number];
  readonly remoteState: typeof BRANCH_SYNC_REMOTE_STATES[number];
  readonly originalSha: string;
  readonly candidateSha: string;
  readonly observedSha: string;
  readonly pushAttempted: boolean;
}
export function isBranchSyncObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value) && !/^0+$/u.test(value);
}
export function admittedBranchSyncObjectId(value: unknown): string {
  return isBranchSyncObjectId(value) ? value : 'unavailable';
}
export function isBranchSyncPublicationDiagnostic(value: unknown): value is BranchSyncPublicationDiagnostic {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as BranchSyncPublicationDiagnostic;
  if (Object.keys(d).sort().join(',') !== 'candidateSha,observedSha,originalSha,pushAttempted,reason,remoteState'
    || !BRANCH_SYNC_PUBLICATION_REASONS.includes(d.reason) || !BRANCH_SYNC_REMOTE_STATES.includes(d.remoteState)
    || typeof d.pushAttempted !== 'boolean'
    || ![d.originalSha, d.candidateSha, d.observedSha].every(x => x === 'unavailable' || isBranchSyncObjectId(x))) return false;
  if (d.reason === 'candidate-unverified' && (d.pushAttempted || d.candidateSha !== 'unavailable')) return false;
  if (d.reason !== 'candidate-unverified' && (!d.pushAttempted || !isBranchSyncObjectId(d.candidateSha) || d.candidateSha === d.originalSha)) return false;
  if (d.remoteState === 'published') return isBranchSyncObjectId(d.candidateSha) && d.observedSha === d.candidateSha;
  if (d.remoteState === 'unchanged') return isBranchSyncObjectId(d.originalSha) && d.observedSha === d.originalSha && d.observedSha !== d.candidateSha;
  if (d.remoteState === 'changed') return isBranchSyncObjectId(d.originalSha) && isBranchSyncObjectId(d.observedSha)
    && d.observedSha !== d.originalSha && d.observedSha !== d.candidateSha;
  return (d.observedSha === 'unavailable' || d.originalSha === 'unavailable')
    && !(isBranchSyncObjectId(d.candidateSha) && d.observedSha === d.candidateSha);
}
/** A committed candidate is no longer an in-progress Git merge. */
export class BranchSyncPublicationFailure extends Error {
  readonly diagnostic: BranchSyncPublicationDiagnostic;
  constructor(diagnostic: BranchSyncPublicationDiagnostic) {
    super('Branch synchronization candidate publication requires reconciliation.');
    if (!isBranchSyncPublicationDiagnostic(diagnostic)) throw new TypeError('Invalid branch synchronization publication facts.');
    this.name = 'BranchSyncPublicationFailure';
    this.diagnostic = Object.freeze({ ...diagnostic });
    Object.freeze(this);
  }
}
