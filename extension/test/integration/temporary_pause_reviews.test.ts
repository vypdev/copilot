import { expect, it, vi } from 'vitest';
import { pausePlan, pauseReviewsFixture as fixture, PAUSE, TAB_PAUSE } from '../fixtures/temporary_pause_reviews.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { deferred } from '../fixtures/runtime.ts';

it('retains complete immutable changes and reveals no native source or private guard witness', async () => {
    const h = fixture(); const plan = await pausePlan(h);
    expect(plan).toMatchObject({ state: 'preview', revision: 0, expiresAt: 301000, before: h.before, after: h.after,
        action: 'change', precautionBefore: false, precautionAfter: false, target: { kind: 'emergency' } });
    expect(Object.isFrozen(plan.after.tabs)).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
    expect(JSON.stringify(plan)).not.toContain('witness'); expect(h.result(plan)).toEqual({ state: 'not-submitted' });
});
it('an emergency reserves a live guard synchronously and replays confirmation without another write', async () => {
    const h = fixture(); const plan = await pausePlan(h); const first = h.confirm(plan); expect(h.guard.pending).toBe(true);
    const duplicate = h.confirm(plan); expect(duplicate).toBe(first); expect(h.result(plan)).toEqual({ state: 'pending' });
    expect(await first).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: true });
    expect(await h.confirm(plan)).toEqual(await first); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('registers the running operation before native notification can reenter confirm', async () => {
    const h = fixture(); const plan = await pausePlan(h); let repeat: ReturnType<typeof h.confirm> | undefined;
    h.ports.changed.mockImplementationOnce(() => { repeat = h.confirm(plan); }); const first = h.confirm(plan);
    expect(repeat).toBe(first); expect(await first).toMatchObject({ state: 'committed' }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('cancellation retires only an unsubmitted review and repeated requests preserve that fact', async () => {
    const h = fixture(); const plan = await pausePlan(h); expect(h.cancel(plan)).toEqual({ state: 'cancelled' });
    expect(h.cancel(plan)).toEqual({ state: 'cancelled' }); expect(await h.confirm(plan)).toEqual({ state: 'cancelled' });
    expect(h.port.set).not.toHaveBeenCalled(); expect(h.guard.blocked).toBe(false);
});
it('cancel cannot undo a native effect already in flight or a completed effect', async () => {
    const h = fixture(); const plan = await pausePlan(h); const pending = deferred<void>(); const original = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await pending.promise; await original(key, value); });
    const running = h.confirm(plan); await vi.waitFor(() => expect(h.port.set).toHaveBeenCalled()); expect(h.cancel(plan)).toEqual({ state: 'pending' });
    pending.resolve(); expect(await running).toMatchObject({ state: 'committed' }); expect(h.cancel(plan)).toMatchObject({ state: 'committed' });
});
it('a known stored tab resumption has a complete delta and rechecks its native source', async () => {
    const h = fixture(); const before = { ...h.before, tabs: [7, 9], emergency: true }; h.values.set(TEMPORARY_PAUSES_KEY, before);
    const plan = await pausePlan(h, { ...TAB_PAUSE, paused: false }); expect(plan.after).toMatchObject({ emergency: true, tabs: [9] });
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed' }); expect(h.reviewPorts.target).toHaveBeenCalledTimes(2);
});
it('removing a saved unavailable native tab scope needs no invented target or connection grant', async () => {
    const h = fixture(); h.values.set(TEMPORARY_PAUSES_KEY, { ...h.before, tabs: [7] }); h.reviewPorts.target.mockResolvedValue(null);
    const plan = await pausePlan(h, { ...TAB_PAUSE, paused: false }); expect(plan.target).toEqual({ kind: 'tab', tabId: 7, label: null });
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed' }); expect(h.reviewPorts.target).toHaveBeenCalledTimes(1);
});
it('a new tab pause requires a native target and never exposes its source URL', async () => {
    const h = fixture(); const plan = await pausePlan(h, TAB_PAUSE);
    expect(plan.target).toEqual({ kind: 'tab', tabId: 7, label: 'octo/example · #42' }); expect(JSON.stringify(plan)).not.toContain('https://');
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed' }); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toMatchObject({ tabs: [7] });
});
it.each(['missing', 'wrong-id'] as const)('a %s native target cannot create a tab pause', async state => {
    const h = fixture(); h.reviewPorts.target.mockResolvedValue(state === 'missing' ? null : { tabId: 9, source: 'other', label: null });
    expect(await h.preview(TAB_PAUSE)).toEqual({ state: 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a changed or missing native target at confirmation cannot use the old review', async () => {
    for (const target of [null, { tabId: 7, source: 'https://github.com/octo/other', label: null }, { tabId: 9, source: 'https://github.com/octo/example/issues/42', label: null }]) {
        const h = fixture(); const plan = await pausePlan(h, TAB_PAUSE); h.reviewPorts.target.mockResolvedValue(target);
        expect(await h.confirm(plan)).toEqual({ state: 'conflict' }); expect(h.port.set).not.toHaveBeenCalled();
    }
});
it('previews detach caller intent and native target metadata without freezing either source', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const intent = { ...TAB_PAUSE, tabId: 7, paused: true }; const request = h.preview(intent); intent.tabId = 9; pending.resolve(h.before);
    const plan = await request; expect(plan).toMatchObject({ state: 'preview', target: { tabId: 7 } }); expect(Object.isFrozen(intent)).toBe(false);
    const other = fixture(); const target = { tabId: 7, source: 'https://github.com/octo/example/issues/42', label: 'Before' };
    other.reviewPorts.target.mockResolvedValueOnce(target); const saved = await pausePlan(other, TAB_PAUSE); target.label = 'After';
    expect(saved.target).toMatchObject({ label: 'Before' }); expect(Object.isFrozen(target)).toBe(false);
});
it('an uncertain result is retained as unknown even when a later native read matches the desired value', async () => {
    const h = fixture(); const plan = await pausePlan(h); vi.mocked(h.port.set).mockResolvedValue(undefined);
    expect(await h.confirm(plan)).toMatchObject({ state: 'unknown' }); h.values.set(TEMPORARY_PAUSES_KEY, h.after); await h.store.inspect();
    expect(h.result(plan)).toMatchObject({ state: 'unknown' }); expect(await h.confirm(plan)).toMatchObject({ state: 'unknown' }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('explicit adoption retains known native pauses and uses no native write or older acknowledgement', async () => {
    const h = fixture(); h.values.set(TEMPORARY_PAUSES_KEY, { ...h.before, emergency: true, tabs: [7] }); h.guard.settle(h.guard.hold()!, true);
    const plan = await pausePlan(h, { type: 'adopt-observed' }); expect(plan).toMatchObject({ action: 'adopt-observed', precautionBefore: true, precautionAfter: false, target: { kind: 'precaution' } });
    expect(plan.after).toEqual(plan.before); expect(await h.confirm(plan)).toEqual({ state: 'reconciled', revision: 0, current: true }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a newer precaution witness rejects an older adoption review', async () => {
    const h = fixture(); h.guard.settle(h.guard.hold()!, true); const plan = await pausePlan(h, { type: 'adopt-observed' }); h.guard.settle(h.guard.hold()!, true);
    expect(await h.confirm(plan)).toEqual({ state: 'conflict' }); expect(h.guard.uncertain).toBe(true);
});
it('prior uncertainty blocks normal resumption while still allowing a restrictive pause to become durable', async () => {
    const h = fixture(); h.guard.settle(h.guard.hold()!, true); expect(await h.preview({ ...PAUSE, paused: false })).toEqual({ state: 'precaution' });
    const plan = await pausePlan(h); expect(plan.precautionAfter).toBe(true); expect(await h.confirm(plan)).toMatchObject({ state: 'committed' }); expect(h.guard.uncertain).toBe(true);
});
it('unchanged native choices and adoption without precaution produce no review or mutation', async () => {
    const h = fixture(); expect(await h.preview({ ...PAUSE, paused: false })).toEqual({ state: 'unchanged' });
    expect(await h.preview({ type: 'adopt-observed' })).toEqual({ state: 'unchanged' }); expect(h.port.set).not.toHaveBeenCalled();
});
