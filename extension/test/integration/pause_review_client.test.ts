import { expect, it, vi } from 'vitest';
import { pauseClientFixture as fixture } from '../fixtures/pause_client.ts';
import { pausePlanWire, pauseControlWire } from '../fixtures/pause_wire.ts';
import { deferred } from '../fixtures/runtime.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';

const intent = { type: 'emergency', paused: true } as const;
const preview = (h: ReturnType<typeof fixture>) => h.client.reviews.preview(intent, 0);
it('preview retains private operation selectors while exposing an immutable complete public plan', async () => {
    const h = fixture(); await preview(h); expect(h.client.view.review).toMatchObject({ phase: 'preview', plan: { before: h.native.before, after: h.native.after } });
    expect(h.client.view.review?.plan).not.toHaveProperty('operationId'); expect(Object.isFrozen(h.client.view.review)).toBe(true); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('confirmation uses the exact retained ID/revision once and independently rereads native state', async () => {
    const h = fixture(); await preview(h); await h.client.reviews.confirm(); expect(h.client.view.review).toMatchObject({ phase: 'result', outcome: { state: 'committed', revision: 1 } });
    await vi.waitFor(() => expect(h.client.view.reader.current).toBe(true)); expect(h.native.port.set).toHaveBeenCalledOnce();
    expect(h.ports.request.mock.calls.filter(([input]) => input.method === 'center.pauses.confirm')).toHaveLength(1); expect(h.client.view.reader.data?.loaded).toMatchObject({ value: { emergency: true } });
});
it('duplicate confirm during the owned promise cannot create a second native effect', async () => {
    const h = fixture(); await preview(h); const gate = deferred<void>(); const set = vi.mocked(h.native.port.set).getMockImplementation()!;
    vi.mocked(h.native.port.set).mockImplementation(async (...args) => { await gate.promise; await set(...args); }); const pending = h.client.reviews.confirm();
    await h.client.reviews.confirm(); expect(h.ports.request.mock.calls.filter(([input]) => input.method === 'center.pauses.confirm')).toHaveLength(1); gate.resolve(); await pending;
});
it('cancellation is a separate retained outcome and cannot be confirmed later', async () => {
    const h = fixture(); await preview(h); await h.client.reviews.cancel(); await h.client.reviews.confirm();
    expect(h.client.view.review).toMatchObject({ phase: 'result', outcome: { state: 'cancelled' } }); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('inspection can prove completion while the original delivery is pending, and a later lost delivery cannot erase it', async () => {
    const h = fixture(); await preview(h); const gate = deferred<void>(); const entered = deferred<void>();
    h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); if (input.method === 'center.pauses.confirm') { entered.resolve(); await gate.promise; return null; } return result; });
    const pending = h.client.reviews.confirm(); await entered.promise; await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ state: 'committed' });
    gate.resolve(); await pending; expect(h.client.view.review?.outcome).toMatchObject({ state: 'committed' }); expect(h.native.port.set).toHaveBeenCalledOnce();
});
it('a missing transport response remains unknown and is never reissued as confirmation by metadata reads', async () => {
    const h = fixture(); await preview(h); h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); return input.method === 'center.pauses.confirm' ? null : result; });
    await h.client.reviews.confirm(); expect(h.client.view.review).toMatchObject({ phase: 'unknown', outcome: null }); await h.client.reader.read();
    expect(h.client.view.review?.phase).toBe('unknown'); await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ state: 'committed' }); expect(h.native.port.set).toHaveBeenCalledOnce();
});
it('known native uncertainty is not certified by metadata or overwritten by a weaker expired inspection', async () => {
    const h = fixture(); vi.mocked(h.native.port.set).mockResolvedValue(undefined); await preview(h); await h.client.reviews.confirm();
    expect(h.client.view.review?.outcome).toMatchObject({ state: 'unknown', acknowledgement: 'accepted' });
    h.ports.request.mockImplementation(input => input.method === 'center.pauses.result' ? Promise.resolve({ state: 'expired' }) : h.dispatch(input));
    await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ state: 'unknown', acknowledgement: 'accepted' });
});
it('a resumption review expires under the original deadline rather than renewing itself on confirmation', async () => {
    const h = fixture(); await preview(h); h.at(301000); await h.client.reviews.confirm(); expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null });
    expect(h.client.view.issue).toBe('expired'); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('clock rollback and unavailable clocks cannot authorize a pending native review', async () => {
    const h = fixture(); await preview(h); h.at(999); await h.client.reviews.confirm(); expect(h.client.view.issue).toBe('expired');
    const g = fixture(); await preview(g); g.ports.now.mockImplementation(() => { throw new Error('clock'); }); await g.client.reviews.confirm(); expect(g.client.view.issue).toBe('expired');
});
it('role/visibility policy refusal blocks preview and confirmation while cancellation still retires a pending review', async () => {
    const h = fixture(); h.allowMutation(false); await preview(h); expect(h.client.view.issue).toBe('denied'); expect(h.ports.request).not.toHaveBeenCalled();
    h.allowMutation(true); await preview(h); h.allowMutation(false); await h.client.reviews.confirm(); expect(h.client.view.review?.phase).toBe('preview');
    await h.client.reviews.cancel(); expect(h.client.view.review?.outcome?.state).toBe('cancelled'); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('invalid intents and revisions are rejected before sending a logical native request', async () => {
    const h = fixture(); await h.client.reviews.preview({ type: 'all', paused: false }, 0); expect(h.client.view.issue).toBe('invalid');
    await h.client.reviews.preview(intent, -1); expect(h.client.view.issue).toBe('invalid'); expect(h.ports.request).not.toHaveBeenCalled();
});
it('a valid but mismatched scope or revision cannot become the requested review', async () => {
    const h = fixture(); h.ports.request.mockResolvedValue(pausePlanWire('tab')); await preview(h); expect(h.client.view.review).toBeNull(); expect(h.client.view.issue).toBe('unavailable');
    h.ports.request.mockResolvedValue({ ...pausePlanWire(), revision: 1 }); await preview(h); expect(h.client.view.review).toBeNull();
});
it('an explicit adoption retains no native acknowledgement and matches the same observed native revision', async () => {
    const h = fixture(); h.native.guard.protect(); await h.client.reviews.preview({ type: 'adopt-observed' }, 0); await h.client.reviews.confirm();
    expect(h.client.view.review).toMatchObject({ phase: 'result', outcome: { state: 'reconciled', revision: 0 } }); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('observing a different canonical state invalidates only an unsubmitted review and never changes that native record', async () => {
    const h = fixture(); await preview(h); h.native.values.set(TEMPORARY_PAUSES_KEY, h.native.after); await h.client.reader.read();
    expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null }); expect(h.client.view.issue).toBe('conflict'); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a lost positive tab target retires its preview while unrelated tab retirement does not', async () => {
    const h = fixture(); await h.client.reviews.preview({ type: 'tab', tabId: 7, paused: true }, 0); h.client.reviews.invalidateTab(9); expect(h.client.view.review?.phase).toBe('preview');
    h.client.reviews.invalidateTab(7); expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null }); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a native target lost after invocation hides its private label without discarding inspectable operation selectors', async () => {
    const h = fixture(); await h.client.reviews.preview({ type: 'tab', tabId: 7, paused: true }, 0);
    h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); return input.method === 'center.pauses.confirm' ? null : result; });
    await h.client.reviews.confirm(); h.client.reviews.invalidateTab(7); expect(h.client.view.review?.plan).toBeNull();
    await h.client.reviews.inspect(); expect(h.client.view.review).toMatchObject({ phase: 'result', plan: null, outcome: { state: 'committed' } });
});
it('dismissing an unsubmitted preview cancels exactly that preview and does not create an inverse native effect', async () => {
    const h = fixture(); await preview(h); expect(await h.client.reviews.dismiss()).toBe(true); expect(h.client.view.review).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('new metadata cannot certify or erase an already observed unknown native result', async () => {
    const h = fixture(); vi.mocked(h.native.port.set).mockResolvedValue(undefined); await preview(h); await h.client.reviews.confirm(); h.native.values.set(TEMPORARY_PAUSES_KEY, h.native.after); await h.client.reader.read();
    expect(h.client.view.review?.outcome?.state).toBe('unknown');
});
it('context changes purge native plans and labels but retain already observed scalar outcome facts', async () => {
    const h = fixture(); await preview(h); await h.client.reviews.confirm(); h.client.contextChanged();
    expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null, outcome: { state: 'committed' } }); expect(h.client.view.reader.data).toBeNull();
});
it('stop clears views, prevents later effects and drops a pending preview reply', async () => {
    const h = fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); const pending = preview(h);
    h.client.stop(); gate.resolve(pausePlanWire()); await pending; await h.client.reviews.confirm(); await h.client.reader.read();
    expect(h.client.view.review).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.client.view.reader.data).toBeNull();
});
it('subscribers are bounded and isolated while current metadata does not leak reusable authority', async () => {
    const h = fixture(); const bad = vi.fn(() => { throw new Error('renderer'); }); const remove = h.client.subscribe(bad); await h.client.reader.read();
    expect(h.client.view.reader.data).toEqual(pauseControlWire()); remove(); const calls = bad.mock.calls.length; await h.client.reader.read(); expect(bad).toHaveBeenCalledTimes(calls);
    for (let i = 0; i < 7; i++) h.client.subscribe(vi.fn()); expect(() => h.client.subscribe(vi.fn())).toThrow('pause-subscriber-capacity');
});
