import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture, connectReadThroughCenter } from '../fixtures/background_center.ts';
import { CONFIG, pageSender, scopedSettings } from '../fixtures/page_configuration.ts';
import { CONNECTED, deferred, PAGE } from '../fixtures/runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture(activity: boolean) {
    const h = backgroundCenterFixture(browser => { browser.localValues.set(SETTINGS_KEY, scopedSettings()); if (!activity) browser.sessionValues.set(SESSION_KEY, CONNECTED); }); stops.push(h.stop);
    if (activity) expect(await connectReadThroughCenter(h.call, 'native_read_test_secret', 'octo/example')).toMatchObject({ state: 'connected' });
    const client = await h.client(); const plan = await client.requestPauses({ method: 'center.pauses.preview', intent: { type: 'emergency', paused: true }, expectedRevision: 0 });
    if (typeof plan?.operationId !== 'string') throw new Error('missing-native-pause-plan'); h.provider.mockClear();
    return { ...h, confirm: () => client.requestPauses({ method: 'center.pauses.confirm', operationId: plan.operationId as string, expectedRevision: 0 }) };
}
async function blockedReservation(activity: boolean, target: number) {
    const h = await fixture(activity); const scheduled = deferred<void>(); const native = deferred<void>(); const scheduleGate = deferred<void>(); const nativeGate = deferred<void>();
    const set = vi.mocked(h.sessionArea.set).getMockImplementation()!; let reservations = 0;
    vi.mocked(h.sessionArea.set).mockImplementation(async values => {
        if (Object.hasOwn(values, 'copilot.schedule.v1') && ++reservations === target) { scheduled.resolve(); await scheduleGate.promise; }
        if (Object.hasOwn(values, TEMPORARY_PAUSES_KEY)) { native.resolve(); await nativeGate.promise; }
        await set(values);
    });
    const page = h.call(activity ? PAGE : CONFIG, { ...pageSender, tab: { ...pageSender.tab, id: 7 } }); await scheduled.promise;
    const confirmation = h.confirm(); await native.promise; scheduleGate.resolve();
    try {
        const result = await page; expect(h.provider).toHaveBeenCalledTimes(target - 1); expect(result).not.toHaveProperty('data');
    } finally { nativeGate.resolve(); await confirmation; }
}
it.each([1, 2])('a real pending native pause while restoration reservation %s awaits storage prevents the next provider invocation', async target => { await blockedReservation(false, target); });
it('a real pending native pause after valid page configuration but during object reservation prevents its provider read', async () => { await blockedReservation(true, 1); });
