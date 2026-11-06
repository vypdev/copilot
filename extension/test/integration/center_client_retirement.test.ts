import { afterEach, expect, it } from 'vitest';
import { CenterClient } from '../../src/application/center_client.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { CENTER_BINDING } from '../fixtures/center.ts';
import { deferred } from '../fixtures/runtime.ts';

const clients: CenterClient[] = [];
const intent = { type: 'preferences', values: { density: 'compact' } };
function fixture() { const h = centerClientFixture(); clients.push(h.client); return h; }
afterEach(() => clients.splice(0).forEach(client => client.stop()));

it('a synchronous disposal during a refresh notification prevents the queued native read', async () => {
    const h = fixture(); await h.client.start(); const before = h.port.send.mock.calls.length;
    h.client.subscribe(view => { if (view.phase === 'reading') h.client.stop(); });
    await h.client.refresh(); expect(h.client.view.phase).toBe('stopped');
    expect(h.port.send.mock.calls.slice(before).map(([message]) => message.method)).toEqual(['center.close']);
});
it('a lost native document with no preview retires its editing role without manufacturing a stale review', async () => {
    const h = fixture(); await h.client.start(); h.native.controller.releaseTab(CENTER_BINDING.tabId!);
    await h.client.refresh(); expect(h.client.view).toMatchObject({ issue: 'stale', role: null, review: null, connections: null });
    await h.client.confirm(); expect(h.native.port.set).not.toHaveBeenCalled();
});
it.each(['controller', 'credential'] as const)('a fresh %s epoch invalidates an unchanged pending plan even when this document is still editor', async fence => {
    const h = fixture(); await h.client.start(); const original = h.native.open(); await h.client.preview(intent, 0);
    if (fence === 'credential') h.native.disconnect();
    else {
        const binding = { documentId: 'temporary-editor', tabId: 2 }; const other = h.native.open(binding);
        const claimed = h.native.controller.claim(other.clientId, binding, original.controllerEpoch);
        expect(claimed.state).toBe('ready'); if (claimed.state !== 'ready') throw new Error('fixture-claim-failed');
        expect(h.native.controller.claim(original.clientId, CENTER_BINDING, claimed.controllerEpoch)).toMatchObject({ state: 'ready', role: 'editor' });
    }
    await h.client.refresh(); expect(h.client.view.data?.role).toBe('editor'); expect(h.client.view.review?.state).toBe('stale');
    await h.client.confirm(); expect(h.native.port.set).not.toHaveBeenCalled();
});
it.each(['missing', 'foreign'] as const)('a late %s takeover reply cannot release a different native client or revive the retired view', async response => {
    const h = fixture(); await h.client.start(); const binding = { documentId: 'independent-client', tabId: 2 }; const other = h.native.open(binding);
    const begun = deferred<void>(); const release = deferred<void>();
    h.port.send.mockImplementationOnce(async () => { begun.resolve(); await release.promise; return response === 'missing' ? null : { ...other, sourceTree: h.port.sourceTree }; });
    const claiming = h.client.takeControl(); await begun.promise; h.client.stop(); release.resolve(); await claiming;
    expect(h.client.view.phase).toBe('stopped');
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.close')).toHaveLength(1);
    expect(h.native.controller.authorize(other.clientId, binding)).not.toBe(null);
});
it('a delayed preview cannot restore a public draft after its native page has closed', async () => {
    const h = fixture(); await h.client.start(); const send = h.port.send.getMockImplementation()!;
    const begun = deferred<void>(); const release = deferred<void>();
    h.port.send.mockImplementationOnce(async message => { const reply = await send(message); begun.resolve(); await release.promise; return reply; });
    const previewing = h.client.preview(intent, 0); await begun.promise; h.client.stop(); release.resolve(); await previewing;
    expect(h.client.view).toMatchObject({ phase: 'stopped', review: null }); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a rejected preview transport retains the safe failure state without a second issue or private error text', async () => {
    const h = fixture(); await h.client.start(); h.port.send.mockRejectedValueOnce(new Error('private-transport-detail'));
    await h.client.preview(intent, 0); expect(h.client.view).toMatchObject({ phase: 'ready', issue: 'unavailable', review: null });
    expect(JSON.stringify(h.client.view)).not.toContain('private-transport-detail'); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('an acknowledged save arriving after disposal preserves its one native effect without repainting or replaying it', async () => {
    const h = fixture(); await h.client.start(); await h.client.preview(intent, 0); const send = h.port.send.getMockImplementation()!;
    const begun = deferred<void>(); const release = deferred<void>();
    h.port.send.mockImplementationOnce(async message => { const reply = await send(message); begun.resolve(); await release.promise; return reply; });
    const saving = h.client.confirm(); await begun.promise; expect(h.native.port.set).toHaveBeenCalledTimes(1);
    h.client.stop(); release.resolve(); await saving; expect(h.client.view).toMatchObject({ phase: 'stopped', review: null });
    const next = new CenterClient(h.port); clients.push(next); await next.start();
    expect(next.view.data?.settings).toMatchObject({ revision: 1, density: 'compact' });
    expect(h.native.port.set).toHaveBeenCalledTimes(1); expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
});
