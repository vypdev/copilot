import { expect, it, vi } from 'vitest';
import { pausePlan, pauseReviewsFixture as fixture, PAUSE, TAB_PAUSE } from '../fixtures/temporary_pause_reviews.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { NativePauseTarget } from '../../src/application/temporary_pause_review_ports.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';

it('a same-URL reload during preparation retires the old target before a review can be published', async () => {
    const h = fixture(); const pending = deferred<NativePauseTarget | null>(); h.reviewPorts.target.mockReturnValueOnce(pending.promise);
    const request = h.preview(TAB_PAUSE); await vi.waitFor(() => expect(h.reviewPorts.target).toHaveBeenCalled()); h.reviews.invalidateTab(7);
    pending.resolve({ tabId: 7, source: 'https://github.com/octo/example/issues/42', label: 'Same URL' });
    expect(await request).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a native target change while protected state is still being read also retires preparation', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const request = h.preview(TAB_PAUSE); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.reviews.invalidateTab(7); pending.resolve(h.before);
    expect(await request).toEqual({ state: 'stale' }); expect(h.reviewPorts.target).not.toHaveBeenCalled();
});
it('credential transition while reading a preview does not publish a former actor plan', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const request = h.preview(); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.center.disconnect(); pending.resolve(h.before);
    expect(await request).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('unrelated or malformed native tab events cannot retire the selected target', async () => {
    const h = fixture(); const plan = await pausePlan(h, TAB_PAUSE); h.reviews.invalidateTab(9); h.reviews.invalidateTab(-1);
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed' });
});
it('a submitted review for a native tab that reloads cannot be confirmed later', async () => {
    const h = fixture(); const plan = await pausePlan(h, TAB_PAUSE); h.reviews.invalidateTab(7);
    expect(await h.confirm(plan)).toEqual({ state: 'expired' }); expect(h.result(plan)).toEqual({ state: 'expired' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a tab event during confirmation lookup fences the running native target before any write', async () => {
    const h = fixture(); const plan = await pausePlan(h, TAB_PAUSE); const pending = deferred<NativePauseTarget | null>(); h.reviewPorts.target.mockReturnValueOnce(pending.promise);
    const request = h.confirm(plan); await vi.waitFor(() => expect(h.reviewPorts.target).toHaveBeenCalledTimes(2)); h.reviews.invalidateTab(7);
    pending.resolve({ tabId: 7, source: 'https://github.com/octo/example/issues/42', label: 'Same URL' });
    expect(await request).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled(); expect(h.result(plan)).toEqual({ state: 'stale' });
});
it('a tab event after the native attempt keeps the observed effect with current=false and precaution', async () => {
    const h = fixture(); const plan = await pausePlan(h, TAB_PAUSE); const original = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await original(key, value); h.reviews.invalidateTab(7); });
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed', current: false }); expect(h.guard.uncertain).toBe(true);
    expect(h.result(plan)).toMatchObject({ state: 'committed', current: false });
});
it('ownership takeover while a native write is pending cannot undo its already accepted effect', async () => {
    const h = fixture(); const plan = await pausePlan(h); const pending = deferred<void>(); const original = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await pending.promise; await original(key, value); });
    const request = h.confirm(plan); await vi.waitFor(() => expect(h.port.set).toHaveBeenCalled());
    const other = h.center.open({ documentId: 'other', tabId: 2 }); h.center.controller.claim(other.clientId, { documentId: 'other', tabId: 2 }, other.controllerEpoch);
    pending.resolve(); expect(await request).toMatchObject({ state: 'committed', current: false }); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(h.after); expect(h.guard.uncertain).toBe(true);
});
it('sixteen preparations consume capacity before any pending native lookup returns, even across takeover', async () => {
    const h = fixture(); const pending = deferred<NativePauseTarget | null>(); h.reviewPorts.target.mockReturnValue(pending.promise);
    const requests = Array.from({ length: 16 }, () => h.preview(TAB_PAUSE)); await vi.waitFor(() => expect(h.reviewPorts.target).toHaveBeenCalledTimes(16));
    expect(await h.preview()).toEqual({ state: 'busy' }); const other = h.center.open({ documentId: 'other', tabId: 2 });
    h.center.controller.claim(other.clientId, { documentId: 'other', tabId: 2 }, other.controllerEpoch);
    expect(await h.reviews.preview(PAUSE, other.clientId, 0)).toEqual({ state: 'busy' });
    pending.resolve({ tabId: 7, source: 'https://github.com/octo/example/issues/42', label: null });
    expect(await Promise.all(requests)).toEqual(Array.from({ length: 16 }, () => ({ state: 'stale' })));
    expect(await h.reviews.preview(PAUSE, other.clientId, 0)).toMatchObject({ state: 'preview' });
});
it('native target failure before a write is unavailable, without a fabricated unknown attempt or precaution', async () => {
    const h = fixture(); const plan = await pausePlan(h, TAB_PAUSE); h.reviewPorts.target.mockRejectedValue(new Error('native metadata lost'));
    expect(await h.confirm(plan)).toEqual({ state: 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled(); expect(h.guard.uncertain).toBe(false);
});
it('loss of the store result after a real committed effect retains a precaution and never repeats that effect', async () => {
    const h = fixture(); const plan = await pausePlan(h); const commit = h.store.commit.bind(h.store);
    vi.spyOn(h.store, 'commit').mockImplementation(async (...args) => { await commit(...args); throw new Error('operation result lost'); });
    expect(await h.confirm(plan)).toMatchObject({ state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable' });
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(h.after); expect(h.guard.uncertain).toBe(true);
    expect(await h.confirm(plan)).toMatchObject({ state: 'unknown' }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('an adoption result lost after clearing precaution creates a new precaution without claiming a native write', async () => {
    const h = fixture(); h.guard.settle(h.guard.hold()!, true); const plan = await pausePlan(h, { type: 'adopt-observed' }); const adopt = h.store.reconcile.bind(h.store);
    vi.spyOn(h.store, 'reconcile').mockImplementation(async (...args) => { await adopt(...args); throw new Error('adoption result lost'); });
    expect(await h.confirm(plan)).toEqual({ state: 'unavailable' }); expect(h.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
it('source retirement after the primitive completed cannot publish its former current=true as review authority', async () => {
    const h = fixture(); const plan = await pausePlan(h); const commit = h.store.commit.bind(h.store);
    vi.spyOn(h.store, 'commit').mockImplementation(async (...args) => { const result = await commit(...args); h.center.disconnect(); return result; });
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed', acknowledgement: 'accepted', current: false }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('an unrelated tab event during emergency preparation cannot retire that review', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const preparing = h.preview(); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.reviews.invalidateTab(7); pending.resolve(h.before);
    expect(await preparing).toMatchObject({ state: 'preview' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('identity acquisition cannot publish a preview after its source changed during that boundary', async () => {
    const h = fixture(); const identify = h.reviewPorts.identifier.getMockImplementation()!;
    h.reviewPorts.identifier.mockImplementationOnce(() => { const id = identify(); h.center.disconnect(); return id; });
    expect(await h.preview()).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('retirement immediately after an admitted fence snapshot is rechecked before effects start', async () => {
    const h = fixture(); const plan = await pausePlan(h); const fence = h.reviewPorts.fence.getMockImplementation()!;
    h.reviewPorts.fence.mockImplementationOnce(id => { const value = fence(id); h.center.disconnect(); return value; });
    expect(await h.confirm(plan)).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['unavailable', 'exhausted'] as const)('a %s publication clock cannot erase an accepted effect or cache reusable authority', async state => {
    const h = fixture(); const plan = await pausePlan(h); const commit = h.store.commit.bind(h.store); const now = h.reviewPorts.now;
    vi.spyOn(h.store, 'commit').mockImplementation(async (...args) => {
        const result = await commit(...args); h.reviewPorts.now = vi.fn(() => state === 'unavailable' ? NaN : Number.MAX_SAFE_INTEGER); return result;
    });
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed', acknowledgement: 'accepted', current: false });
    h.reviewPorts.now = now; expect(await h.confirm(plan)).toEqual({ state: 'expired' }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
