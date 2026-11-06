import { vi } from 'vitest';
import { HelperSamples, type HelperSamplePorts } from '../../src/application/helper_samples.ts';
import type { HelperSampleIntent } from '../../src/domain/helper_sample.ts';
import type { JournalRetention } from '../../src/domain/history_state.ts';

export const HELPER_TREE = 'a'.repeat(64);
export function helperIntent(): Extract<HelperSampleIntent, { state: 'ready' }> {
    return { state: 'ready', sourceTree: HELPER_TREE, generation: 2, credentialEpoch: 3, settingsRevision: 4, health: { blocked: ['runtime-health'],
        events: [{ featureId: 'runtime-health', code: 'mount-failed', scope: 'active-at-observation' }, { featureId: 'center-shortcuts', code: 'refresh-failed', scope: 'retired-at-observation' },
            { featureId: 'runtime-health', code: 'cleanup-failed', scope: 'retired-at-observation' }] } };
}
export function helperSamplesFixture() {
    let now = 1000; let retain = false; let retention: JournalRetention = 'pending';
    const ports = { now: vi.fn(() => now), changed: vi.fn(), admit: vi.fn<HelperSamplePorts['admit']>(() => retain ? Object.freeze({}) : null),
        retention: vi.fn(() => retention) };
    const current = vi.fn(() => true); const source = { sourceTree: HELPER_TREE, generation: 2, credentialEpoch: 3, settingsRevision: 4, current };
    const owner = new HelperSamples(ports);
    return { owner, ports, source, current, capture: () => owner.capture(helperIntent(), source)!, at: (value: number) => { now = value; },
        retaining: (value: boolean) => { retain = value; }, retention: (value: JournalRetention) => { retention = value; } };
}
