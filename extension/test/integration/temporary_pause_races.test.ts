import { expect, it, vi } from 'vitest';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { PageConfigurationService } from '../../src/application/page_configuration.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { CONFIG } from '../fixtures/page_configuration.ts';
import { temporaryPauseFixture as fixture, temporaryPauseDocument as document } from '../fixtures/temporary_pause.ts';
import { deferred, PAGE } from '../fixtures/runtime.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';

it('an unbound direct application call cannot select a tab or start restoration', async () => {
    const h = fixture(); h.cold(); const service = new PageConfigurationService(h.repository, h.service, h.pauses);
    expect(await service.resolve(CONFIG, new BrowserCancellation(), () => true, true, true)).toMatchObject({ settings: { paused: true } });
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled();
});
it('equivalent reordered native documents do not create a false conflict', async () => {
    const h = fixture(); await h.connected(); h.store.values.set(TEMPORARY_PAUSES_KEY, document(false, [9, 7]));
    vi.mocked(h.store.port.get).mockResolvedValueOnce({ tabs: [7, 9], emergency: false, revision: 1, schemaVersion: 1 });
    expect(await h.call(PAGE)).toMatchObject({ state: 'current' }); expect(h.reader.read).toHaveBeenCalledTimes(1);
});
it.each(['revision', 'disappeared'] as const)('a %s pause document after restoration cannot publish an older unpaused observation', async kind => {
    const h = fixture(); h.cold(); h.store.values.set(TEMPORARY_PAUSES_KEY, document());
    const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const request = h.call(PAGE); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1));
    if (kind === 'revision') h.store.values.set(TEMPORARY_PAUSES_KEY, { ...document(), revision: 2 });
    else h.store.values.delete(TEMPORARY_PAUSES_KEY);
    pending.resolve({ state: 'ok', bytes: 1, etag: '', data: { id: '1', login: 'octo' } });
    expect(await request).toMatchObject({ state: 'paused' }); expect(h.reader.read).toHaveBeenCalledTimes(2);
});
it('a lease invalidated during the final pause read retires configuration and prevents the object GET', async () => {
    const h = fixture(); await h.connected(); const pending = deferred<unknown>(); const original = vi.mocked(h.store.port.get).getMockImplementation()!; let reads = 0;
    vi.mocked(h.store.port.get).mockImplementation(key => ++reads === 2 ? pending.promise : original(key));
    const request = h.call(PAGE); await vi.waitFor(() => expect(reads).toBe(2)); h.gateway.invalidate(); pending.resolve(undefined);
    expect(await request).toMatchObject({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a source retired while native protection is pending cannot start credential inspection', async () => {
    const h = fixture(); h.cold(); const pending = deferred<boolean>(); h.protect.mockReturnValueOnce(pending.promise);
    const request = h.call(); await vi.waitFor(() => expect(h.protect).toHaveBeenCalled()); h.gateway.invalidate(); pending.resolve(true);
    expect(await request).toMatchObject({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a pause appearing during final settings observation is checked before the object GET', async () => {
    const h = fixture(); await h.connected(); const pending = deferred<unknown>(); const original = vi.mocked(h.local.port.get).getMockImplementation()!; let reads = 0;
    vi.mocked(h.local.port.get).mockImplementation(key => ++reads === 2 ? pending.promise : original(key));
    const request = h.call(PAGE); await vi.waitFor(() => expect(reads).toBe(2)); h.store.values.set(TEMPORARY_PAUSES_KEY, document(true));
    pending.resolve(h.local.values.get(SETTINGS_KEY)); expect(await request).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('native protection withdrawn only at final observation prevents the object GET', async () => {
    const h = fixture(); await h.connected(); h.protect.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('revocation during a pause observation cannot publish the old selected profile', async () => {
    const h = fixture(); await h.connected(); const pending = deferred<unknown>(); vi.mocked(h.store.port.get).mockReturnValueOnce(pending.promise);
    const request = h.call(); await vi.waitFor(() => expect(h.store.port.get).toHaveBeenCalled()); await h.service.revoke(); pending.resolve(undefined);
    expect(await request).toMatchObject({ state: 'ready', connected: false, settings: { density: 'comfortable', shortcuts: false } }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a new foreground observation of a pause retires an older suspended read without waiting for an event', async () => {
    const h = fixture(); h.cold(); const pending = deferred<unknown>(); vi.mocked(h.store.port.get).mockReturnValueOnce(pending.promise);
    const old = h.call(); await vi.waitFor(() => expect(h.store.port.get).toHaveBeenCalledTimes(1));
    h.store.values.set(TEMPORARY_PAUSES_KEY, document(true)); expect(await h.call()).toMatchObject({ settings: { paused: true } });
    pending.resolve(document()); expect({ outcome: await old, providerReads: vi.mocked(h.reader.read).mock.calls.length })
        .toMatchObject({ outcome: { state: 'stale' }, providerReads: 0 });
});
it('a newer observation while final native tab inspection is pending cannot leave an older successful receipt current', async () => {
    const h = fixture(); await h.connected(); const pending = deferred<{ url: string; active: boolean; incognito: boolean }>();
    h.ports.currentTab.mockResolvedValueOnce({ url: PAGE.route, active: true, incognito: false }).mockReturnValueOnce(pending.promise);
    const old = h.call(); await vi.waitFor(() => expect(h.ports.currentTab).toHaveBeenCalledTimes(2));
    h.store.values.set(TEMPORARY_PAUSES_KEY, document(true)); expect(await h.call()).toMatchObject({ settings: { paused: true } });
    pending.resolve({ url: PAGE.route, active: true, incognito: false }); expect(await old).toMatchObject({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a native liveness callback that synchronously retires the lease cannot authorize credential inspection', async () => {
    const h = fixture(); h.cold(); h.ports.online.mockReturnValueOnce(true).mockImplementation(() => { h.gateway.invalidate(); return true; });
    expect(await h.call()).toMatchObject({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled();
});
