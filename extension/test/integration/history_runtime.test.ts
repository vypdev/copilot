import { afterEach, expect, it, vi } from 'vitest';
import { createHistory } from '../../src/infrastructure/history_runtime.ts';
import { startBackground } from '../../src/infrastructure/background_runtime.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { memoryStore } from '../fixtures/runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

afterEach(() => { vi.unstubAllGlobals(); });
it('native history access is lazy and failure cannot prevent primary preferences from saving', async () => {
    const f = browserFixture(); const storage = memoryStore(); storage.values.set(SETTINGS_KEY, DEFAULT_SETTINGS);
    const open = vi.fn(() => { throw new Error('private'); }); vi.stubGlobal('indexedDB', { open });
    const { history } = createHistory(f.api, storage.port, vi.fn()); expect(open).not.toHaveBeenCalled();
    expect((await history.settings.update(value => ({ ...value, density: 'compact' }))).density).toBe('compact');
    await history.refresh(); expect(await history.read('diagnostics', () => true)).toMatchObject({ state: 'ready', retained: { state: 'unavailable' } });
    expect(open).toHaveBeenCalledWith('copilot.generated-history.v1', 2); history.stop();
});
it.each([true, undefined])('private-context %s is fail-closed without assuming that an optional extension API is present', async privateContext => {
    const f = browserFixture(); if (privateContext === undefined) delete f.api.extension; else f.api.extension!.inIncognitoContext = privateContext;
    const open = vi.fn(() => { throw new Error('private'); }); vi.stubGlobal('indexedDB', { open });
    const { history } = createHistory(f.api, memoryStore().port, vi.fn()); await history.refresh();
    expect(open.mock.calls.length > 0).toBe(privateContext !== true); expect(f.api.permissions.request).not.toHaveBeenCalled(); history.stop();
});
it('all background listeners are registered before native policy bootstrap; history notifications never reset content quarantine', async () => {
    const f = browserFixture(); const open = vi.fn(() => {
        for (const event of [f.onMessage, f.onUpdated, f.onRemoved, f.onActivated, f.permissionRemoved, f.changed, f.clicked]) expect(event.listeners.size).toBe(1);
        throw new Error('private');
    });
    vi.stubGlobal('indexedDB', { open }); const stop = startBackground(f.api); expect(open).not.toHaveBeenCalled();
    await new Promise<void>(resolve => { setImmediate(resolve); });
    expect(open).toHaveBeenCalled(); expect(f.api.runtime.sendMessage).toHaveBeenCalledWith({ version: 1, method: 'center.history.invalidated' });
    expect(f.api.tabs.query).not.toHaveBeenCalled(); expect(f.api.tabs.sendMessage).not.toHaveBeenCalled(); stop();
});
it('missing native IndexedDB remains an ordinary secondary-unavailable state', async () => {
    vi.stubGlobal('indexedDB', undefined); const f = browserFixture(); const { history } = createHistory(f.api, memoryStore().port, vi.fn());
    await history.refresh(); expect(await history.read('recents', () => true)).toMatchObject({ retained: { state: 'unavailable' }, collection: { collecting: false } }); history.stop();
});
