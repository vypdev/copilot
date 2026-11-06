import { DEFAULT_TEMPORARY_PAUSES, planTemporaryPauseChange } from '../../src/domain/temporary_pauses.ts';
import type { PauseControlView } from '../../src/domain/temporary_pause_controls.ts';
import type { PauseReviewPlan } from '../../src/domain/temporary_pause_review.ts';

export function pauseControlWire(): PauseControlView {
    return { state: 'ready', loaded: { state: 'ready', value: { ...DEFAULT_TEMPORARY_PAUSES, tabs: [] } }, precaution: false, pending: false,
        targets: { state: 'ready', tabs: [{ tabId: 7, label: 'octo/example · #42' }], limited: false } };
}
export function pausePlanWire(kind: 'emergency' | 'tab' | 'adopt-observed' = 'emergency', paused = true): PauseReviewPlan {
    const before = { ...DEFAULT_TEMPORARY_PAUSES, emergency: kind === 'emergency' && !paused, tabs: kind === 'tab' && !paused ? [7] : [] };
    const base = { state: 'preview' as const, operationId: 'f'.repeat(32), revision: 0, expiresAt: 301000, before };
    if (kind === 'adopt-observed') return { ...base, action: 'adopt-observed', after: before, precautionBefore: true, precautionAfter: false, target: { kind: 'precaution' } };
    const planned = planTemporaryPauseChange(before, kind === 'tab' ? { type: 'tab', tabId: 7, paused } : { type: 'emergency', paused }, 0);
    if (planned.state !== 'ready') throw new Error('invalid-pause-fixture');
    return { ...base, action: 'change', after: planned.after, precautionBefore: false, precautionAfter: false,
        target: kind === 'tab' ? { kind: 'tab', tabId: 7, label: 'octo/example · #42' } : { kind: 'emergency' } };
}
