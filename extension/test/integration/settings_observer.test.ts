import { expect, it, vi } from 'vitest';
import { settingsObserverFixture as fixture } from '../fixtures/settings_observer.ts';
import { SETTINGS_OWNER as OWNER } from '../fixtures/settings_operations.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { deferred } from '../fixtures/runtime.ts';

it('only a fully admitted preview captures its exact validated action and safe target, with a live original source fence', async () => {
    const f = fixture(); const p = await f.preview(); expect(f.ports.observe).toHaveBeenCalledOnce();
    const [owner, action, target, current] = f.ports.observe.mock.calls[0]; expect(owner).toBe(OWNER); expect(action).toBe('preferences');
    expect(target).toEqual({ location: { route: 'overview' }, label: null }); expect(current()).toBe(true); f.takeover(); expect(current()).toBe(false);
    expect(f.operations.cancel(p.operationId, p.revision, OWNER)).toEqual({ state: 'stale' }); expect(f.trace.blocked).toHaveBeenCalledOnce();
});
it.each([{}, null, { type: 'preferences', values: {} }])('invalid or unchanged %j requests create neither a trace nor a write', async input => {
    const f = fixture(); await f.operations.preview(input, OWNER); expect(f.ports.observe).not.toHaveBeenCalled(); expect(f.port.set).not.toHaveBeenCalled();
});
it('capture failure is secondary and cannot reject the retained immutable preview or its confirmation', async () => {
    const f = fixture(); f.ports.observe.mockImplementation(() => { throw new Error('private'); }); const p = await f.preview();
    expect(await f.confirm(p)).toMatchObject({ state: 'committed' }); expect(f.port.set).toHaveBeenCalledOnce(); expect(f.trace.complete).not.toHaveBeenCalled();
});
it('the running promise is registered before a confirmation observer can reenter confirmation or cancellation', async () => {
    const f = fixture(); const p = await f.preview(); let nested: ReturnType<typeof f.confirm> | null = null;
    f.trace.confirming.mockImplementation(() => { nested = f.confirm(p); expect(f.operations.cancel(p.operationId, p.revision, OWNER)).toEqual({ state: 'pending' }); });
    const first = f.confirm(p); expect(nested).toBe(first); await first;
    expect(f.port.set).toHaveBeenCalledOnce(); expect(f.trace.confirming).toHaveBeenCalledOnce(); expect(f.trace.submitted).toHaveBeenCalledOnce();
});
it('submission is reported after the actual store port was called and before its acknowledgement settles', async () => {
    const f = fixture(); const p = await f.preview(); const gate = deferred<void>(); f.port.set.mockImplementationOnce(async (key, value) => { await gate.promise; f.values.set(key, value); });
    f.trace.submitted.mockImplementation(() => { expect(f.port.set).toHaveBeenCalledOnce(); }); const pending = f.confirm(p);
    await vi.waitFor(() => expect(f.trace.submitted).toHaveBeenCalledOnce()); expect(f.trace.complete).not.toHaveBeenCalled(); gate.resolve();
    expect(await pending).toMatchObject({ state: 'committed' });
});
it.each(['sync', 'async'])('a %s store-attempt failure is observed once with uncertain acknowledgement and independent unchanged readback', async mode => {
    const f = fixture(); const p = await f.preview();
    if (mode === 'sync') f.port.set.mockImplementationOnce(() => { throw new Error('private'); }); else f.port.set.mockRejectedValueOnce(new Error('private'));
    expect(await f.confirm(p)).toMatchObject({ state: 'unknown', acknowledgement: 'unknown', observation: 'unchanged' });
    expect(f.trace.submitted).toHaveBeenCalledOnce(); expect(f.trace.complete).toHaveBeenCalledOnce(); expect(f.port.set).toHaveBeenCalledOnce();
});
it('a genuine revision conflict completes as a preflight result without fabricating a store submission', async () => {
    const f = fixture(); const p = await f.preview(); await f.repository.update(s => ({ ...s, locale: 'es' }));
    expect(await f.confirm(p)).toEqual({ state: 'conflict' }); expect(f.trace.submitted).not.toHaveBeenCalled(); expect(f.trace.complete).toHaveBeenCalledWith({ state: 'conflict' });
});
it.each(['confirming', 'submitted', 'complete', 'cancelled', 'blocked'] as const)('a throwing %s observer cannot change the primary result', async event => {
    const f = fixture(); const p = await f.preview(); f.trace[event].mockImplementation(() => { throw new Error('private'); });
    if (event === 'cancelled') expect(f.operations.cancel(p.operationId, p.revision, OWNER)).toEqual({ state: 'cancelled' });
    else if (event === 'blocked') { f.takeover(); expect(await f.confirm(p)).toEqual({ state: 'stale' }); }
    else expect(await f.confirm(p)).toMatchObject({ state: 'committed' });
});
it('a trace that invalidates preview admission cannot publish reusable confirmation authority', async () => {
    const f = fixture(); f.ports.observe.mockImplementation(() => { f.operations.invalidate(); return f.trace; });
    expect(await f.operations.preview({ type: 'preferences', values: { density: 'compact' } }, OWNER)).toEqual({ state: 'stale' });
    expect(f.trace.blocked).toHaveBeenCalledOnce(); expect(f.port.set).not.toHaveBeenCalled();
});
it('expiry and invalidation remove pending ownership before a blocked observer can reenter', async () => {
    const f = fixture(); const p = await f.preview(); f.advance(300000); f.trace.blocked.mockImplementation(() => {
        expect(f.operations.cancel(p.operationId, p.revision, OWNER)).toEqual({ state: 'expired' });
    }); expect(await f.confirm(p)).toEqual({ state: 'expired' }); expect(f.trace.blocked).toHaveBeenCalledOnce();
    const other = fixture(); await other.preview(); other.operations.invalidate(); expect(other.trace.blocked).toHaveBeenCalledOnce();
});
it('retained duplicate results do not repeat submission, retention or primary writes', async () => {
    const f = fixture(); const p = await f.preview(); const result = await f.confirm(p); expect(await f.confirm(p)).toEqual(result);
    expect(f.operations.cancel(p.operationId, p.revision, OWNER)).toEqual(result); expect(f.trace.complete).toHaveBeenCalledOnce(); expect(f.trace.submitted).toHaveBeenCalledOnce();
});
it('unknown readback can be canonically reconciled by exact receipt AND complete expected content, without another write', async () => {
    const f = fixture(); const p = await f.preview(); const set = f.port.set.getMockImplementation()!;
    f.port.set.mockImplementationOnce(async (key, value) => { await set(key, value); f.port.get.mockRejectedValueOnce(new Error('private')); });
    expect(await f.confirm(p)).toMatchObject({ state: 'unknown', acknowledgement: 'accepted' }); const calls = f.trace.complete.mock.calls.length;
    f.operations.observeInspection(OWNER, await f.repository.inspect()); expect(f.trace.complete).toHaveBeenCalledTimes(calls + 1);
    expect(await f.confirm(p)).toMatchObject({ state: 'committed', acknowledgement: 'accepted' }); expect(f.port.set).toHaveBeenCalledOnce();
    f.operations.observeInspection(OWNER, await f.repository.inspect()); expect(f.trace.complete).toHaveBeenCalledTimes(calls + 1);
});
it('receipt-only or another-owner inspection cannot promote an unknown result', async () => {
    const f = fixture(); const p = await f.preview(); const set = f.port.set.getMockImplementation()!;
    f.port.set.mockImplementationOnce(async (key, value) => { await set(key, value); f.port.get.mockRejectedValueOnce(new Error('private')); }); await f.confirm(p);
    const inspected = await f.repository.inspect(); f.operations.observeInspection('b'.repeat(32), inspected);
    const envelope = structuredClone(f.values.get(SETTINGS_KEY)) as { current: Record<string, unknown> }; envelope.current.theme = 'dark'; f.values.set(SETTINGS_KEY, envelope);
    f.operations.observeInspection(OWNER, await f.repository.inspect()); expect(await f.confirm(p)).toMatchObject({ state: 'unknown' }); expect(f.trace.complete).toHaveBeenCalledOnce();
});
it('an observer cannot mutate a canonical primary result or its retained replay', async () => {
    const f = fixture(); const p = await f.preview(); f.trace.complete.mockImplementation(outcome => { (outcome as { revision: number }).revision = 999; });
    expect(await f.confirm(p)).toMatchObject({ state: 'committed', revision: 1 }); expect(await f.confirm(p)).toMatchObject({ revision: 1 });
});
it('owner movement during preview capture removes the still-pending plan before returning stale', async () => {
    const f = fixture(); f.ports.observe.mockImplementation(() => { f.takeover(); return f.trace; });
    expect(await f.operations.preview({ type: 'preferences', values: { density: 'compact' } }, OWNER)).toEqual({ state: 'stale' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('observational reconciliation is inert with an invalid clock', async () => {
    const f = fixture(); const p = await f.preview(); await f.confirm(p); f.ports.now.mockReturnValue(NaN); const inspected = await f.repository.inspect();
    f.operations.observeInspection(OWNER, inspected); expect(f.trace.complete).toHaveBeenCalledOnce();
});
it('source movement after an uncertain confirmation cannot relabel it as blocked before submission', async () => {
    const f = fixture(); const p = await f.preview(); vi.spyOn(f.repository, 'commit').mockRejectedValueOnce(new Error('private'));
    expect(await f.confirm(p)).toMatchObject({ state: 'unknown' }); f.takeover();
    expect(await f.confirm(p)).toEqual({ state: 'stale' }); expect(f.operations.cancel(p.operationId, p.revision, OWNER)).toEqual({ state: 'stale' });
    expect(f.trace.blocked).not.toHaveBeenCalled(); expect(f.trace.complete).toHaveBeenCalledOnce();
});
it('an invalid or changed expected revision is rejected before acquiring observation authority', async () => {
    const f = fixture(); const input = { type: 'preferences', values: { density: 'compact' } };
    expect(await f.operations.preview(input, OWNER, -1)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    expect(await f.operations.preview(input, OWNER, 1)).toEqual({ state: 'conflict' });
    expect(f.ports.observe).not.toHaveBeenCalled(); expect(f.port.set).not.toHaveBeenCalled();
});
