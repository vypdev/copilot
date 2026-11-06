import { expect, it, vi } from 'vitest';
import { deferred } from '../fixtures/runtime.ts';
import { settingsOperationsFixture, SETTINGS_OWNER as OWNER } from '../fixtures/settings_operations.ts';

const change = { type: 'preferences', values: { density: 'compact' } };

it('copies the user intent before asynchronous storage and does not follow later caller mutations', async () => {
    const h = settingsOperationsFixture(); const read = deferred<unknown>();
    vi.mocked(h.port.get).mockImplementationOnce(() => read.promise);
    const intent = structuredClone(change); const pending = h.operations.preview(intent, OWNER);
    intent.values.density = 'comfortable'; read.resolve(undefined);
    expect(await pending).toMatchObject({ state: 'preview', after: { density: 'compact' } });
    expect(h.port.set).not.toHaveBeenCalled();
});
it('takeover, credential change and explicit invalidation fence previews before they can save', async () => {
    for (const invalidate of ['takeover', 'disconnect', 'generation'] as const) {
        const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
        if (preview.state !== 'preview') throw new Error('expected preview');
        if (invalidate === 'generation') h.operations.invalidate(); else h[invalidate]();
        expect(await h.operations.confirm(preview.operationId, 0, OWNER)).toEqual({ state: invalidate === 'generation' ? 'expired' : 'stale' });
        if (invalidate !== 'generation') expect(h.operations.cancel(preview.operationId, 0, OWNER)).toEqual({ state: 'stale' });
        expect(h.port.set).not.toHaveBeenCalled();
    }
});
it('authority changed while loading and while allocating the operation ID cannot publish stale preview state', async () => {
    const h = settingsOperationsFixture(); const read = deferred<unknown>();
    vi.mocked(h.port.get).mockImplementationOnce(() => read.promise);
    const pending = h.operations.preview(change, OWNER); h.takeover(); read.resolve(undefined);
    expect(await pending).toEqual({ state: 'stale' });
    h.ports.identifier.mockImplementationOnce(() => { h.disconnect(); return 'a'.repeat(32); });
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('expiry and backwards clocks retire previews; invalid clocks or fences never acquire authority', async () => {
    for (const milliseconds of [300000, -1]) {
        const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
        if (preview.state !== 'preview') throw new Error('expected preview'); h.advance(milliseconds);
        expect(await h.operations.confirm(preview.operationId, 0, OWNER)).toEqual({ state: 'expired' });
        expect(h.operations.cancel(preview.operationId, 0, OWNER)).toEqual({ state: 'expired' });
    }
    const h = settingsOperationsFixture(); h.ports.now.mockReturnValue(-1);
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'unavailable' });
    expect(await h.operations.confirm('a'.repeat(32), 0, OWNER)).toEqual({ state: 'unavailable' });
    expect(h.operations.cancel('a'.repeat(32), 0, OWNER)).toEqual({ state: 'unavailable' });
    h.ports.now.mockImplementation(() => { throw new Error('clock unavailable'); });
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'unavailable' });
    h.ports.now.mockReturnValue(Number.MAX_SAFE_INTEGER);
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'unavailable' });
    h.ports.now.mockReturnValue(1000); h.ports.fence.mockReturnValue({ controllerEpoch: -1, credentialEpoch: 0 });
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'denied' });
    h.ports.fence.mockReturnValue({ controllerEpoch: 0, credentialEpoch: -1 });
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'denied' });
    h.ports.fence.mockImplementation(() => { throw new Error('private role failure'); });
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'denied' });
});
it('cancellation during persistence reports in-progress and cannot claim to undo a saved change', async () => {
    const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
    if (preview.state !== 'preview') throw new Error('expected preview');
    const write = deferred<void>(); const started = deferred<void>();
    vi.mocked(h.port.set).mockImplementationOnce(async (key, value) => { h.values.set(key, structuredClone(value)); started.resolve(); await write.promise; });
    const pending = h.operations.confirm(preview.operationId, 0, OWNER); await started.promise;
    expect(h.operations.cancel(preview.operationId, 0, OWNER)).toEqual({ state: 'pending' });
    expect(h.operations.cancel(preview.operationId, 1, OWNER)).toEqual({ state: 'denied' });
    expect(await h.operations.confirm(preview.operationId, 1, OWNER)).toEqual({ state: 'denied' });
    h.disconnect(); write.resolve();
    expect(await pending).toMatchObject({ state: 'committed', current: false, revision: 1 });
    expect(await h.operations.confirm(preview.operationId, 0, OWNER)).toEqual({ state: 'stale' });
});
it('preview allocation is bounded during concurrent reads and expired entries release capacity without timers', async () => {
    const h = settingsOperationsFixture();
    const results = await Promise.all(Array.from({ length: 17 }, () => h.operations.preview(change, OWNER)));
    expect(results.filter(result => result.state === 'preview')).toHaveLength(16);
    expect(results.filter(result => result.state === 'busy')).toHaveLength(1);
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'busy' });
    h.advance(300000); expect(await h.operations.preview(change, OWNER)).toMatchObject({ state: 'preview' });
    expect(h.port.set).not.toHaveBeenCalled();
});
it('invalid or colliding generated IDs do not replace an existing plan or reuse its stored receipt', async () => {
    const h = settingsOperationsFixture(); h.ports.identifier.mockReturnValueOnce('invalid');
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'unavailable' });
    h.ports.identifier.mockImplementationOnce(() => { throw new Error('synthetic_secret'); });
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'unavailable' });
    h.ports.identifier.mockReturnValue('a'.repeat(32));
    const preview = await h.operations.preview(change, OWNER); if (preview.state !== 'preview') throw new Error('expected preview');
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'unavailable' });
    await h.operations.confirm(preview.operationId, 0, OWNER);
    expect(await h.operations.preview({ type: 'preferences', values: { density: 'comfortable' } }, OWNER)).toEqual({ state: 'unavailable' });
    h.operations.invalidate();
    expect(await h.operations.preview({ type: 'preferences', values: { density: 'comfortable' } }, OWNER)).toEqual({ state: 'unavailable' });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('completion history is bounded and evicting old metadata never allows its operation to execute again', async () => {
    const h = settingsOperationsFixture(); let first = '';
    for (let index = 0; index < 33; index++) {
        const preview = await h.operations.preview({ type: 'preferences', values: { density: index % 2 ? 'comfortable' : 'compact' } }, OWNER);
        if (preview.state !== 'preview') throw new Error('expected preview');
        if (!index) first = preview.operationId;
        expect(await h.operations.confirm(preview.operationId, index, OWNER)).toMatchObject({ state: 'committed', revision: index + 1 });
    }
    expect(await h.operations.confirm(first, 0, OWNER)).toEqual({ state: 'expired' });
    expect(h.port.set).toHaveBeenCalledTimes(33);
});

