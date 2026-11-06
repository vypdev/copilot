import { expect, it, vi } from 'vitest';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { CENTER_BINDING } from '../fixtures/center.ts';
import { deferred } from '../fixtures/runtime.ts';

it('metadata has no native authority before opening or after its own disposal', async () => {
    const f = centerClientFixture(); expect(await f.client.readOperation()).toBeNull(); expect(f.port.send).not.toHaveBeenCalled();
    await f.client.start(); f.port.send.mockResolvedValueOnce({ state: 'empty', sourceTree: f.port.sourceTree }); expect(await f.client.readOperation()).toEqual({ state: 'empty' });
    expect(f.port.send.mock.lastCall![0]).toMatchObject({ version: 1, method: 'center.operation.read' }); f.client.stop(); const calls = f.port.send.mock.calls.length;
    expect(await f.client.readOperation()).toBeNull(); expect(f.port.send).toHaveBeenCalledTimes(calls);
});
it.each(['credential', 'controller', 'client'] as const)('a %s change while metadata is pending cannot publish the earlier current target', async boundary => {
    const f = centerClientFixture(); await f.client.start(); const gate = deferred<unknown>(); f.port.send.mockReturnValueOnce(gate.promise); const pending = f.client.readOperation();
    if (boundary === 'credential') { f.native.disconnect(); await f.client.refresh(); }
    if (boundary === 'controller') { const binding = { documentId: 'new', tabId: 2 }; const other = f.native.open(binding); f.native.controller.claim(other.clientId, binding, other.controllerEpoch); await f.client.refresh(); }
    if (boundary === 'client') { const own = f.native.open(CENTER_BINDING); f.native.controller.close(own.clientId, CENTER_BINDING, own.controllerEpoch); await f.client.start(); }
    gate.resolve({ state: 'empty', sourceTree: f.port.sourceTree }); expect(await pending).toBeNull(); f.client.stop();
});
it('a secondary transport failure does not poison an independently verified primary preference view', async () => {
    const f = centerClientFixture(); await f.client.start(); const before = f.client.view.data; f.port.send.mockRejectedValueOnce(new Error('private'));
    expect(await f.client.readOperation()).toBeNull(); expect(f.client.view.issue).toBeNull(); expect(f.client.view.data).toBe(before); f.client.stop();
});
it('metadata remains independently readable while a real primary persistence call is waiting', async () => {
    const f = centerClientFixture(); await f.client.start(); await f.client.preview({ type: 'preferences', values: { density: 'compact' } }, 0);
    const gate = deferred<void>(); const begun = deferred<void>(); const set = vi.mocked(f.native.port.set).getMockImplementation()!;
    vi.mocked(f.native.port.set).mockImplementationOnce(async (key, value) => { begun.resolve(); await gate.promise; await set(key, value); }); const pending = f.client.confirm(); await begun.promise;
    f.port.send.mockResolvedValueOnce({ state: 'empty', sourceTree: f.port.sourceTree }); expect(await f.client.readOperation()).toEqual({ state: 'empty' }); expect(f.client.view.phase).toBe('committing');
    gate.resolve(); await pending; expect(f.client.view.review?.state).toBe('saved'); f.client.stop();
});
