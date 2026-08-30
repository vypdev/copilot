import type { BugbotFinding, ExistingByFindingId } from '../usecases/steps/commit/bugbot/types';
/**
 * Accepts a model's resolution claims only when they refer to an existing
 * finding and no active finding with the same id or local fingerprint remains.
 * This prevents a stale or injected response from resolving a live finding.
 */
export declare function reconcileResolvedFindingIds(resolvedFindingIds: ReadonlySet<string>, existingByFindingId: ExistingByFindingId, activeFindings: readonly BugbotFinding[]): Set<string>;
