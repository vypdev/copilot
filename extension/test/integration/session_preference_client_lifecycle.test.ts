import { afterEach, expect, it, vi } from 'vitest';
import { sessionPreferenceClientFixture } from '../fixtures/session_preference_client.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SessionPreferenceReviewClient } from '../../src/application/session_preference_review_client.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture() { const h = await sessionPreferenceClientFixture(); stops.push(h.stop); return h; }
const intent = { type: 'replace', preferences: { density: 'compact' } } as const;
it('a throwing eligibility port cannot grant local review authority or send a native request', async () => {
    const h = await fixture(); h.ports.canMutate.mockImplementation(() => { throw new Error('foreground'); }); h.ports.request.mockClear();
    await h.client.reviews.preview(intent, 0); expect(h.client.view.issue).toBe('denied'); expect(h.ports.request).not.toHaveBeenCalled();
});
it('clock loss while preview delivery arrives cannot retain a review with an invented current lifetime', async () => {
    const h = await fixture(); h.ports.now.mockImplementation(() => { throw new Error('clock'); }); await h.client.reviews.preview(intent, 0);
    expect(h.client.view.review).toBeNull(); expect(h.client.view.issue).toBe('unavailable'); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('an unavailable confirmation clock expires the existing review without a native write', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); h.ports.now.mockReturnValue(NaN); await h.client.reviews.confirm();
    expect(h.client.view.issue).toBe('expired'); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it.each([{ state: 'unverified' }, { state: 'invalid', reason: 'invalid-input' }, { state: 'invalid', reason: 'overflow' }, { state: 'expired' }])('a bounded native $state preview refusal cannot retain an operation or be silently retried', async response => {
    const h = await fixture(); h.ports.request.mockResolvedValue(response); await h.client.reviews.preview(intent, 0);
    expect(h.client.view.review).toBeNull(); expect(h.client.view.issue).toBe(response.state === 'invalid' ? response.reason === 'overflow' ? 'overflow' : 'invalid' : response.state); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('an already expired native preview is refused without renewing its deadline or retaining its selector', async () => {
    const h = await fixture(); h.ports.request.mockImplementation(async input => {
        const result = await h.dispatch(input);
        if (input.method.endsWith('.preview') && result && typeof result === 'object' && 'expiresAt' in result && typeof result.expiresAt === 'number') h.ports.now.mockReturnValue(result.expiresAt);
        return result;
    });
    await h.client.reviews.preview(intent, 0); expect(h.client.view.issue).toBe('expired'); expect(h.client.view.review).toBeNull();
});
it.each(['expired', 'stale', 'denied', 'conflict'] as const)('a native %s confirmation response has an explicit terminal phase and never an invented successful save', async state => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockResolvedValue({ state }); await h.client.reviews.confirm();
    expect(h.client.view.review).toMatchObject({ phase: state === 'conflict' ? 'result' : 'stale', outcome: { state } }); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('a known committed result with a retired source stays factual while its old plan is purged', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0);
    h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input);
        if (input.method.endsWith('.confirm') && result && typeof result === 'object' && 'outcome' in result) return { ...result, outcome: { state: 'committed', revision: 1, acknowledgement: 'accepted', current: false } }; return result; });
    await h.client.reviews.confirm(); expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null, outcome: { outcome: { state: 'committed', current: false } } });
});
it.each(['role', 'shutdown'] as const)('a %s transition reentered from preview publication prevents even logical request dispatch', async reason => {
    const h = await fixture(); const before = h.ports.request.mock.calls.length;
    h.client.subscribe(view => { if (view.busy) { if (reason === 'role') h.allowMutation(false); else h.client.stop(); } });
    await h.client.reviews.preview(intent, 0); expect(h.ports.request).toHaveBeenCalledTimes(before); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it.each(['role', 'context'] as const)('a %s transition reentered from confirmation publication cannot dispatch the old operation', async reason => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockClear();
    h.client.subscribe(view => { if (view.review?.phase === 'committing') { if (reason === 'role') h.allowMutation(false); else h.client.contextChanged(); } });
    await h.client.reviews.confirm(); expect(h.ports.request).not.toHaveBeenCalled(); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('retired pending deliveries remain bounded at16 before a new local preview is refused', async () => {
    const h = await fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValue(gate.promise); const pending: Promise<void>[] = [];
    for (let i = 0; i < 16; i++) { pending.push(h.client.reviews.preview(intent, 0)); h.client.reviews.retire(); }
    await h.client.reviews.preview(intent, 0); expect(h.client.view.issue).toBe('busy'); expect(h.ports.request.mock.calls.filter(([request]) => request.method.endsWith('.preview'))).toHaveLength(16);
    gate.resolve(null); await Promise.all(pending); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('an in-flight confirmation cannot be dismissed and a later stopped delivery cannot revive native view state', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise);
    const confirming = h.client.reviews.confirm(); expect(await h.client.reviews.dismiss()).toBe(false); h.client.stop(); gate.resolve(null); await confirming;
    expect(await h.client.reviews.dismiss()).toBe(false); h.client.contextChanged(); expect(h.client.view.review).toBeNull(); expect(h.client.view.reader.data).toBeNull();
});
it('duplicate exact inspections share one current local attempt and context retirement drops the delayed response', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0);
    h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); return input.method.endsWith('.confirm') ? null : result; });
    await h.client.reviews.confirm(); await vi.waitFor(() => expect(h.client.reader.view.current).toBe(true)); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); h.ports.request.mockClear();
    const inspection = h.client.reviews.inspect(); await h.client.reviews.inspect(); expect(h.ports.request).toHaveBeenCalledOnce(); h.client.contextChanged(); gate.resolve(null); await inspection;
    expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null });
});
it('shutdown reentered from inspection publication cannot dispatch another logical operation query', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockResolvedValue(null); await h.client.reviews.confirm(); h.ports.request.mockClear();
    h.client.subscribe(view => { if (view.checking) h.client.stop(); }); await h.client.reviews.inspect(); expect(h.ports.request).not.toHaveBeenCalled();
});
it('renderer and follow-up callback exceptions cannot erase a real retained operation result', async () => {
    const h = await fixture(); const reviews = new SessionPreferenceReviewClient({ request: h.dispatch, now: () => Date.now(), canMutate: () => true, changed: () => { throw new Error('renderer'); } },
        () => h.client.reader.view, () => { throw new Error('follow-up'); });
    await reviews.preview(intent, 0); await reviews.confirm(); expect(reviews.view.review?.outcome).toMatchObject({ outcome: { state: 'committed' } }); reviews.stop();
});
it('future native metadata stays current as an unavailable document without a fabricated revision cursor or effective settings', async () => {
    const h = await fixture(); h.sessionValues.set(SESSION_PREFERENCES_KEY, { schemaVersion: 9 }); await h.client.reader.read();
    expect(h.client.view.reader).toMatchObject({ current: true, data: { loaded: { state: 'future' }, effective: null } });
    await h.client.reviews.preview(intent, 0); expect(h.client.view.issue).toBe('future'); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('preview is ignored during an owned request, while a review exists and after stop without additional native dispatch', async () => {
    const h = await fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); h.ports.request.mockClear();
    const first = h.client.reviews.preview(intent, 0); await h.client.reviews.preview(intent, 0); expect(h.ports.request).toHaveBeenCalledOnce(); gate.resolve(null); await first;
    await h.client.reviews.preview(intent, 0); const count = h.ports.request.mock.calls.length; await h.client.reviews.preview(intent, 0); expect(h.ports.request).toHaveBeenCalledTimes(count);
    h.client.stop(); await h.client.reviews.preview(intent, 0); h.client.reviews.retire(); expect(h.ports.request).toHaveBeenCalledTimes(count);
});
it('a rejected native transport produces bounded uncertainty rather than another effect or the original exception', async () => {
    const h = await fixture(); h.ports.request.mockRejectedValueOnce(new Error('private transport')); await h.client.reviews.preview(intent, 0);
    expect(h.client.view.issue).toBe('unavailable'); await h.client.reviews.preview(intent, 0); h.ports.request.mockRejectedValueOnce(new Error('private confirm')); await h.client.reviews.confirm();
    expect(h.client.view.review).toMatchObject({ phase: 'unknown', outcome: null }); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('missing inspection of a known unknown result preserves its native facts and marks only inspection unavailable', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); vi.mocked(h.sessionArea.set).mockResolvedValue(undefined); await h.client.reviews.confirm();
    h.ports.request.mockResolvedValueOnce(null); await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'unknown', acknowledgement: 'accepted' } });
    expect(h.client.view.issue).toBe('unavailable'); expect(h.client.view.checking).toBe(false);
});
it.each(['acknowledgement', 'observation'] as const)('a later completion claim cannot erase the already observed native %s fact', async mismatch => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); vi.mocked(h.sessionArea.set).mockResolvedValue(undefined); await h.client.reviews.confirm();
    h.ports.request.mockResolvedValueOnce({ state: 'result', outcome: { state: 'committed', revision: 1, acknowledgement: mismatch === 'acknowledgement' ? 'unknown' : 'accepted', current: true },
        facts: { attempt: 'submitted', acknowledgement: mismatch === 'acknowledgement' ? 'unknown' : 'accepted', observation: 'committed' } });
    await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'unknown', acknowledgement: 'accepted', observation: 'different' } });
});
it('dismissing a review that native cancellation reports as already pending cannot discard its in-flight operation', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockResolvedValueOnce({ state: 'pending', facts: { attempt: 'submitted', acknowledgement: null, observation: null } });
    expect(await h.client.reviews.dismiss()).toBe(false); expect(h.client.view).toMatchObject({ busy: true, canInspect: true, review: { phase: 'unknown' } });
});
it('stopping from primary result publication prevents metadata follow-up without changing the completed native effect', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); const reads = h.ports.request.mock.calls.filter(([request]) => request.method.endsWith('.read')).length;
    h.client.subscribe(view => { if (view.review?.outcome?.state === 'result') h.client.stop(); }); await h.client.reviews.confirm();
    expect(h.client.view.review).toBeNull(); expect(h.ports.request.mock.calls.filter(([request]) => request.method.endsWith('.read'))).toHaveLength(reads);
});
it('delayed progress cannot lose already observed readback facts, and matching final delivery can complete that same operation', async () => {
    const h = await fixture(); await h.client.reviews.preview(intent, 0); const gate = deferred<void>(); const entered = deferred<void>();
    h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); if (input.method.endsWith('.confirm')) { entered.resolve(); await gate.promise; } return result; });
    const confirmation = h.client.reviews.confirm(); await entered.promise;
    h.ports.request.mockResolvedValueOnce({ state: 'pending', facts: { attempt: 'submitted', acknowledgement: 'accepted', observation: 'committed' } }); await h.client.reviews.inspect();
    h.ports.request.mockResolvedValueOnce({ state: 'pending', facts: { attempt: 'submitted', acknowledgement: 'accepted', observation: null } }); await h.client.reviews.inspect();
    expect(h.client.view.review?.outcome).toMatchObject({ state: 'pending', facts: { observation: 'committed' } });
    gate.resolve(); await confirmation; expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'committed' }, facts: { observation: 'committed' } });
});
