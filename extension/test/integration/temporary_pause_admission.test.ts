import { expect, it, vi } from 'vitest';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { scopedSettings } from '../fixtures/page_configuration.ts';
import { deferred, PAGE } from '../fixtures/runtime.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';
import { temporaryPauseFixture as fixture, temporaryPauseDocument as document } from '../fixtures/temporary_pause.ts';
it('the missing pause record is read-only and does not grant an unconnected repository', async () => {
    const h = fixture(); expect(await h.call()).toMatchObject({ state: 'ready', connected: false, settings: { paused: false } });
    expect(h.store.port.set).not.toHaveBeenCalled(); expect(h.store.port.remove).not.toHaveBeenCalled();
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.store.port.get).toHaveBeenCalledWith(TEMPORARY_PAUSES_KEY);
});
it.each([
    ['emergency', document(true)], ['current tab', document(false, [1])], ['corrupt', { schemaVersion: 1, emergency: false }],
    ['future', { schemaVersion: 2, emergency: false }],
])('a cold %s restriction stops before credential inspection or restoration HTTP', async (_, value) => {
    const h = fixture(); h.cold(); h.store.values.set(TEMPORARY_PAUSES_KEY, value);
    expect(await h.call()).toMatchObject({ state: 'ready', connected: false, settings: { paused: true } });
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.port.get).not.toHaveBeenCalled();
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.store.values.get(TEMPORARY_PAUSES_KEY)).toEqual(value);
    expect(h.store.port.set).not.toHaveBeenCalled();
});
it('the native tab binding is distinct from page-controlled repository, viewer and generation operands', async () => {
    const h = fixture(); h.cold(); h.store.values.set(TEMPORARY_PAUSES_KEY, document(false, [2]));
    expect(await h.call()).toMatchObject({ state: 'ready', connected: true, settings: { paused: false } });
    expect(h.reader.read).toHaveBeenCalledTimes(2);
});
it('an unpaused temporary scope cannot resume inherited repository or global pauses', async () => {
    const h = fixture(); h.cold(); h.store.values.set(TEMPORARY_PAUSES_KEY, document());
    h.local.values.set('copilot.settings.v1', { ...scopedSettings(), paused: true });
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a reader protection refusal fails closed without reading another store or requesting permission', async () => {
    const h = fixture(); h.cold(); h.protect.mockResolvedValue(false);
    expect(await h.call()).toMatchObject({ state: 'ready', connected: false, settings: { paused: true } });
    expect(h.store.port.get).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['protect', 'read'] as const)('a native %s exception is an unknown restriction, never an empty unpaused document', async stage => {
    const h = fixture(); h.cold();
    if (stage === 'protect') h.protect.mockRejectedValue(new Error('private native error'));
    else vi.mocked(h.store.port.get).mockRejectedValue(new Error('private native error'));
    expect(await h.call()).toMatchObject({ state: 'ready', connected: false, settings: { paused: true } });
    expect(h.reader.read).not.toHaveBeenCalled(); expect(JSON.stringify(await h.pauses.read())).not.toContain('private native error');
});
it('a newer pause revision during restoration prevents the object GET even before a native notification', async () => {
    const h = fixture(); h.cold(); h.store.values.set(TEMPORARY_PAUSES_KEY, document());
    const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const request = h.call(PAGE); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1));
    h.store.values.set(TEMPORARY_PAUSES_KEY, { ...document(true), revision: 2 });
    pending.resolve({ state: 'ok', bytes: 1, etag: '', data: { id: '1', login: 'octo' } });
    expect(await request).toMatchObject({ state: 'paused' }); expect(h.reader.read).toHaveBeenCalledTimes(2);
});
it('a final unavailable pause read cannot authorize the object GET from the earlier unpaused observation', async () => {
    const h = fixture(); await h.connected(); const original = vi.mocked(h.store.port.get).getMockImplementation()!; let reads = 0;
    vi.mocked(h.store.port.get).mockImplementation(key => ++reads === 2 ? Promise.reject(new Error('unavailable')) : original(key));
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('native lease withdrawal during the first protected pause observation prevents even a paused receipt from the old source', async () => {
    const h = fixture(); h.cold(); const pending = deferred<unknown>(); vi.mocked(h.store.port.get).mockReturnValueOnce(pending.promise);
    const request = h.call(); await vi.waitFor(() => expect(h.store.port.get).toHaveBeenCalled()); h.gateway.invalidate();
    pending.resolve(document(true)); expect(await request).toMatchObject({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('caller mutation after native decode cannot change the admitted restriction', async () => {
    const h = fixture(); const value = document(true); vi.mocked(h.store.port.get).mockResolvedValue(value);
    const loaded = await h.pauses.read(); value.emergency = false; value.tabs.push(8);
    expect(loaded).toMatchObject({ state: 'ready', value: { emergency: true, tabs: [] } }); expect(Object.isFrozen(value)).toBe(false);
});
