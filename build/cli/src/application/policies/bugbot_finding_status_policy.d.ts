import type { BugbotFinding, BugbotFindingResolution, ExistingByFindingId } from '../usecases/steps/commit/bugbot/types';
export type BugbotFindingStatus = 'open' | 'fixed' | 'obsolete' | 'dismissed' | 'reopened';
export interface BugbotFindingStatusSummary {
    readonly statuses: ReadonlyMap<string, BugbotFindingStatus>;
    readonly counts: Readonly<Record<BugbotFindingStatus, number>>;
}
/** Projects durable comment markers and the current analysis into a stable finding state. */
export declare function projectBugbotFindingStatuses(existingByFindingId: ExistingByFindingId, activeFindings: readonly BugbotFinding[], resolvedFindingIds?: ReadonlySet<string>, resolvedFindingResolutions?: ReadonlyMap<string, BugbotFindingResolution>): BugbotFindingStatusSummary;
