import { expect, it } from 'vitest';
import { recentsClientFixture as fixture, VISIT_OWNER, VISIT_PERMIT } from '../fixtures/recents_client.ts';
import { deferred } from '../fixtures/runtime.ts';

it('constructs without I/O and no native owner cannot acquire or publish an observation', async () => {
    const f = fixture(); expect(f.ports.request).not.toHaveBeenCalled(); f.owner(null); await f.client.refresh();
    expect(f.client.observe({ route: 'privacy' })).toBe(false); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.client.view).toEqual({ pending: 0, dropped: 0, incomplete: false });
});
it('off observations are never queued for a later opt-in and do not invent an incomplete history', async () => {
    const f = fixture(); f.reply({ ...VISIT_PERMIT, permit: null }); await f.client.refresh(); f.client.observe({ route: 'work' });
    f.reply(VISIT_PERMIT); await f.client.refresh(); await f.client.flush(); expect(f.visits()).toHaveLength(0); expect(f.client.view.incomplete).toBe(false);
    f.client.observe({ route: 'privacy' }); await f.client.flush(); expect(f.visits()).toHaveLength(1); expect(f.visits()[0]).toMatchObject({ destination: { route: 'privacy' } });
});
it('snapshots private source and permit before delivery, generalizes profile labels and keeps all authority out of the view', async () => {
    const f = fixture(); await f.client.refresh(); f.client.observe({ route: 'profiles', detail: 'private-team' }); await f.client.flush();
    expect(f.visits()[0]).toMatchObject({ clientId: VISIT_OWNER.clientId, controllerEpoch: 1, credentialEpoch: 1, permit: VISIT_PERMIT.permit, sequence: 1, destination: { route: 'profiles' } });
    expect(JSON.stringify(f.visits()[0])).not.toContain('private-team'); expect(JSON.stringify(f.client.view)).not.toContain('visit-'); expect(Object.isFrozen(f.client.view)).toBe(true);
});
it('a burst has one native delivery and one latest pending destination, with honest skipped-delivery counts', async () => {
    const f = fixture(); await f.client.refresh(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise);
    f.client.observe({ route: 'privacy' }); await Promise.resolve(); f.client.observe({ route: 'work' }); f.client.observe({ route: 'attention' });
    expect(f.client.view).toEqual({ pending: 2, dropped: 1, incomplete: true }); expect(f.visits()).toHaveLength(1);
    gate.resolve({ state: 'observed' }); await f.client.flush(); expect(f.visits()).toHaveLength(2);
    expect(f.visits()[1]).toMatchObject({ sequence: 3, destination: { route: 'attention' } });
});
it.each(['unknown', 'throw'])('an %s delivery is not retried; fresh capture prepares only a new observation and cannot reuse an in-flight sequence', async mode => {
    const f = fixture(); await f.client.refresh();
    if (mode === 'unknown') f.ports.request.mockResolvedValueOnce(null); else f.ports.request.mockRejectedValueOnce(new Error('private'));
    f.client.observe({ route: 'work' }); await f.client.flush(); await f.client.refresh(); expect(f.visits()).toHaveLength(1); expect(f.client.view.incomplete).toBe(true);
    f.client.observe({ route: 'privacy' }); await f.client.flush(); expect(f.visits()).toHaveLength(2); expect(f.visits()[1]).toMatchObject({ sequence: 2, destination: { route: 'privacy' } });
});
it('native capture high-watermarks prevent sequence reuse after reconnect or another accepted delivery', async () => {
    const f = fixture(); f.reply({ ...VISIT_PERMIT, sequence: 12 }); await f.client.refresh(); f.client.observe({ route: 'privacy' }); await f.client.flush();
    expect(f.visits()[0]).toMatchObject({ sequence: 13 }); f.reply({ ...VISIT_PERMIT, sequence: 8 }); await f.client.refresh();
    f.client.observe({ route: 'attention' }); await f.client.flush(); expect(f.visits()[1]).toMatchObject({ sequence: 14 });
});
it('an exhausted ephemeral source sequence drops the current event and refreshes a new namespace for future visits only', async () => {
    const f = fixture(); f.reply({ ...VISIT_PERMIT, sequence: Number.MAX_SAFE_INTEGER }); await f.client.refresh();
    expect(f.client.observe({ route: 'work' })).toBe(false); expect(f.client.view.incomplete).toBe(true);
    f.reply({ ...VISIT_PERMIT, permit: `visit-${'c'.repeat(32)}` }); await f.client.refresh(); expect(f.visits()).toHaveLength(0);
    f.client.observe({ route: 'privacy' }); await f.client.flush(); expect(f.visits()[0]).toMatchObject({ sequence: 1 });
});
it('coalesces capture refresh bursts into one trailing read and never fills in a visit made without a permit', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const pending = f.client.refresh(); await Promise.resolve();
    for (let i = 0; i < 5; i++) { void f.client.refresh(); f.client.observe({ route: 'privacy' }); }
    expect(f.ports.request).toHaveBeenCalledOnce(); gate.resolve(VISIT_PERMIT); await pending;
    expect(f.ports.request).toHaveBeenCalledTimes(2); expect(f.visits()).toHaveLength(0);
});
it('a capture response for an older native context cannot publish a permit in its replacement context', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const pending = f.client.refresh(); await Promise.resolve();
    f.owner({ ...VISIT_OWNER, controllerEpoch: 2 }); f.client.contextChanged(); void f.client.refresh(); gate.resolve(VISIT_PERMIT); await pending;
    f.client.observe({ route: 'privacy' }); await f.client.flush(); expect(f.visits()[0]).toMatchObject({ controllerEpoch: 2 });
});
it.each(['controllerEpoch', 'credentialEpoch', 'clientId'] as const)('a %s change discards queued old-context work without moving its uncertainty into the new context', async key => {
    const f = fixture(); await f.client.refresh(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise);
    f.client.observe({ route: 'work' }); await Promise.resolve(); f.client.observe({ route: 'privacy' });
    f.owner({ ...VISIT_OWNER, [key]: key === 'clientId' ? 'c'.repeat(32) : 2 }); f.client.contextChanged(); await f.client.refresh();
    gate.resolve(null); await f.client.flush(); expect(f.visits()).toHaveLength(1); expect(f.client.view).toEqual({ pending: 0, dropped: 0, incomplete: false });
});
it('clear advances the known epoch, retires queued old work and ignores an older delivery failure', async () => {
    const f = fixture(); await f.client.refresh(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise);
    f.client.observe({ route: 'work' }); await Promise.resolve(); f.client.observe({ route: 'privacy' }); f.client.observe({ route: 'attention' });
    f.reply({ state: 'ready', permit: null, epoch: 1, sequence: 0 }); await f.client.refresh(); expect(f.client.view).toEqual({ pending: 0, dropped: 0, incomplete: false });
    gate.resolve(null); await f.client.flush(); expect(f.visits()).toHaveLength(1); expect(f.client.view.incomplete).toBe(false);
});
it('observing opt-out without clear drops a captured queued visit and re-enabling prepares only future navigation', async () => {
    const f = fixture(); await f.client.refresh(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise);
    f.client.observe({ route: 'work' }); await Promise.resolve(); f.client.observe({ route: 'privacy' });
    f.reply({ state: 'ready', permit: null, epoch: 0, sequence: 0 }); await f.client.refresh(); gate.resolve({ state: 'observed' }); await f.client.flush();
    expect(f.visits()).toHaveLength(1); expect(f.client.view).toEqual({ pending: 0, dropped: 1, incomplete: true });
    f.reply({ ...VISIT_PERMIT, permit: `visit-${'c'.repeat(32)}` }); await f.client.refresh(); await f.client.flush(); expect(f.visits()).toHaveLength(1);
    f.client.observe({ route: 'attention' }); await f.client.flush(); expect(f.visits()[1]).toMatchObject({ sequence: 1, destination: { route: 'attention' } });
});
it('older generation, malformed metadata and failed capture never become new authority or backfill an earlier destination', async () => {
    const f = fixture(); f.reply({ ...VISIT_PERMIT, epoch: 1 }); await f.client.refresh();
    for (const response of [{ ...VISIT_PERMIT, epoch: 0 }, { ...VISIT_PERMIT, private: 'excluded' }, null]) {
        f.reply(response); await f.client.refresh(); expect(f.client.observe({ route: 'work' })).toBe(false); await f.client.refresh(); expect(f.visits()).toHaveLength(0);
    }
    f.ports.request.mockRejectedValueOnce(new Error('private')); await f.client.refresh(); expect(f.client.observe({ route: 'privacy' })).toBe(false);
});
it('disposal while capture is pending or delivery is in flight cannot resurrect private permits or queued records', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const pending = f.client.refresh(); await Promise.resolve();
    f.client.stop(); gate.resolve(VISIT_PERMIT); await pending; await f.client.refresh(); expect(f.client.observe({ route: 'privacy' })).toBe(false); f.client.contextChanged();
    const other = fixture(); await other.client.refresh(); const delivery = deferred<unknown>(); other.ports.request.mockReturnValueOnce(delivery.promise);
    other.client.observe({ route: 'work' }); await Promise.resolve(); other.client.observe({ route: 'privacy' }); other.client.stop(); delivery.resolve(null); await other.client.flush();
    expect(other.visits()).toHaveLength(1); expect(other.client.view).toEqual({ pending: 0, dropped: 0, incomplete: false });
});
it('bad route/identity boundaries and throwing subscribers stay isolated from navigation', async () => {
    const f = fixture(); f.ports.identity.mockImplementationOnce(() => { throw new Error('private'); }); await f.client.refresh();
    await f.client.refresh(); expect(f.client.observe({ route: 'private-url' })).toBe(false);
    expect(f.client.observe({ get route() { throw new Error('private'); } })).toBe(false);
    f.ports.changed.mockImplementation(() => { throw new Error('private'); }); f.client.observe({ route: 'privacy' }); await f.client.flush(); expect(f.visits()).toHaveLength(1);
});
