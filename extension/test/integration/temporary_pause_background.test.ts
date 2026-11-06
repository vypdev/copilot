import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { PAGE, CONNECTED, deferred } from '../fixtures/runtime.ts';
import { CONFIG, pageSender } from '../fixtures/page_configuration.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const paused = { schemaVersion: 1, revision: 1, emergency: true, tabs: [] };
function fixture(prepare: Parameters<typeof backgroundCenterFixture>[0] = () => undefined) {
    const h = backgroundCenterFixture(browser => {
        browser.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } } });
        browser.sessionValues.set(SESSION_KEY, CONNECTED); prepare(browser);
    }); stops.push(h.stop); return h;
}
it.each(['emergency', 'tab', 'future', 'corrupt', 'unprotected', 'unsupported'] as const)('actual background %s restriction never starts restoration or alters the saved preferences', async state => {
    const h = fixture(browser => {
        if (state === 'unprotected') vi.mocked(browser.sessionArea.setAccessLevel!).mockRejectedValue(new Error('unavailable'));
        else if (state === 'unsupported') browser.api.storage.session = undefined;
        else browser.sessionValues.set(TEMPORARY_PAUSES_KEY, state === 'future' ? { schemaVersion: 99 }
            : state === 'corrupt' ? { malformed: true } : { ...paused, emergency: state === 'emergency', tabs: state === 'tab' ? [1] : [] });
    }); const original = structuredClone(h.localValues.get(SETTINGS_KEY));
    expect(await h.call(CONFIG, pageSender)).toMatchObject({ state: 'ready', connected: false, settings: { paused: true } });
    expect(await h.call(PAGE, pageSender)).toMatchObject({ state: 'paused' }); expect(h.provider).not.toHaveBeenCalled();
    expect(h.localValues.get(SETTINGS_KEY)).toEqual(original); expect(h.sessionArea.set).not.toHaveBeenCalled();
    expect(h.api.permissions.request).not.toHaveBeenCalled();
});
it('a fresh actual worker rereads the browser-session emergency pause before any provider request', async () => {
    const h = fixture(browser => { browser.sessionValues.set(TEMPORARY_PAUSES_KEY, paused); });
    const first = await h.call(CONFIG, pageSender); stops.pop()!();
    const restored = fixture(browser => { browser.sessionValues.set(TEMPORARY_PAUSES_KEY, structuredClone(h.sessionValues.get(TEMPORARY_PAUSES_KEY))); });
    expect(first).toMatchObject({ settings: { paused: true } });
    expect(await restored.call(CONFIG, pageSender)).toMatchObject({ settings: { paused: true } }); expect(restored.provider).not.toHaveBeenCalled();
});
it('native pause storage invalidation aborts an actual provider lease and retires its old completion', async () => {
    const h = fixture(); const pending = deferred<Response>(); h.provider.mockReturnValueOnce(pending.promise);
    const request = h.call(CONFIG, pageSender); await vi.waitFor(() => expect(h.provider).toHaveBeenCalledTimes(1));
    h.sessionValues.set(TEMPORARY_PAUSES_KEY, paused);
    for (const listener of h.changed.listeners) listener({ [TEMPORARY_PAUSES_KEY]: { newValue: paused } }, 'session');
    pending.resolve(new Response(JSON.stringify({ id: 1, login: 'octo' }), { headers: { 'content-type': 'application/json' } }));
    expect(await request).toMatchObject({ state: 'stale' }); expect(h.provider).toHaveBeenCalledTimes(1);
    expect(await h.call({ ...CONFIG, generation: 2 }, pageSender)).toMatchObject({ state: 'ready', connected: false, settings: { paused: true } });
});
it('unrelated session storage changes do not invalidate an admitted page lease', async () => {
    const h = fixture(browser => { browser.sessionValues.set(TEMPORARY_PAUSES_KEY, { ...paused, emergency: false }); });
    const pending = deferred<unknown>(); const original = vi.mocked(h.sessionArea.get).getMockImplementation()!;
    vi.mocked(h.sessionArea.get).mockImplementation(key => key === TEMPORARY_PAUSES_KEY ? pending.promise as Promise<Record<string, unknown>> : original(key));
    const request = h.call(CONFIG, pageSender); await vi.waitFor(() => expect(h.sessionArea.get).toHaveBeenCalledWith(TEMPORARY_PAUSES_KEY));
    for (const listener of h.changed.listeners) listener({ unrelated: {} }, 'session');
    pending.resolve({ [TEMPORARY_PAUSES_KEY]: paused }); expect(await request).toMatchObject({ state: 'ready', settings: { paused: true } });
});
