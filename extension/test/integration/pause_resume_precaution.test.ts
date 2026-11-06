import { expect, it, vi } from 'vitest';
import { pausePlan, pauseReviewsFixture as fixture } from '../fixtures/temporary_pause_reviews.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { NativePauseTarget } from '../../src/application/temporary_pause_review_ports.ts';

async function resumeFixture(tab = false) {
    const h = fixture(); const before = { ...h.before, emergency: !tab, tabs: tab ? [7] : [] }; h.values.set(TEMPORARY_PAUSES_KEY, before);
    const plan = await pausePlan(h, tab ? { type: 'tab', tabId: 7, paused: false } : { type: 'emergency', paused: false }); return { ...h, before, plan };
}
it('new precaution after a resumption preview prevents confirmation from starting a native effect', async () => {
    const h = await resumeFixture(); h.guard.protect();
    expect(await h.confirm(h.plan)).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled(); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(h.before);
});
it('a queued resumption is rejected if the preceding native attempt becomes uncertain without changing its record', async () => {
    const h = await resumeFixture(); const gate = deferred<void>(); vi.mocked(h.port.set).mockReturnValueOnce(gate.promise);
    const preceding = h.store.commit(h.before, { ...h.before, revision: 1, tabs: [9] }, () => true);
    await vi.waitFor(() => expect(h.port.set).toHaveBeenCalledOnce()); const resumption = h.confirm(h.plan); gate.resolve();
    expect(await preceding).toMatchObject({ state: 'unknown' }); expect(await resumption).toEqual({ state: 'stale' });
    expect(h.port.set).toHaveBeenCalledTimes(1); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(h.before); expect(h.guard.uncertain).toBe(true);
});
it('a precaution established during native target confirmation prevents resuming that tab', async () => {
    const h = await resumeFixture(true); const gate = deferred<NativePauseTarget | null>(); h.reviewPorts.target.mockReturnValueOnce(gate.promise);
    const resumption = h.confirm(h.plan); h.guard.protect(); gate.resolve({ tabId: 7, source: 'https://github.com/octo/example/issues/42', label: null });
    expect(await resumption).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a precaution established after native invocation cannot erase the factual already-started resumption', async () => {
    const h = await resumeFixture(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (...args) => { await set(...args); h.guard.protect(); });
    expect(await h.confirm(h.plan)).toMatchObject({ state: 'committed', acknowledgement: 'accepted', current: true }); expect(h.guard.uncertain).toBe(true); expect(h.port.set).toHaveBeenCalledOnce();
});