it('a clock failure after persistence retains completed facts, while expired completion metadata grants no new write', async () => {
    for (const now of [-1, Number.MAX_SAFE_INTEGER]) {
        const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
        if (preview.state !== 'preview') throw new Error('expected preview');
        vi.mocked(h.port.set).mockImplementationOnce(async (key, value) => { h.values.set(key, structuredClone(value)); h.ports.now.mockReturnValue(now); });
        expect(await h.operations.confirm(preview.operationId, 0, OWNER)).toMatchObject({ state: 'committed', revision: 1, current: false });
        expect(h.port.set).toHaveBeenCalledTimes(1);
    }
    const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
    if (preview.state !== 'preview') throw new Error('expected preview');
    await h.operations.confirm(preview.operationId, 0, OWNER); h.advance(300000);
    expect(await h.operations.confirm(preview.operationId, 0, OWNER)).toEqual({ state: 'expired' });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});

it('an explicitly revoked local controller cannot save an otherwise unexpired preview', async () => {
    const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
    if (preview.state !== 'preview') throw new Error('expected preview');
    h.ports.fence.mockReturnValue(null);
    expect(await h.operations.confirm(preview.operationId, 0, OWNER)).toEqual({ state: 'stale' });
    expect(h.port.set).not.toHaveBeenCalled();
});
