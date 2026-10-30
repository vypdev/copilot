import { afterEach, expect, it, vi } from 'vitest';
import { sessionPreferenceReviewsFixture } from '../fixtures/session_preference_reviews.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { EMPTY_SESSION_PREFERENCES as empty } from '../../src/domain/session_preferences.ts';
import { deferred } from '../fixtures/runtime.ts';

afterEach(() => vi.restoreAllMocks());
async function fixture() { const h = await sessionPreferenceReviewsFixture(); vi.mocked(h.port.get).mockClear(); return h; }
it.each([-1, NaN, Number.MAX_SAFE_INTEGER])('an unusable or deadline-overflowing clock %s cannot allocate a retained review', async now => {
    const h = await fixture(); h.ports.now.mockReturnValue(now); expect(await h.preview()).toEqual({ state: 'unavailable' }); expect(h.port.get).not.toHaveBeenCalled();
});
it('invalid ownership and throwing fence acquisition fail before native source inspection', async () => {
    const h = await fixture(); expect(await h.reviews.preview({ type: 'clear' }, 'invalid', 0)).toEqual({ state: 'denied' });
    h.ports.fence.mockImplementation(() => { throw new Error('fence'); }); expect(await h.preview()).toEqual({ state: 'denied' }); expect(h.port.get).not.toHaveBeenCalled();
});
it.each([{ type: 'replace', preferences: { unknown: true } }, { type: 'clear', privateTarget: {} }])('an invalid authoring input %j cannot acquire or allocate any native source', async input => {
    const h = await fixture(); expect(await h.reviews.preview(input, h.owner, 0)).toEqual({ state: 'invalid', reason: 'invalid-input' }); expect(h.port.get).not.toHaveBeenCalled();
    expect(await h.reviews.preview({ type: 'clear' }, h.owner, -1)).toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it.each(['missing', 'rejected', 'retired'] as const)('a %s acquired source cannot manufacture a native preview', async kind => {
    const h = await fixture(); if (kind === 'missing') h.ports.readSource.mockResolvedValue(null);
    if (kind === 'rejected') h.ports.readSource.mockRejectedValue(new Error('source'));
    if (kind === 'retired') h.ports.readSource.mockImplementation(async () => { h.connections.invalidatePreferenceSource(); return null; });
    expect(await h.preview()).toEqual({ state: kind === 'retired' ? 'stale' : 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a source retired during canonical native observation cannot retain that old snapshot', async () => {
    const h = await fixture(); const inspect = h.store.inspect.bind(h.store);
    vi.spyOn(h.store, 'inspect').mockImplementation(async () => { const result = await inspect(); h.connections.invalidatePreferenceSource(); return result; });
    expect(await h.preview()).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt', 'unavailable'] as const)('a %s native preference document cannot be edited or downgraded by review admission', async state => {
    const h = await fixture(); if (state === 'unavailable') vi.spyOn(h.store, 'inspect').mockResolvedValue({ loaded: { state }, pending: false, precaution: false, witness: {} });
    else h.values.set(SESSION_PREFERENCES_KEY, state === 'future' ? { schemaVersion: 9 } : { damaged: true });
    expect(await h.preview()).toEqual({ state }); expect(h.port.set).not.toHaveBeenCalled();
});
it('pending native reservations and mismatched revisions are disclosed before a review can be retained', async () => {
    const h = await fixture(); const token = h.store.guard.hold()!; expect(await h.preview()).toEqual({ state: 'busy' }); h.store.guard.settle(token, false);
    expect(await h.preview({ type: 'clear' }, 1)).toEqual({ state: 'conflict' }); expect(await h.preview({ type: 'adopt-observed' })).toEqual({ state: 'unchanged' });
});
it('revision exhaustion preserves native data and returns an explicit invalid result without wraparound', async () => {
    const h = await fixture(); h.values.set(SESSION_PREFERENCES_KEY, { ...empty, revision: Number.MAX_SAFE_INTEGER });
    expect(await h.preview(undefined, Number.MAX_SAFE_INTEGER)).toEqual({ state: 'invalid', reason: 'overflow' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('source retirement during opaque identifier acquisition cannot retain a now-unbound operation', async () => {
    const h = await fixture(); h.ports.identifier.mockImplementation(() => { h.connections.invalidatePreferenceSource(); return 'a'.repeat(32); });
    expect(await h.preview()).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('cancel rejects invalid selectors and cannot run an expired operation even when its earlier plan remains visible', async () => {
    const h = await fixture(); expect(h.reviews.cancel('bad', 0, h.owner)).toEqual({ state: 'invalid' }); const plan = await h.plan();
    h.advance(300000); expect(h.reviews.cancel(plan.operationId, 0, h.owner)).toEqual({ state: 'expired' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('an unavailable clock cannot inspect or resurrect an already retained exact operation', async () => {
    const h = await fixture(); const plan = await h.plan(); h.ports.now.mockReturnValue(NaN);
    expect(h.reviews.inspect(plan.operationId, 0, h.owner)).toEqual({ state: 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('completed cancellation receipts evict their oldest scalar entry at32 without changing any native preference', async () => {
    const h = await fixture(); const first = await h.plan(); h.reviews.cancel(first.operationId, 0, h.owner);
    for (let i = 0; i < 32; i++) { const plan = await h.plan(); expect(h.reviews.cancel(plan.operationId, 0, h.owner)).toMatchObject({ outcome: { state: 'cancelled' } }); }
    expect(h.reviews.inspect(first.operationId, 0, h.owner)).toEqual({ state: 'expired' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a throwing settings reservation is unavailable before native application and cannot leave an invented submission fact', async () => {
    const h = await fixture(); const plan = await h.plan(); h.ports.reserveSettings.mockImplementation(() => { throw new Error('reservation'); });
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toMatchObject({ outcome: { state: 'unavailable' }, facts: { attempt: 'unobserved' } }); expect(h.port.set).not.toHaveBeenCalled();
});
it('source retirement inside reservation admission cannot call the store and always releases the reservation', async () => {
    const h = await fixture(); const plan = await h.plan(); const release = vi.fn();
    h.ports.reserveSettings.mockImplementation(() => { h.connections.invalidatePreferenceSource(); return { current: () => true, release }; });
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toMatchObject({ outcome: { state: 'stale' } }); expect(release).toHaveBeenCalledOnce(); expect(h.port.set).not.toHaveBeenCalled();
});
it('a running cancellation exposes factual progress instead of attempting to undo a submitted native write', async () => {
    const h = await fixture(); const plan = await h.plan(); const gate = deferred<void>(); const entered = deferred<void>(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (...args) => { entered.resolve(); await gate.promise; await set(...args); });
    const confirmation = h.reviews.confirm(plan.operationId, 0, h.owner); await entered.promise;
    expect(h.reviews.cancel(plan.operationId, 0, h.owner)).toMatchObject({ state: 'pending', facts: { attempt: 'submitted' } }); gate.resolve();
    expect(await confirmation).toMatchObject({ outcome: { state: 'committed' } }); expect(h.port.set).toHaveBeenCalledOnce();
});
it('a throwing private source lease is stale and cannot turn into a valid empty snapshot', async () => {
    const h = await fixture(); h.ports.captureSource.mockReturnValueOnce(() => { throw new Error('source lease'); });
    expect(await h.preview()).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a reentrant confirmation during the native ownership check joins the already admitted operation', async () => {
    const h = await fixture(); const plan = await h.plan(); const fence = h.ports.fence.getMockImplementation()!; let joined: ReturnType<typeof h.reviews.confirm> | null = null;
    h.ports.fence.mockImplementationOnce(owner => { joined = h.reviews.confirm(plan.operationId, 0, h.owner); return fence(owner); });
    const result = await h.reviews.confirm(plan.operationId, 0, h.owner); expect(await joined).toEqual(result); expect(h.port.set).toHaveBeenCalledOnce();
});
it.each(['confirm', 'cancel'] as const)('a reentrant cancellation wins over the outer %s without reviving or overwriting its receipt', async method => {
    const h = await fixture(); const plan = await h.plan(); const fence = h.ports.fence.getMockImplementation()!;
    h.ports.fence.mockImplementationOnce(owner => { h.reviews.cancel(plan.operationId, 0, h.owner); return fence(owner); });
    expect(await h.reviews[method](plan.operationId, 0, h.owner)).toEqual({ state: 'stale' });
    expect(h.reviews.inspect(plan.operationId, 0, h.owner)).toMatchObject({ state: 'result', outcome: { state: 'cancelled' } }); expect(h.port.set).not.toHaveBeenCalled();
});
it('an unexpected store exception preserves uncertainty and does not invent a native acknowledgement', async () => {
    const h = await fixture(); const plan = await h.plan(); vi.spyOn(h.store, 'commit').mockRejectedValue(new Error('native boundary'));
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toMatchObject({ outcome: { state: 'unknown', acknowledgement: 'unknown' }, facts: { attempt: 'unobserved', acknowledgement: null } });
    expect(h.store.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
it('a store boundary failure after actual submission retains the already observed acknowledgement independently', async () => {
    const h = await fixture(); const plan = await h.plan(); vi.spyOn(h.store, 'commit').mockImplementation(async (_before, after, _current, _preflight, trace) => {
        trace?.submitted(); await h.port.set(SESSION_PREFERENCES_KEY, after); trace?.acknowledged?.('accepted'); throw new Error('lost boundary response');
    });
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toMatchObject({ outcome: { state: 'unknown', acknowledgement: 'accepted' }, facts: { attempt: 'submitted', acknowledgement: 'accepted', observation: null } });
    expect(h.store.guard.uncertain).toBe(true); expect(h.port.set).toHaveBeenCalledOnce();
});
it('an unexpected adoption exception preserves this guard and cannot assert a write attempt or adoption', async () => {
    const h = await fixture(); h.store.protectUnknown(); const plan = await h.plan({ type: 'adopt-observed' }); vi.spyOn(h.store, 'reconcile').mockRejectedValue(new Error('adoption'));
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toMatchObject({ outcome: { state: 'unavailable' }, facts: { attempt: 'unobserved' } });
    expect(h.store.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
it.each([NaN, Number.MAX_SAFE_INTEGER])('clock loss or deadline overflow %s after a known native save cannot allocate a falsely live completion receipt', async now => {
    const h = await fixture(); const plan = await h.plan(); h.changed.mockImplementation(() => { if (!h.store.guard.pending) h.ports.now.mockReturnValue(now); });
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toMatchObject({ outcome: { state: 'committed', current: false }, facts: { attempt: 'submitted', observation: 'committed' } });
    h.ports.now.mockReturnValue(100000); expect(h.reviews.inspect(plan.operationId, 0, h.owner)).toEqual({ state: 'expired' }); expect(h.port.set).toHaveBeenCalledOnce();
});
it('a throwing native clock cannot allocate or disclose a reviewed operation', async () => {
    const h = await fixture(); h.ports.now.mockImplementation(() => { throw new Error('clock'); }); expect(await h.preview()).toEqual({ state: 'unavailable' }); expect(h.ports.identifier).not.toHaveBeenCalled();
});
it('a known native clear retains no invented source label or effective settings after its selected credential is revoked', async () => {
    const h = await fixture(); await h.confirm(); await h.service.revoke(); vi.mocked(h.reader.read).mockClear();
    const plan = await h.plan({ type: 'clear' }, 1); expect(plan).toMatchObject({ source: null, effectiveBefore: null, effectiveAfter: null });
    expect(await h.reviews.confirm(plan.operationId, 1, h.owner)).toMatchObject({ outcome: { state: 'committed', revision: 2 } }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a revision substituted during canonical snapshot materialization cannot bypass the preview compare-and-swap', async () => {
    const h = await fixture(); const value = { ...empty }; Object.defineProperty(value, 'toJSON', { value: () => ({ ...empty, revision: 1 }) });
    vi.spyOn(h.store, 'inspect').mockResolvedValue({ loaded: { state: 'ready', value }, witness: {}, pending: false, precaution: false });
    expect(await h.preview()).toEqual({ state: 'conflict' }); expect(h.ports.identifier).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('source retirement immediately after identifier admission is rechecked before publishing an actionable preview', async () => {
    const h = await fixture(); let armed = false; const capture = h.ports.captureSource.getMockImplementation()!;
    h.ports.captureSource.mockImplementation(() => { const lease = capture(); return () => { const current = lease(); if (armed) { armed = false; h.connections.invalidatePreferenceSource(); } return current; }; });
    h.ports.identifier.mockImplementation(() => { armed = true; return 'c'.repeat(32); });
    expect(await h.preview()).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a scope retired by its last admission callback cannot start execution even after that callback returned its earlier true observation', async () => {
    const h = await fixture(); let armed = false; const capture = h.ports.captureSource.getMockImplementation()!;
    h.ports.captureSource.mockImplementation(() => { const lease = capture(); return () => { const current = lease(); if (armed) { armed = false; h.connections.invalidatePreferenceSource(); } return current; }; });
    const plan = await h.plan(); const commit = vi.spyOn(h.store, 'commit'); armed = true;
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toMatchObject({ outcome: { state: 'stale' }, facts: { attempt: 'unobserved' } }); expect(commit).not.toHaveBeenCalled();
});
