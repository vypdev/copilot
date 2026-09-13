import { getResultPayload } from '../../data/model/result';
import {
    BUGBOT_FINDING_STATES,
    countBugbotFindingStates,
    type BugbotFindingStateCounts,
} from '../../domain/bugbot/review_state';

const BUGBOT_FINDING_STATE_SET = new Set<string>(BUGBOT_FINDING_STATES);

export type BugbotResultFindingStateProjection =
    | { readonly status: 'absent' }
    | { readonly status: 'invalid' }
    | { readonly status: 'valid'; readonly counts: Readonly<BugbotFindingStateCounts> };

interface ResultPayloadSource {
    readonly payload?: unknown;
}

/** Validates and aggregates the one canonical finding-state payload shape used by result presentation. */
export function projectBugbotResultFindingStates(
    results: readonly ResultPayloadSource[],
): BugbotResultFindingStateProjection {
    const aggregate = countBugbotFindingStates([]);
    let found = false;
    for (const result of results) {
        const projected = projectResultFindingStates(result.payload);
        if (projected.status === 'invalid') return projected;
        if (projected.status === 'absent') continue;
        found = true;
        for (const state of BUGBOT_FINDING_STATES) {
            const total = aggregate[state] + projected.counts[state];
            if (!Number.isSafeInteger(total)) return { status: 'invalid' };
            aggregate[state] = total;
        }
    }
    return found ? { status: 'valid', counts: Object.freeze(aggregate) } : { status: 'absent' };
}

function projectResultFindingStates(value: unknown): BugbotResultFindingStateProjection {
    const payload = getResultPayload(value);
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'findingStates')) return { status: 'absent' };
    const rawCounts = getResultPayload(payload.findingStates);
    if (!rawCounts) return { status: 'invalid' };
    if (Object.keys(rawCounts).some(key => !BUGBOT_FINDING_STATE_SET.has(key))) {
        return { status: 'invalid' };
    }
    const counts = countBugbotFindingStates([]);
    for (const state of BUGBOT_FINDING_STATES) {
        if (!Object.prototype.hasOwnProperty.call(rawCounts, state)) return { status: 'invalid' };
        const count = rawCounts[state];
        if (!isNonNegativeSafeInteger(count)) return { status: 'invalid' };
        counts[state] = count;
    }
    return { status: 'valid', counts: Object.freeze(counts) };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
