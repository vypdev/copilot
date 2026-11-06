import { expect, it } from 'vitest';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { deferred } from '../fixtures/runtime.ts';

it('retired semantic client ignores routine refreshes while an explicit read may open a fresh handshake', async () => {
    const h = centerClientFixture(); await h.client.start(); h.client.disconnected(); const count = h.port.send.mock.calls.length;
    await h.client.refreshActive(); expect(h.port.send).toHaveBeenCalledTimes(count); expect(h.client.view.role).toBeNull();
    await h.client.refresh(); expect(h.client.view.role).toBe('editor'); expect(h.port.send.mock.calls.slice(count).map(([value]) => value.method)).toEqual(['center.open', 'center.read']); h.client.stop();
});
it('an already disposed semantic client cannot be repainted by a native disconnect callback', async () => {
    const h = centerClientFixture(); await h.client.start(); h.client.stop(); const closed = h.client.view;
    h.client.disconnected(); expect(h.client.view).toBe(closed); expect(h.client.view.phase).toBe('stopped');
});
it('a late old-generation incompatible reply cannot retire the replacement owner or overwrite its current state', async () => {
    const h = centerClientFixture(); await h.client.start(); const wait = deferred<unknown>(); const begun = deferred<void>();
    h.port.send.mockImplementationOnce(() => { begun.resolve(); return wait.promise; }); const oldRead = h.client.refresh(); await begun.promise;
    h.client.disconnected(); await h.client.refresh(); expect(h.client.view.issue).toBeNull(); expect(h.client.view.role).toBe('editor');
    wait.resolve({ sourceTree: 'foreign' }); await oldRead; expect(h.client.view.issue).toBeNull(); expect(h.client.view.role).toBe('editor'); h.client.stop();
});
it('a late old-generation rejected request cannot change the recovered page back to unavailable', async () => {
    const h = centerClientFixture(); await h.client.start(); const wait = deferred<unknown>(); const begun = deferred<void>();
    h.port.send.mockImplementationOnce(() => { begun.resolve(); return wait.promise; }); const oldRead = h.client.refresh(); await begun.promise;
    h.client.disconnected(); await h.client.refresh(); wait.reject(new Error('private-old-request')); await oldRead;
    expect(h.client.view.issue).toBeNull(); expect(h.client.view.role).toBe('editor'); h.client.stop();
});
