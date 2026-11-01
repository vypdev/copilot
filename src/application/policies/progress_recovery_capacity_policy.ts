import { IMMUTABLE_PROGRESS_PROFILE } from './progress_inventory_profile_policy';
import type { ProgressRecoveryCounters, ProgressRecoveryUsage, ProgressEvidenceProfile } from '../ports/progress_diff_query_ports';

export const PROGRESS_RECOVERY_FRAME_LIMITS = Object.freeze({ files: 64, bytes: 4_194_304, requests: 256, treeEntries: 50_000 });
export const MAX_PROGRESS_RECOVERY_FRAMES = 4;
export const MAX_FRAMED_PROGRESS_FILE_BYTES = 2_097_152;
export const PROGRESS_RECOVERY_TOTAL_LIMITS = Object.freeze(Object.fromEntries(
    Object.entries(PROGRESS_RECOVERY_FRAME_LIMITS).map(([resource, limit]) => [resource, limit * MAX_PROGRESS_RECOVERY_FRAMES]),
) as unknown as ProgressRecoveryCounters);
export type ProgressRecoveryResource = keyof ProgressRecoveryCounters;
export type ProgressCapacityReason = 'invalid-claim' | 'single-claim' | 'total' | 'frames';
const resources: readonly string[] = Object.keys(PROGRESS_RECOVERY_FRAME_LIMITS);
const empty = (): ProgressRecoveryCounters => Object.freeze({ files: 0, bytes: 0, requests: 0, treeEntries: 0 });

export class ProgressRecoveryCapacityFailure extends Error {
    constructor(readonly reason: ProgressCapacityReason, readonly resource: ProgressRecoveryResource | 'invalid', readonly usage: ProgressRecoveryUsage) {
        super('Complete progress recovery exceeds its bounded framed capacity.');
    }
}
export function initialProgressRecoveryUsage(): ProgressRecoveryUsage {
    return Object.freeze({ frames: 1, current: empty(), total: empty() });
}

/** Host-owned finite state. Admit each claim before its I/O; never reset global credit. */
export function spendProgressRecovery(usage: ProgressRecoveryUsage, resource: ProgressRecoveryResource, amount: number, profile: ProgressEvidenceProfile = 'framed-v1'): ProgressRecoveryUsage {
    if (!['framed-v1', 'immutable-tree-v1'].includes(profile) || !resources.includes(resource) || !Number.isSafeInteger(amount) || amount < 0) {
        throw new ProgressRecoveryCapacityFailure('invalid-claim', resources.includes(resource) ? resource : 'invalid', usage);
    }
    const totalLimits = profile === 'immutable-tree-v1' ? IMMUTABLE_PROGRESS_PROFILE.total : PROGRESS_RECOVERY_TOTAL_LIMITS;
    const frames = profile === 'immutable-tree-v1' ? IMMUTABLE_PROGRESS_PROFILE.frames : MAX_PROGRESS_RECOVERY_FRAMES;
    const limit = PROGRESS_RECOVERY_FRAME_LIMITS[resource];
    if (amount > limit) throw new ProgressRecoveryCapacityFailure('single-claim', resource, usage);
    if (usage.total[resource] + amount > totalLimits[resource]) throw new ProgressRecoveryCapacityFailure('total', resource, usage);
    if (amount === 0) return usage;
    const advance = usage.current[resource] + amount > limit;
    if (advance && usage.frames === frames) throw new ProgressRecoveryCapacityFailure('frames', resource, usage);
    return Object.freeze({ frames: usage.frames + Number(advance),
        current: Object.freeze({ ...(advance ? empty() : usage.current), [resource]: (advance ? 0 : usage.current[resource]) + amount }),
        total: Object.freeze({ ...usage.total, [resource]: usage.total[resource] + amount }),
    });
}
