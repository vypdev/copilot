import type {
    BugbotFinding,
    BugbotFindingResolution,
    ExistingByFindingId,
} from '../usecases/steps/commit/bugbot/types';
import {
    BUGBOT_FINDING_STATES,
    countBugbotFindingStates,
    type BugbotFindingState,
} from '../../domain/bugbot/review_state';

export type BugbotFindingStatus = BugbotFindingState;

export interface BugbotFindingStatusSummary {
    readonly statuses: ReadonlyMap<string, BugbotFindingStatus>;
    readonly counts: Readonly<Record<BugbotFindingStatus, number>>;
}

/** Projects durable comment markers and the current analysis into a stable finding state. */
export function projectBugbotFindingStatuses(
    existingByFindingId: ExistingByFindingId,
    activeFindings: readonly BugbotFinding[],
    resolvedFindingIds: ReadonlySet<string> = new Set(),
    resolvedFindingResolutions: ReadonlyMap<string, BugbotFindingResolution> = new Map(),
): BugbotFindingStatusSummary {
    const ids = new Set([
        ...Object.keys(existingByFindingId),
        ...activeFindings.map(finding => finding.id),
    ]);
    const statuses = new Map<string, BugbotFindingStatus>();
    for (const id of ids) {
        const active = activeFindings.some(finding => finding.id === id);
        const existing = existingByFindingId[id];
        const previouslyResolved = [existing?.issue, existing?.pullRequest].some(destination => destination?.resolved === true);
        if (active) {
            statuses.set(
                id,
                existing?.pullRequest?.verificationRequired
                    ? 'verification-required'
                    : previouslyResolved
                        ? 'reopened'
                        : 'open',
            );
            continue;
        }
        if (resolvedFindingIds.has(id)) {
            statuses.set(id, resolvedFindingResolutions.get(id) ?? existing?.issue?.resolution ?? existing?.pullRequest?.resolution ?? 'fixed');
            continue;
        }
        if (existing?.pullRequest?.verificationRequired) {
            statuses.set(id, 'verification-required');
            continue;
        }
        if (previouslyResolved && (existing?.issue?.resolution || existing?.pullRequest?.resolution)) {
            statuses.set(id, existing.issue?.resolution ?? existing.pullRequest?.resolution ?? 'fixed');
            continue;
        }
        statuses.set(id, 'open');
    }
    return { statuses, counts: countStatuses(statuses) };
}

function countStatuses(statuses: ReadonlyMap<string, BugbotFindingStatus>): Record<BugbotFindingStatus, number> {
    const counts = countBugbotFindingStates(statuses.values());
    for (const state of BUGBOT_FINDING_STATES) counts[state] ??= 0;
    return counts;
}
