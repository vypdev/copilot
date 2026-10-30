import { expect, it, vi } from 'vitest';
import { PauseObservations } from '../../src/application/pause_observations.ts';
import { pausePlan, pauseReviewsFixture as fixture } from '../fixtures/temporary_pause_reviews.ts';
import { deferred } from '../fixtures/runtime.ts';

it('failed optional observation acquisition cannot reject or repeat a native pause effect', async () => {
    const h = fixture(() => { throw new Error('optional diagnostics unavailable'); }); const plan = await pausePlan(h);
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed' }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('source loss while acquiring observation discards the unexposed review and frees its capacity', async () => {
    const h = fixture(); h.reviewPorts.observe = () => { h.center.disconnect(); return null; };
    expect(await h.preview()).toEqual({ state: 'stale' }); h.reviewPorts.observe = undefined;
    for (let i = 0; i < 16; i++) expect(await h.preview()).toMatchObject({ state: 'preview' });
    expect(await h.preview()).toEqual({ state: 'busy' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('native release during observation capture cannot republish an already invalidated private plan', async () => {
    const h = fixture(); h.reviewPorts.observe = () => { h.center.controller.releaseTab(1); return null; };
    expect(await h.preview()).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('reentrant cancellation by an optional observer cannot return a confirmable preview', async () => {
    const h = fixture(); const id = 'f'.repeat(32); h.reviewPorts.identifier.mockReturnValue(id);
    h.reviewPorts.observe = owner => { expect(h.reviews.cancel(id, 0, owner)).toEqual({ state: 'cancelled' }); return null; };
    expect(await h.preview()).toEqual({ state: 'stale' }); expect(await h.reviews.confirm(id, 0, h.owner.clientId)).toEqual({ state: 'cancelled' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('running promise ownership is installed before a confirming observer reenters confirmation', async () => {
    const trace = new PauseObservations('pause-emergency', vi.fn()); const h = fixture(() => trace); const plan = await pausePlan(h);
    const confirming = trace.confirming.bind(trace); let repeated: ReturnType<typeof h.confirm> | undefined;
    vi.spyOn(trace, 'confirming').mockImplementationOnce(() => { repeated = h.confirm(plan); confirming(); });
    const pending = h.confirm(plan); expect(repeated).toBe(pending); expect(await pending).toMatchObject({ state: 'committed' }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('completion-sink source retirement preserves observed facts but removes authority from the final response', async () => {
    const h = fixture(); const trace = new PauseObservations('pause-emergency', fact => { if (fact.state === 'settled') h.center.disconnect(); });
    h.reviewPorts.observe = () => trace; const plan = await pausePlan(h);
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed', acknowledgement: 'accepted', current: false });
    expect(trace.fact).toMatchObject({ result: 'committed', observation: 'committed', sourceCurrentAtObservation: true }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a source retired by confirmation observation cannot start a native read or write', async () => {
    const h = fixture(); const trace = new PauseObservations('pause-emergency', fact => { if (fact.state === 'running') h.center.disconnect(); });
    h.reviewPorts.observe = () => trace; const plan = await pausePlan(h); vi.mocked(h.port.get).mockClear();
    expect(await h.confirm(plan)).toEqual({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('cancel observer reentry cannot undo a running native operation or emit duplicate native events', async () => {
    const h = fixture(); const trace = new PauseObservations('pause-emergency', vi.fn()); h.reviewPorts.observe = () => trace;
    const plan = await pausePlan(h); const gate = deferred<void>(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (...args) => { await gate.promise; await set(...args); }); const pending = h.confirm(plan);
    expect(h.cancel(plan)).toEqual({ state: 'pending' }); gate.resolve(); await pending; expect(trace.fact).toMatchObject({ result: 'committed', submitted: true });
});
it('loss of the primitive return cannot erase acknowledgements already delivered by the actual native writer', async () => {
    const trace = new PauseObservations('pause-emergency', vi.fn()); const h = fixture(() => trace); const plan = await pausePlan(h); const commit = h.store.commit.bind(h.store);
    vi.spyOn(h.store, 'commit').mockImplementation(async (...args) => { await commit(...args); throw new Error('result lost after native observation'); });
    expect(await h.confirm(plan)).toMatchObject({ state: 'unknown' }); expect(trace.fact).toMatchObject({ result: 'unknown', acknowledgement: 'accepted', observation: 'committed' }); expect(h.guard.uncertain).toBe(true);
});
it('a completion observer cannot acquire a second effect by reentering confirm while facts are being published', async () => {
    const h = fixture(); let repeated: ReturnType<typeof h.confirm> | undefined;
    const trace = new PauseObservations('pause-emergency', fact => { if (fact.state === 'settled') repeated = h.confirm(plan); }); h.reviewPorts.observe = () => trace; const plan = await pausePlan(h);
    const pending = h.confirm(plan); expect(await pending).toMatchObject({ state: 'committed' }); expect(repeated).toBe(pending); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('source loss at accepted acknowledgement preserves one canonical observation and retains native precaution', async () => {
    const h = fixture(); let retired = false;
    const trace = new PauseObservations('pause-emergency', fact => { if (!retired && fact.state === 'running' && fact.acknowledgement === 'accepted') { retired = true; h.center.disconnect(); } });
    h.reviewPorts.observe = () => trace; const plan = await pausePlan(h);
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed', acknowledgement: 'accepted', current: false });
    expect(trace.fact).toMatchObject({ result: 'committed', observation: 'committed', sourceCurrentAtObservation: false }); expect(h.guard.uncertain).toBe(true); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('the independently retained observer liveness follows native retirement through the shared small source marker', async () => {
    const h = fixture(); let live: (() => boolean) | undefined; h.reviewPorts.observe = (_owner, _intent, current) => { live = current; return null; };
    const plan = await pausePlan(h, { type: 'tab', tabId: 7, paused: true }); expect(live?.()).toBe(true); h.reviews.invalidateTab(9); expect(live?.()).toBe(true);
    h.reviews.invalidateTab(7); expect(live?.()).toBe(false); expect(await h.confirm(plan)).toEqual({ state: 'expired' }); expect(h.port.set).not.toHaveBeenCalled();
});
