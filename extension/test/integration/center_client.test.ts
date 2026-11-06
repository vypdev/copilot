import { expect, it, vi } from 'vitest';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { CENTER_BINDING } from '../fixtures/center.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

const intent = { type: 'preferences', values: { density: 'compact' } };
it('connects the native closed protocol, retains a private preview and observes its one confirmed commit', async () => {
    const h = centerClientFixture(); await h.client.start();
    expect(h.client.view).toMatchObject({ phase: 'ready', data: { state: 'ready', role: 'editor', settings: { revision: 0 } } });
    await h.client.preview(intent, 0); expect(h.client.view.review).toMatchObject({ state: 'preview', before: { density: 'comfortable' }, after: { density: 'compact' } });
    expect(Object.hasOwn(h.client.view.review!, 'operationId')).toBe(false); expect(Object.isFrozen(h.client.view.review?.after)).toBe(true);
    await h.client.confirm(); expect(h.client.view).toMatchObject({ phase: 'ready', data: { settings: { revision: 1, density: 'compact' } }, review: { state: 'saved' } });
    expect(h.native.port.set).toHaveBeenCalledTimes(1); await h.client.confirm(); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    h.client.dismiss(); expect(h.client.view.review).toBeNull(); h.client.stop(); h.client.stop(); expect(h.client.view.phase).toBe('stopped');
});
it('cancel and local dismissal do not persist a preview or retry a consumed confirmation', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    await h.client.dismiss(); await h.client.cancel(); await h.client.refresh();
    expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.client.view.review?.state).toBe('cancelled');
    h.client.dismiss(); expect(h.client.view.review).toBeNull();
});
it('a changed credential epoch or draft revision is rejected before a preview can be admitted', async () => {
    const h = centerClientFixture(); await h.client.start(); h.native.disconnect();
    await h.client.preview(intent, 0); expect(h.client.view.issue).toBe('stale'); expect(h.native.port.set).not.toHaveBeenCalled();
    await h.client.refresh(); await h.native.repository.update(settings => ({ ...settings, locale: 'es' }));
    await h.client.preview(intent, 0); expect(h.client.view.issue).toBe('conflict'); expect(h.client.view.review).toBeNull();
    expect(h.native.values.get(SETTINGS_KEY)).toMatchObject({ current: { locale: 'es', density: 'comfortable' } });
});
it('read-only windows require explicit takeover and current readback before gaining editor controls', async () => {
    const h = centerClientFixture(); h.native.open({ documentId: 'other-window', tabId: 2 }); await h.client.start();
    expect(h.client.view.data?.role).toBe('observer'); await h.client.preview(intent, 0); expect(h.client.view.issue).toBe('denied');
    await h.client.takeControl(); expect(h.client.view.data?.role).toBe('editor'); expect(h.client.view.issue).toBeNull();
    await h.client.preview(intent, 0); expect(h.client.view.review?.state).toBe('preview'); await h.client.cancel();
});
it('a reload after takeover retires the old approval and never renders a stale preview as confirmable', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    const binding = { documentId: 'two', tabId: 2 }; const other = h.native.open(binding); h.native.controller.claim(other.clientId, binding, other.controllerEpoch);
    await h.client.refresh(); expect(h.client.view).toMatchObject({ data: { role: 'observer' }, review: { state: 'stale' } });
    await h.client.confirm(); expect(h.native.port.set).not.toHaveBeenCalled();
    h.client.dismiss(); await h.client.takeControl(); expect(h.client.view.data?.role).toBe('editor');
});
it('read invalidation during persistence is coalesced until saved facts are retained', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    const begun = deferred<void>(); const persist = deferred<void>();
    vi.mocked(h.native.port.set).mockImplementationOnce(async (key, value) => { begun.resolve(); await persist.promise; h.native.values.set(key, value); });
    const saving = h.client.confirm(); await begun.promise; await h.client.refresh(); await h.client.refresh();
    expect(h.client.view.phase).toBe('committing'); persist.resolve(); await saving;
    expect(h.client.view).toMatchObject({ data: { settings: { revision: 1 } }, review: { state: 'saved' } });
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
});
it('a lost response preserves uncertainty, then reconciles an exact observed receipt without another write', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    const send = h.port.send.getMockImplementation()!;
    h.port.send.mockImplementationOnce(async message => { await send(message); throw new Error('private transport data'); });
    await h.client.confirm(); expect(h.client.view.review?.state).toBe('unknown');
    await h.client.refresh(); expect(h.client.view.review).toMatchObject({ state: 'saved', outcome: { acknowledgement: 'unknown' } });
    expect(h.native.port.set).toHaveBeenCalledTimes(1); expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
});
it('a mismatched installed source cannot leave old authority available to preview or confirm', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    h.port.send.mockResolvedValueOnce({ state: 'ready', sourceTree: 'e'.repeat(64) }); await h.client.refresh();
    expect(h.client.view.issue).toBe('incompatible'); await h.client.confirm(); expect(h.native.port.set).not.toHaveBeenCalled();
    h.client.dismiss(); expect(h.client.view.review).toBeNull();
});
it('unmounting during the committing notification prevents the native write from starting', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    const unsubscribe = h.client.subscribe(view => { if (view.phase === 'committing') h.client.stop(); });
    await h.client.confirm(); unsubscribe(); expect(h.client.view.phase).toBe('stopped'); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(h.port.send.mock.calls.some(([message]) => message.method === 'center.confirm')).toBe(false);
});
it('an expired native client requires a fresh handshake rather than reviving its old preview', async () => {
    const h = centerClientFixture(); await h.client.start(); await h.client.preview(intent, 0);
    h.native.controller.releaseTab(CENTER_BINDING.tabId!); await h.client.refresh(); expect(h.client.view.issue).toBe('stale');
    expect(h.client.view.review?.state).toBe('stale'); await h.client.refresh(); expect(h.client.view.data?.role).toBe('editor');
    expect(h.client.view.review).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
});
