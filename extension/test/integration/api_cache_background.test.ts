import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { CONNECTED, deferred } from '../fixtures/runtime.ts';
import { CONFIG, pageSender } from '../fixtures/page_configuration.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { decodeApiCacheReply } from '../../src/domain/api_cache.ts';
import { createApiCache } from '../../src/infrastructure/api_cache_runtime.ts';
import { cacheSchedulerFixture } from '../fixtures/cache_scheduler.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture(prepare?: Parameters<typeof backgroundCenterFixture>[0]) { const h = backgroundCenterFixture(prepare); stops.push(h.stop); return h; }
async function review(client: Awaited<ReturnType<ReturnType<typeof backgroundCenterFixture>['client']>>) {
    const preview = decodeApiCacheReply(await client.requestApiCache({ method: 'center.cache.preview' }));
    if (preview?.state !== 'preview') throw new Error(`cache-review-${preview?.state}`); return preview;
}
it('actual worker cache clearing is independent of future preferences and keeps retained credentials, authored data and browser grants', async () => {
    const raw = { ...DEFAULT_SETTINGS, schemaVersion: 999 };
    const h = fixture(browser => { browser.localValues.set(SETTINGS_KEY, raw); browser.sessionValues.set(SESSION_KEY, CONNECTED); });
    const client = await h.client(); expect(client.view.data?.state).toBe('future');
    const before = { local: structuredClone(h.localValues), session: structuredClone(h.sessionValues) };
    const writes = { local: vi.mocked(h.localArea.set).mock.calls.length, session: vi.mocked(h.sessionArea.set).mock.calls.length };
    const preview = await review(client); expect(h.provider).not.toHaveBeenCalled();
    expect(await client.requestApiCache({ method: 'center.cache.confirm', operationId: preview.operationId })).toEqual({ state: 'cleared' });
    expect(await client.requestApiCache({ method: 'center.cache.result', operationId: preview.operationId })).toEqual({ state: 'cleared' });
    expect(await client.readOperation()).toMatchObject({ state: 'current', operation: { family: 'cache', stage: 'cleared', retention: 'untracked', fact: { kind: 'cache-operation', action: 'clear-api-cache', state: 'cleared' } } });
    expect(h.localValues).toEqual(before.local); expect(h.sessionValues).toEqual(before.session);
    expect(h.localArea.set).toHaveBeenCalledTimes(writes.local); expect(h.sessionArea.set).toHaveBeenCalledTimes(writes.session);
    expect(h.provider).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled(); expect(h.api.tabs.create).not.toHaveBeenCalled();
});
it('actual clearing aborts an old provider restoration lease, rejects its late response and keeps its retained credential and schedule reservation', async () => {
    const h = fixture(browser => { browser.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } } }); browser.sessionValues.set(SESSION_KEY, CONNECTED); });
    const client = await h.client(); const wait = deferred<Response>(); h.provider.mockReturnValueOnce(wait.promise);
    const pending = h.call(CONFIG, { ...pageSender, tab: { ...pageSender.tab, id: 10 } });
    await vi.waitFor(() => expect(h.provider).toHaveBeenCalledOnce()); const stored = structuredClone(h.sessionValues);
    const preview = await review(client); expect(await client.requestApiCache({ method: 'center.cache.confirm', operationId: preview.operationId })).toMatchObject({ state: 'cleared' });
    wait.resolve(new Response(JSON.stringify({ id: 1, login: 'octo' }), { headers: { 'content-type': 'application/json' } }));
    expect(await pending).toMatchObject({ state: 'stale' }); expect(h.provider).toHaveBeenCalledOnce(); expect(h.sessionValues).toEqual(stored);
    expect(h.sessionValues.get(SESSION_KEY)).toEqual(CONNECTED); expect(h.api.runtime.sendMessage).toHaveBeenCalledWith({ version: 1, method: 'center.invalidated' });
});
it('a real connected read session stays connected and an observer cannot clear or borrow an editor’s review', async () => {
    const h = fixture(); const editor = await h.client(); await editor.connections(CONNECTION_INPUT, 0);
    const status = await h.call({ version: 1, method: 'session.status' }); expect(status.state).toBe('connected');
    const preview = await review(editor); const vault = structuredClone(h.sessionValues); const reads = h.provider.mock.calls.length;
    const observer = await h.client({ ...h.sender, documentId: 'observer', tab: { id: 2, incognito: false } });
    expect(observer.view.role).toBe('observer'); expect(await observer.requestApiCache({ method: 'center.cache.confirm', operationId: preview.operationId })).toEqual({ state: 'denied' });
    expect(await editor.requestApiCache({ method: 'center.cache.confirm', operationId: preview.operationId })).toMatchObject({ state: 'cleared' });
    expect(await h.call({ version: 1, method: 'session.status' })).toEqual(status); expect(h.sessionValues).toEqual(vault); expect(h.provider).toHaveBeenCalledTimes(reads);
});
it('secondary lease/publication failures cannot change a real successful clear or repeat it, while stale witnesses produce no secondary effects', () => {
    const h = cacheSchedulerFixture(); const retire = vi.fn(() => { throw new Error('retire'); }); const notify = vi.fn(() => { throw new Error('publish'); });
    const cache = createApiCache(h.scheduler, retire, notify); const witness = cache.capture(); expect(cache.current(witness)).toBe(true);
    expect(cache.clear(witness, () => false)).toBe(false); expect(retire).not.toHaveBeenCalled();
    expect(cache.clear(witness, () => true)).toBe(true); expect(cache.current(witness)).toBe(false); expect(retire).toHaveBeenCalledOnce(); expect(notify).toHaveBeenCalledOnce();
    expect(cache.clear(witness, () => true)).toBe(false); expect(retire).toHaveBeenCalledOnce(); expect(notify).toHaveBeenCalledOnce();
});
