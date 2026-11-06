import { expect, it, vi } from 'vitest';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SETTINGS_OWNER, settingsOperationsFixture } from '../fixtures/settings_operations.ts';

const intent = { type: 'preferences', values: { density: 'compact' } };
it('rejects invalid draft revision inputs before touching storage or obtaining an operation handle', async () => {
    const h = settingsOperationsFixture();
    for (const revision of [-1, NaN, Infinity, 0.5]) expect(await h.operations.preview(intent, SETTINGS_OWNER, revision)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.ports.identifier).not.toHaveBeenCalled();
});
it('reports malformed or unavailable opening replies safely and can explicitly reconnect', async () => {
    for (const reply of [null, { state: 'ready' }]) {
        const h = centerClientFixture(); h.port.send.mockResolvedValueOnce(reply === null ? null : { ...reply, sourceTree: h.port.sourceTree });
        await h.client.start(); expect(h.client.view.issue).toBe('unavailable'); expect(h.client.view.data).toBeNull();
        await h.client.refresh(); expect(h.client.view.data?.state).toBe('ready'); h.client.stop();
    }
});
it('never applies a snapshot belonging to another native client and requires a successful fresh read before editing', async () => {
    const h = centerClientFixture(); await h.client.start();
    h.port.send.mockResolvedValueOnce({ state: 'ready', clientId: 'f'.repeat(32), role: 'editor', controllerEpoch: 0, credentialEpoch: 0,
        loaded: { state: 'ready', migrated: false, settings: { ...DEFAULT_SETTINGS, theme: 'dark' } }, rollbackAvailable: false, lastOperation: null, sourceTree: h.port.sourceTree });
    await h.client.refresh(); expect(h.client.view.issue).toBe('unavailable'); expect(h.client.view.data?.settings?.theme).toBe('github');
    const calls = h.port.send.mock.calls.length; await h.client.preview(intent, 0); expect(h.port.send).toHaveBeenCalledTimes(calls);
    await h.client.refresh(); expect(h.client.view.issue).toBeNull();
});
it('a malformed current read prevents confirmation but still permits explicit cancellation of the pending review', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    h.port.send.mockResolvedValueOnce(null); await h.client.refresh(); await h.client.confirm();
    expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.client.view.review?.state).toBe('preview');
    await h.client.cancel(); expect(h.client.view.review?.state).toBe('cancelled');
});
it('maps closed rejection, blocked-schema and malformed preview replies into actionable noneditable state', async () => {
    for (const state of ['busy', 'invalid', 'unchanged', 'future', 'corrupt', 'migration-required', 'preview']) {
        const h = centerClientFixture(); await h.client.start();
        h.port.send.mockResolvedValueOnce({ state, ...(state === 'invalid' ? { reason: 'invalid-input' } : {}), sourceTree: h.port.sourceTree });
        await h.client.preview(intent, 0); expect(h.client.view.review).toBeNull();
        expect(h.client.view.issue).toBe(['busy', 'invalid', 'unchanged'].includes(state) ? state : 'unavailable');
        expect(h.native.port.set).not.toHaveBeenCalled();
    }
});
it('an invalid takeover response never replaces this window with another client identity', async () => {
    for (const body of [{ state: 'stale' }, { state: 'ready', clientId: 'f'.repeat(32), role: 'editor', controllerEpoch: 1, credentialEpoch: 0 }]) {
        const h = centerClientFixture(); h.native.open({ documentId: 'other', tabId: 2 }); await h.client.start();
        h.port.send.mockResolvedValueOnce({ ...body, sourceTree: h.port.sourceTree }); await h.client.takeControl();
        expect(h.client.view.issue).toBe('stale'); expect(h.client.view.data?.role).toBe('observer');
    }
});
it('distinguishes a concurrent settings edit, an expired preview and inaccessible persistence without retrying', async () => {
    for (const state of ['conflict', 'expired', 'unavailable'] as const) {
        const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
        if (state === 'conflict') await h.native.repository.update(settings => ({ ...settings, locale: 'es' }));
        if (state === 'expired') h.native.advance(300001);
        if (state === 'unavailable') vi.mocked(h.native.port.get).mockRejectedValueOnce(new Error('private-storage-detail'));
        await h.client.confirm(); expect(h.client.view.review?.state).toBe(state === 'expired' ? 'stale' : state);
        expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
        expect(JSON.stringify(h.client.view)).not.toContain('private-storage-detail');
    }
});
it('unexpected saved revisions remain uncertain, and a mismatched receipt cannot prove this window saved', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    const send = h.port.send.getMockImplementation()!;
    h.port.send.mockImplementationOnce(async message => { await send(message); return { state: 'committed', revision: 99, acknowledgement: 'accepted', current: true, sourceTree: h.port.sourceTree }; });
    await h.client.confirm(); expect(h.client.view.review?.state).toBe('unknown');
    const envelope = h.native.values.get(SETTINGS_KEY) as { current: unknown; previous: unknown; operation: unknown };
    h.native.values.set(SETTINGS_KEY, { ...envelope, operation: { id: 'f'.repeat(32), beforeRevision: 0 } });
    await h.client.refresh(); expect(h.client.view.review?.state).toBe('unknown'); expect(h.native.port.set).toHaveBeenCalledTimes(1);
});
