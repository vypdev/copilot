import { expect, it, vi } from 'vitest';
import { pausePlan, pauseReviewsFixture as fixture, PAUSE, TAB_PAUSE } from '../fixtures/temporary_pause_reviews.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { deferred } from '../fixtures/runtime.ts';

it.each(['invalid-owner', 'observer', 'throwing-fence', 'invalid-fence'] as const)('rejects %s before observing native state', async kind => {
    const h = fixture(); let owner = h.owner.clientId;
    if (kind === 'invalid-owner') owner = 'invalid';
    if (kind === 'observer') owner = h.center.open({ documentId: 'observer', tabId: 2 }).clientId;
    if (kind === 'throwing-fence') h.reviewPorts.fence.mockImplementation(() => { throw new Error('authority unavailable'); });
    if (kind === 'invalid-fence') h.reviewPorts.fence.mockReturnValue({ controllerEpoch: -1, credentialEpoch: 0 });
    expect(await h.reviews.preview(PAUSE, owner, 0)).toEqual({ state: 'denied' }); expect(h.port.get).not.toHaveBeenCalled();
});
it.each(['fraction', 'throw', 'overflow'] as const)('an unusable %s review clock cannot create an operation', async state => {
    const h = fixture(); h.reviewPorts.now = vi.fn(() => { if (state === 'throw') throw new Error('clock failed'); return state === 'fraction' ? 0.1 : Number.MAX_SAFE_INTEGER; });
    expect(await h.preview()).toEqual({ state: 'unavailable' }); expect(h.port.get).not.toHaveBeenCalled();
});
it.each([null, { type: 'all', paused: false }, { ...PAUSE, source: 'forged' }])('rejects malformed intent %j before native observation', async intent => {
    const h = fixture(); expect(await h.preview(intent)).toEqual({ state: 'invalid', reason: 'invalid-input' }); expect(h.port.get).not.toHaveBeenCalled();
});
it('requires a safe observed revision and rejects a moved native document', async () => {
    const h = fixture(); expect(await h.preview(PAUSE, -1)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    expect(await h.preview(PAUSE, 1)).toEqual({ state: 'conflict' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt', 'unavailable'] as const)('preserves %s native input rather than preparing a reset', async state => {
    const h = fixture(); if (state === 'unavailable') vi.mocked(h.port.get).mockRejectedValue(new Error('unavailable'));
    else h.values.set(TEMPORARY_PAUSES_KEY, state === 'future' ? { schemaVersion: 99 } : null);
    expect(await h.preview()).toEqual({ state }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a native mutation already pending blocks a second review, without fabricating an empty state', async () => {
    const h = fixture(); h.guard.hold(); expect(await h.preview()).toEqual({ state: 'busy' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('capacity and exhausted revisions preserve complete native data', async () => {
    const h = fixture(); h.values.set(TEMPORARY_PAUSES_KEY, { ...h.before, tabs: Array.from({ length: 128 }, (_, i) => i) });
    expect(await h.preview({ ...TAB_PAUSE, tabId: 128 })).toEqual({ state: 'invalid', reason: 'capacity' });
    h.values.set(TEMPORARY_PAUSES_KEY, { ...h.before, revision: Number.MAX_SAFE_INTEGER });
    expect(await h.preview(PAUSE, Number.MAX_SAFE_INTEGER)).toEqual({ state: 'invalid', reason: 'overflow' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['invalid', 'collision', 'throw'] as const)('an %s identifier cannot replace a pending review', async state => {
    const h = fixture(); const first = await pausePlan(h);
    h.reviewPorts.identifier.mockImplementation(() => { if (state === 'throw') throw new Error('entropy unavailable'); return state === 'collision' ? first.operationId : 'not-an-id'; });
    expect(await h.preview()).toEqual({ state: 'unavailable' }); expect(await h.confirm(first)).toMatchObject({ state: 'committed' });
});
it('completed and running identifiers cannot be reused for another private plan', async () => {
    const h = fixture(); const first = await pausePlan(h); const pending = deferred<void>(); vi.mocked(h.port.set).mockReturnValueOnce(pending.promise);
    const running = h.confirm(first); h.reviewPorts.identifier.mockReturnValue(first.operationId);
    h.reviews.invalidateTab(9);
    expect(await h.preview(TAB_PAUSE)).toEqual({ state: 'busy' }); pending.resolve(); await running;
    expect(await h.preview(PAUSE)).toEqual({ state: 'unavailable' }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a running tab lookup cannot have its identifier replaced before the native write acquires a hold', async () => {
    const h = fixture(); const first = await pausePlan(h, TAB_PAUSE);
    const pending = deferred<Awaited<ReturnType<typeof h.reviewPorts.target>>>(); h.reviewPorts.target.mockReturnValueOnce(pending.promise);
    const running = h.confirm(first); h.reviewPorts.identifier.mockReturnValue(first.operationId);
    expect(await h.preview()).toEqual({ state: 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled();
    pending.resolve({ tabId: 7, source: 'https://github.com/octo/example/issues/42', label: null });
    expect(await running).toMatchObject({ state: 'committed' }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('confirmation, cancellation and result are bound to both owner and reviewed revision', async () => {
    const h = fixture(); const plan = await pausePlan(h); const other = h.center.open({ documentId: 'other', tabId: 2 });
    for (const [owner, revision] of [[other.clientId, 0], [h.owner.clientId, 1]] as const) {
        expect(await h.reviews.confirm(plan.operationId, revision, owner)).toEqual({ state: 'denied' });
        expect(h.reviews.cancel(plan.operationId, revision, owner)).toEqual({ state: 'denied' }); expect(h.reviews.inspect(plan.operationId, revision, owner)).toEqual({ state: 'denied' });
    }
    expect(h.reviews.inspect('bad', 0, h.owner.clientId)).toEqual({ state: 'invalid' }); expect(h.reviews.inspect(plan.operationId, -1, h.owner.clientId)).toEqual({ state: 'invalid' });
    expect(h.reviews.inspect(plan.operationId, 0, 'bad')).toEqual({ state: 'invalid' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('an expired preview and an unknown operation cannot make a native attempt', async () => {
    const h = fixture(); const plan = await pausePlan(h); h.center.advance(300000);
    expect(await h.confirm(plan)).toEqual({ state: 'expired' }); expect(await h.reviews.confirm('f'.repeat(32), 0, h.owner.clientId)).toEqual({ state: 'expired' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('credential changes fence a previously admitted review even when the tab itself is unchanged', async () => {
    const h = fixture(); const plan = await pausePlan(h); h.center.disconnect();
    expect(await h.confirm(plan)).toEqual({ state: 'stale' }); expect(h.cancel(plan)).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('completed receipts are bounded32 and expire without allowing a repeated write', async () => {
    const h = fixture(); const records = [];
    for (let i = 0; i < 33; i++) { const plan = await pausePlan(h); records.push(plan); h.cancel(plan); }
    expect(h.result(records[0])).toEqual({ state: 'expired' }); expect(h.result(records[1])).toEqual({ state: 'cancelled' });
    h.center.advance(300000); expect(h.result(records[32])).toEqual({ state: 'expired' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('an unavailable result clock blocks confirmation and cancellation without discarding the retained review', async () => {
    const h = fixture(); const plan = await pausePlan(h); const now = h.reviewPorts.now; h.reviewPorts.now = vi.fn(() => NaN);
    expect(await h.confirm(plan)).toEqual({ state: 'unavailable' }); expect(h.cancel(plan)).toEqual({ state: 'unavailable' }); expect(h.result(plan)).toEqual({ state: 'unavailable' });
    h.reviewPorts.now = now; expect(h.result(plan)).toEqual({ state: 'not-submitted' }); expect(h.cancel(plan)).toEqual({ state: 'cancelled' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('adoption requires the exact reviewed native revision even when precaution is active', async () => {
    const h = fixture(); h.guard.settle(h.guard.hold()!, true);
    expect(await h.preview({ type: 'adopt-observed' }, 1)).toEqual({ state: 'conflict' }); expect(h.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
