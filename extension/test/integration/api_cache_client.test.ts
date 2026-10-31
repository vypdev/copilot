import { expect, it, vi } from 'vitest';
import { apiCacheClientFixture } from '../fixtures/api_cache_client.ts';
import { deferred } from '../fixtures/runtime.ts';

it('reviews and explicitly cancels without clearing, privately retaining the result across closing and reopening', async () => {
    const h = apiCacheClientFixture(); await h.client.preview(); expect(h.client.view).toMatchObject({ status: 'preview', open: true, retained: true });
    expect(JSON.stringify(h.client.view)).not.toContain('operationId'); expect(Object.isFrozen(h.client.view)).toBe(true);
    await h.client.preview(); expect(h.clientPorts.request).toHaveBeenCalledTimes(1); expect(h.cache.clear).not.toHaveBeenCalled();
    expect(await h.client.dismiss()).toBe(true); expect(h.client.view).toMatchObject({ status: 'cancelled', open: false, retained: true });
    await h.client.inspect(); expect(h.client.view).toMatchObject({ status: 'cancelled', open: true });
    await h.client.cancel(); await h.client.confirm(); expect(h.cache.clear).not.toHaveBeenCalled();
    await h.client.dismiss(); await h.client.preview(); expect(h.client.view.status).toBe('preview');
});
it('a lost clear acknowledgement is inspected without resubmission, and known clearing survives a failed result read', async () => {
    const h = apiCacheClientFixture(); await h.client.preview(); const send = h.clientPorts.request.getMockImplementation()!;
    h.clientPorts.request.mockImplementationOnce(async input => { await send(input); throw new Error('private-native-response'); });
    await h.client.confirm(); expect(h.cache.clear).toHaveBeenCalledOnce(); expect(h.client.view.status).toBe('unknown');
    await h.client.confirm(); expect(h.cache.clear).toHaveBeenCalledOnce(); expect(await h.client.dismiss()).toBe(true);
    expect(h.client.view.retained).toBe(true); await h.client.inspect(); expect(h.client.view.status).toBe('cleared');
    h.clientPorts.request.mockResolvedValueOnce({ state: 'cleared', privateBody: 'never-render' }); await h.client.inspect();
    expect(h.client.view.status).toBe('cleared'); expect(JSON.stringify(h.client.view)).not.toContain('never-render');
    await h.client.cancel(); expect(h.cache.clear).toHaveBeenCalledOnce();
});
it('an unsubmitted result allows explicit keeping but cannot authorize a late or repeated confirm', async () => {
    const h = apiCacheClientFixture(); await h.client.preview();
    h.clientPorts.request.mockResolvedValueOnce(null); await h.client.confirm(); expect(h.client.view.status).toBe('unknown');
    await h.client.inspect(); expect(h.client.view.status).toBe('not-submitted'); await h.client.confirm(); expect(h.cache.clear).not.toHaveBeenCalled();
    expect(await h.client.dismiss()).toBe(true); expect(h.client.view.status).toBe('cancelled');
    const id = h.clientPorts.request.mock.calls.find(([input]) => input.method === 'center.cache.confirm')![0];
    const send = h.clientPorts.request.getMockImplementation()!; expect(await send(id)).toEqual({ state: 'cancelled' }); expect(h.cache.clear).not.toHaveBeenCalled();
});
it('pending calls serialize actions, protect navigation and ignore their late result after source retirement or stop', async () => {
    const h = apiCacheClientFixture(); const wait = deferred<unknown>(); h.clientPorts.request.mockReturnValueOnce(wait.promise);
    const pending = h.client.preview(); expect(h.client.busy).toBe(true); expect(h.client.held).toBe(true); expect(await h.client.dismiss()).toBe(false);
    await h.client.preview(); await h.client.confirm(); await h.client.cancel(); await h.client.inspect(); expect(h.clientPorts.request).toHaveBeenCalledOnce();
    h.client.contextChanged(); wait.resolve({ state: 'preview', operationId: 'a'.repeat(32), expiresAt: 2000 }); await pending;
    expect(h.client.view).toMatchObject({ phase: 'idle', retained: false, status: 'stale' }); await h.client.dismiss(); await h.client.preview();
    const confirm = deferred<unknown>(); h.clientPorts.request.mockReturnValueOnce(confirm.promise); const attempt = h.client.confirm(); h.client.stop(); h.client.stop();
    confirm.resolve({ state: 'cleared' }); await attempt; const calls = h.clientPorts.request.mock.calls.length;
    await h.client.preview(); await h.client.confirm(); await h.client.cancel(); await h.client.inspect(); h.client.contextChanged();
    expect(h.client.view).toEqual({ phase: 'idle', status: null, open: false, retained: false }); expect(h.clientPorts.request).toHaveBeenCalledTimes(calls);
});
it('rejects expired, backward-clock or malformed previews and never clears without foreground editing admission', async () => {
    const h = apiCacheClientFixture(); h.allow(false); await h.client.preview(); expect(h.clientPorts.request).not.toHaveBeenCalled(); h.allow(true);
    h.clientPorts.request.mockResolvedValueOnce({ state: 'preview', operationId: 'a'.repeat(32), expiresAt: 1000 }); await h.client.preview();
    expect(h.client.view.status).toBe('unavailable'); expect(h.client.view.retained).toBe(false); await h.client.dismiss(); await h.client.preview();
    h.allow(false); await h.client.confirm(); await h.client.inspect(); await h.client.cancel(); expect(h.cache.clear).not.toHaveBeenCalled();
    h.allow(true); h.advanceReview(300_000); await h.client.confirm(); expect(h.client.view.status).toBe('expired'); expect(h.cache.clear).not.toHaveBeenCalled();
    await h.client.dismiss(); h.clientPorts.now.mockImplementationOnce(() => { throw new Error('clock'); }); await h.client.preview();
    expect(h.client.view.status).toBe('unavailable');
});
it('closing an uncertain operation keeps its selector even when a separate review is refused as busy', async () => {
    const h = apiCacheClientFixture(); await h.client.preview(); h.clientPorts.request.mockResolvedValueOnce(null); await h.client.confirm();
    await h.client.dismiss(); await h.client.preview(); expect(h.client.view.status).toBe('busy'); expect(h.client.view.retained).toBe(true);
    await h.client.inspect(); expect(h.client.view.status).toBe('not-submitted'); await h.client.cancel(); expect(h.client.view.status).toBe('cancelled');
    expect(h.cache.clear).not.toHaveBeenCalled();
});
it('a new review with a lost acknowledgement cannot borrow an earlier completed operation’s result', async () => {
    const h = apiCacheClientFixture(); await h.client.preview(); await h.client.confirm(); expect(h.client.view.status).toBe('cleared');
    await h.client.dismiss(); const send = h.clientPorts.request.getMockImplementation()!;
    h.clientPorts.request.mockImplementationOnce(async input => { await send(input); return null; });
    await h.client.preview(); expect(h.client.view.status).toBe('unavailable'); expect(h.client.view.retained).toBe(false);
    const calls = h.clientPorts.request.mock.calls.length; await h.client.inspect(); expect(h.clientPorts.request).toHaveBeenCalledTimes(calls);
    expect(h.cache.clear).toHaveBeenCalledOnce();
});
it('synchronous rendering notifications that retire editing authority prevent every later request handoff', async () => {
    for (const action of ['preview', 'inspect', 'confirm'] as const) {
        const h = apiCacheClientFixture(); if (action !== 'preview') await h.client.preview();
        const calls = h.clientPorts.request.mock.calls.length;
        h.clientPorts.changed.mockImplementationOnce(() => { h.client.contextChanged(); });
        await h.client[action](); expect(h.clientPorts.request).toHaveBeenCalledTimes(calls);
        expect(h.client.view).toMatchObject({ phase: 'idle', status: 'stale', retained: false }); expect(h.cache.clear).not.toHaveBeenCalled();
    }
});
it('a late result read cannot restore a retired source, and failed reads preserve only already established completion facts', async () => {
    const h = apiCacheClientFixture(); await h.client.preview(); const wait = deferred<unknown>(); h.clientPorts.request.mockReturnValueOnce(wait.promise);
    const pending = h.client.inspect(); h.reviews.invalidate(); h.client.contextChanged(); wait.resolve({ state: 'cleared' }); await pending;
    expect(h.client.view).toMatchObject({ status: 'stale', retained: false }); expect(h.cache.clear).not.toHaveBeenCalled();
    await h.client.dismiss(); await h.client.preview(); h.clientPorts.request.mockResolvedValueOnce(null); await h.client.inspect();
    expect(h.client.view.status).toBe('unknown'); await h.client.cancel(); expect(h.client.view.status).toBe('cancelled');
    h.clientPorts.request.mockResolvedValueOnce(null); await h.client.inspect(); expect(h.client.view.status).toBe('cancelled');
});
it('a lost cancellation response does not dismiss a pending review or imply that a clear was undone', async () => {
    const h = apiCacheClientFixture(); await h.client.preview(); h.clientPorts.request.mockResolvedValueOnce(null);
    expect(await h.client.dismiss()).toBe(false); expect(h.client.view).toMatchObject({ status: 'unknown', open: true, retained: true });
    expect(h.cache.clear).not.toHaveBeenCalled(); expect(await h.client.dismiss()).toBe(true);
    await h.client.inspect(); expect(h.client.view.status).toBe('not-submitted'); await h.client.cancel(); expect(h.client.view.status).toBe('cancelled');
});
it('a renderer that throws on every publication cannot change a completed native clear or cause a retry', async () => {
    const h = apiCacheClientFixture(); h.clientPorts.changed.mockImplementation(() => { throw new Error('renderer-failure'); });
    await h.client.preview(); expect(h.client.view.status).toBe('preview'); await h.client.confirm(); expect(h.client.view.status).toBe('cleared');
    await h.client.confirm(); await h.client.inspect(); expect(h.client.view.status).toBe('cleared'); expect(h.cache.clear).toHaveBeenCalledOnce();
});
