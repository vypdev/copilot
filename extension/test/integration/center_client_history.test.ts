import { expect, it } from 'vitest';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { HistoryRequest } from '../../src/domain/history_request.ts';

const read = { method: 'center.history.read', kind: 'diagnostics' } as const;
const preview = { method: 'center.collection.preview', kind: 'diagnostics', action: 'start' } as const;
it('does not expose or request native authority before startup or after its own close', async () => {
    const f = centerClientFixture(); expect(await f.client.requestHistory(read)).toEqual({ state: 'stale' }); expect(f.port.send).not.toHaveBeenCalled();
    await f.client.start(); const message = f.port.send.mock.calls.find(c => c[0].method === 'center.read')![0];
    if (message.method !== 'center.read') throw new Error('missing-private-client'); const clientId = message.clientId;
    await f.client.requestHistory(read); expect(f.port.send.mock.lastCall![0]).toEqual({ version: 1, ...read, clientId });
    expect(JSON.stringify(f.client.view)).not.toContain(clientId); f.client.stop(); const count = f.port.send.mock.calls.length;
    expect(await f.client.requestHistory(read)).toEqual({ state: 'stale' }); expect(f.port.send).toHaveBeenCalledTimes(count);
});
it('fills controller/credential authority privately for a closed logical operation', async () => {
    const f = centerClientFixture(); await f.client.start(); await f.client.requestHistory(preview);
    expect(f.port.send.mock.lastCall![0]).toMatchObject({ version: 1, method: preview.method, kind: 'diagnostics', action: 'start',
        controllerEpoch: 1, credentialEpoch: 0 }); expect(f.client.view.issue).toBeNull();
    expect(f.client.view).not.toHaveProperty('clientId');
});
it.each(['throw', 'malformed'] as const)('a secondary %s failure preserves verified primary preference availability', async failure => {
    const f = centerClientFixture(); await f.client.start(); const before = f.client.view.data;
    if (failure === 'throw') f.port.send.mockRejectedValueOnce(new Error('private')); else f.port.send.mockResolvedValueOnce(null);
    expect(await f.client.requestHistory(read)).toBeNull(); expect(f.client.view.issue).toBeNull(); expect(f.client.view.data).toEqual(before);
    expect(JSON.stringify(f.client.view)).not.toContain('private');
});
it('a secondary source-version mismatch retires shared authority instead of enabling mixed-build controls', async () => {
    const f = centerClientFixture(); await f.client.start(); f.port.send.mockResolvedValueOnce({ state: 'ready', sourceTree: 'a'.repeat(64) });
    expect(await f.client.requestHistory(read)).toBeNull(); expect(f.client.view).toMatchObject({ role: null, issue: 'incompatible' });
    const count = f.port.send.mock.calls.length; expect(await f.client.requestHistory(preview)).toEqual({ state: 'stale' }); expect(f.port.send).toHaveBeenCalledTimes(count);
});
it.each([
    preview, { method: 'center.history.clear.preview', kind: 'recents' },
    { method: 'center.collection.confirm', operationId: 'a'.repeat(32) }, { method: 'center.history.clear.confirm', operationId: 'a'.repeat(32) },
] satisfies HistoryRequest[])('a primary retained review prevents competing $method effects', async operation => {
    const f = centerClientFixture(); await f.client.start(); await f.client.preview({ type: 'preferences', values: { density: 'compact' } }, 0);
    expect(f.client.view.review?.state).toBe('preview'); const count = f.port.send.mock.calls.length;
    expect(await f.client.requestHistory(operation)).toEqual({ state: 'busy' }); expect(f.port.send).toHaveBeenCalledTimes(count);
    expect(await f.client.requestHistory(read)).toEqual({ state: 'unavailable' }); expect(f.client.view.review?.state).toBe('preview');
});
it('status observation and cancellation remain available while a primary read is waiting', async () => {
    const f = centerClientFixture(); await f.client.start(); const gate = deferred<unknown>(); f.port.send.mockReturnValueOnce(gate.promise);
    const pending = f.client.refresh(); expect(f.client.view.phase).toBe('reading');
    expect(await f.client.requestHistory({ method: 'center.collection.result', operationId: 'a'.repeat(32) })).toEqual({ state: 'unavailable' });
    expect(await f.client.requestHistory({ method: 'center.history.clear.cancel', operationId: 'a'.repeat(32) })).toEqual({ state: 'unavailable' });
    expect(await f.client.requestHistory(preview)).toEqual({ state: 'busy' }); gate.resolve(null); await pending;
});
