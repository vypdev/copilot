import { afterEach, expect, it, vi } from 'vitest';
import { sessionPreferenceClientFixture } from '../fixtures/session_preference_client.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { FEATURE_DEFAULTS } from '../../src/domain/feature_defaults.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture() { const h = await sessionPreferenceClientFixture(); stops.push(h.stop); return h; }
const intent = { type: 'replace', preferences: { density: 'compact', paused: true } } as const;
const preview = (h: Awaited<ReturnType<typeof fixture>>) => h.client.reviews.preview(intent, 0);
const writes = (h: Awaited<ReturnType<typeof fixture>>) => vi.mocked(h.sessionArea.set).mock.calls.filter(([value]) => Object.hasOwn(value, SESSION_PREFERENCES_KEY));
it('the client exposes a complete immutable review without its private operation selector and without making an effect', async () => {
    const h = await fixture(); await preview(h);
    expect(h.client.view.review).toMatchObject({ phase: 'preview', plan: { source: { name: 'Work', account: 'octo' }, after: { preferences: intent.preferences } } });
    expect(h.client.view.review?.plan).not.toHaveProperty('operationId'); expect(Object.isFrozen(h.client.view.review?.plan)).toBe(true);
    expect(writes(h)).toHaveLength(0); expect(h.provider).not.toHaveBeenCalled();
});
it('confirm sends one retained selector and reads native state independently after its committed facts', async () => {
    const h = await fixture(); await preview(h); await h.client.reviews.confirm(); await vi.waitFor(() => expect(h.client.view.reader.current).toBe(true));
    expect(h.client.view.review).toMatchObject({ phase: 'result', outcome: { state: 'result', outcome: { state: 'committed', revision: 1 }, facts: { attempt: 'submitted', observation: 'committed' } } });
    expect(h.client.view.reader.data?.effective).toMatchObject({ density: 'compact', paused: true }); expect(writes(h)).toHaveLength(1);
    expect(h.ports.request.mock.calls.filter(([value]) => value.method.endsWith('.confirm'))).toHaveLength(1);
});
it('two confirm gestures during a blocked native write cannot submit a second effect', async () => {
    const h = await fixture(); await preview(h); const gate = deferred<void>(); const entered = deferred<void>(); const original = vi.mocked(h.sessionArea.set).getMockImplementation()!;
    vi.mocked(h.sessionArea.set).mockImplementation(async value => { if (Object.hasOwn(value, SESSION_PREFERENCES_KEY)) { entered.resolve(); await gate.promise; } await original(value); });
    const confirmation = h.client.reviews.confirm(); await entered.promise; await h.client.reviews.confirm(); expect(writes(h)).toHaveLength(1); gate.resolve(); await confirmation;
});
it('cancel is an independent no-effect result and a later confirm gesture cannot revive the retained operation', async () => {
    const h = await fixture(); await preview(h); await h.client.reviews.cancel(); await h.client.reviews.confirm();
    expect(h.client.view.review?.outcome).toMatchObject({ state: 'result', outcome: { state: 'cancelled' }, facts: { attempt: 'unobserved' } }); expect(writes(h)).toHaveLength(0);
});
it('exact operation inspection can prove a completion while its original delivery is pending and preserves it after delivery loss', async () => {
    const h = await fixture(); await preview(h); const gate = deferred<void>(); const entered = deferred<void>();
    h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); if (input.method.endsWith('.confirm')) { entered.resolve(); await gate.promise; return null; } return result; });
    const pending = h.client.reviews.confirm(); await entered.promise; await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'committed' } });
    gate.resolve(); await pending; expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'committed' } }); expect(writes(h)).toHaveLength(1);
});
it('a lost response remains unknown despite matching native metadata and never resubmits confirmation', async () => {
    const h = await fixture(); await preview(h);
    h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); return input.method.endsWith('.confirm') ? null : result; });
    await h.client.reviews.confirm(); await h.client.reader.read(); expect(h.client.view.review).toMatchObject({ phase: 'unknown', outcome: null });
    expect(h.client.view.reader.data?.loaded).toMatchObject({ state: 'ready', value: { revision: 1 } }); await h.client.reviews.confirm(); expect(writes(h)).toHaveLength(1);
    await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'committed' } });
});
it('a real uncertain write keeps its acknowledgement and observation when an exact inspection has expired', async () => {
    const h = await fixture(); await preview(h); vi.mocked(h.sessionArea.set).mockResolvedValue(undefined); await h.client.reviews.confirm();
    expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'unknown', acknowledgement: 'accepted', observation: 'different' }, facts: { attempt: 'submitted', acknowledgement: 'accepted' } });
    h.ports.request.mockImplementation(input => input.method.endsWith('.result') ? Promise.resolve({ state: 'expired' }) : h.dispatch(input));
    await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'unknown', acknowledgement: 'accepted' } }); expect(h.client.view.canInspect).toBe(true);
});
it('a saved revision change withdraws an unsubmitted preview without writing or reverting any native preference', async () => {
    const h = await fixture(); await preview(h); h.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 2 }); await h.client.reader.read();
    expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null }); expect(h.client.view.issue).toBe('conflict'); await h.client.reviews.confirm(); expect(writes(h)).toHaveLength(0);
});
it('different current metadata masks stale source labels after invocation without certifying an unknown operation', async () => {
    const h = await fixture(); await preview(h); h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); return input.method.endsWith('.confirm') ? null : result; });
    await h.client.reviews.confirm(); h.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 2 }); await h.client.reader.read();
    expect(h.client.view.review).toMatchObject({ phase: 'unknown', plan: null, outcome: null }); await h.client.reviews.inspect();
    expect(h.client.view.review).toMatchObject({ plan: null, outcome: { outcome: { state: 'committed' } } });
});
it('an expired review and a clock rollback cannot submit a retained write', async () => {
    const h = await fixture(); await preview(h); h.ports.now.mockReturnValue(h.client.view.review!.plan!.expiresAt); await h.client.reviews.confirm(); expect(h.client.view.issue).toBe('expired'); expect(writes(h)).toHaveLength(0);
    const g = await fixture(); await preview(g); g.advance(-10000); await g.client.reviews.confirm(); expect(g.client.view.issue).toBe('expired'); expect(writes(g)).toHaveLength(0);
});
it('role policy refusal blocks effect requests while cancellation still withdraws an existing review', async () => {
    const h = await fixture(); h.allowMutation(false); await preview(h); expect(h.client.view.issue).toBe('denied'); expect(h.ports.request).toHaveBeenCalledTimes(1);
    h.allowMutation(true); await preview(h); h.allowMutation(false); await h.client.reviews.confirm(); expect(h.client.view.review?.phase).toBe('preview');
    await h.client.reviews.cancel(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'cancelled' } }); expect(writes(h)).toHaveLength(0);
});
it('invalid caller intents, unsupported scopes and invalid revisions never become native requests', async () => {
    const h = await fixture(); for (const input of [{ type: 'replace', preferences: { grant: true } }, { type: 'clear', scope: {} }]) await h.client.reviews.preview(input, 0);
    await h.client.reviews.preview(intent, -1); expect(h.client.view.issue).toBe('invalid'); expect(h.ports.request).toHaveBeenCalledTimes(1);
});
it('a valid preview for a different authoring patch cannot become the requested review', async () => {
    const h = await fixture(); const other = await h.dispatch({ method: 'center.session-preferences.preview', expectedRevision: 0, intent: { type: 'replace', preferences: { shortcuts: false } } });
    h.ports.request.mockResolvedValue(other); await preview(h); expect(h.client.view.review).toBeNull(); expect(h.client.view.issue).toBe('unavailable'); expect(writes(h)).toHaveLength(0);
});
it('metadata is required for authoring and invalidated metadata cannot approve an already retained preview', async () => {
    const h = await fixture(); h.client.reader.invalidate(); await preview(h); expect(h.client.view.issue).toBe('unavailable');
    await h.client.reader.read(); await preview(h); h.client.reader.invalidate(); await h.client.reviews.confirm(); expect(h.client.view.issue).toBe('conflict'); expect(writes(h)).toHaveLength(0);
});
it('a context retirement clears source labels while retaining already observed scalar operation facts', async () => {
    const h = await fixture(); await preview(h); await h.client.reviews.confirm(); h.client.contextChanged();
    expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null, outcome: { outcome: { state: 'committed' } } }); expect(h.client.view.reader.data).toBeNull();
});
it('stopping during preview drops its late response and prevents any later native effect', async () => {
    const h = await fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); const pending = preview(h); h.client.stop(); gate.resolve(null);
    await pending; await h.client.reviews.confirm(); await h.client.reader.read(); expect(h.client.view.review).toBeNull(); expect(h.client.view.reader.data).toBeNull(); expect(writes(h)).toHaveLength(0);
});
it('dismissing an unsubmitted review cancels it once and releases only the local review view', async () => {
    const h = await fixture(); await preview(h); expect(await h.client.reviews.dismiss()).toBe(true); expect(h.client.view.review).toBeNull(); expect(writes(h)).toHaveLength(0);
    expect(h.ports.request.mock.calls.filter(([value]) => value.method.endsWith('.cancel'))).toHaveLength(1);
});
it('subscriber failures and duplicate metadata cannot change effect facts or exceed bounded renderer ownership', async () => {
    const h = await fixture(); const bad = vi.fn(() => { throw new Error('renderer'); }); const remove = h.client.subscribe(bad); await h.client.reader.read(); remove(); const calls = bad.mock.calls.length;
    await h.client.reader.read(); expect(bad).toHaveBeenCalledTimes(calls); for (let i = 0; i < 7; i++) h.client.subscribe(vi.fn());
    expect(() => h.client.subscribe(vi.fn())).toThrow('session-preference-subscriber-capacity'); expect(writes(h)).toHaveLength(0);
});
it('explicit native adoption releases only preference precaution and conveys no retrospective acknowledgement or repeated write', async () => {
    const h = await fixture(); vi.mocked(h.sessionArea.set).mockResolvedValue(undefined); await preview(h); await h.client.reviews.confirm();
    await vi.waitFor(() => expect(h.client.view.reader.current).toBe(true)); expect(h.client.view.reader.data?.precaution).toBe(true);
    await h.client.reviews.dismiss(); await h.client.reviews.preview({ type: 'adopt-observed' }, 0); expect(h.client.view.review?.phase).toBe('preview');
    await h.client.reviews.confirm(); expect(h.client.view.review?.outcome).toMatchObject({ state: 'result', outcome: { state: 'reconciled', revision: 0 }, facts: { attempt: 'unobserved', acknowledgement: null, observation: null } });
    await vi.waitFor(() => expect(h.client.view.reader.current).toBe(true)); expect(h.client.view.reader.data?.precaution).toBe(false); expect(writes(h)).toHaveLength(1);
});
it('a known native clear is reviewed and committed despite invalid saved settings without repairing those saved settings', async () => {
    const h = await fixture(); await preview(h); await h.client.reviews.confirm(); await vi.waitFor(() => expect(h.client.view.reader.current).toBe(true)); await h.client.reviews.dismiss();
    h.localValues.set(SETTINGS_KEY, { damaged: true }); await h.client.reader.read(); await h.client.reviews.preview({ type: 'clear' }, 1);
    expect(h.client.view.review).toMatchObject({ phase: 'preview', plan: { effectiveBefore: null, effectiveAfter: null, settingsRevision: null, after: { scope: null } } });
    await h.client.reviews.confirm(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'committed', revision: 2 } }); expect(h.localValues.get(SETTINGS_KEY)).toEqual({ damaged: true }); expect(writes(h)).toHaveLength(2);
});
it('observed submission facts survive a lost final delivery instead of becoming an invented unsubmitted result', async () => {
    const h = await fixture(); await preview(h); const gate = deferred<void>(); const entered = deferred<void>(); const original = vi.mocked(h.sessionArea.set).getMockImplementation()!;
    vi.mocked(h.sessionArea.set).mockImplementation(async value => { if (Object.hasOwn(value, SESSION_PREFERENCES_KEY)) { entered.resolve(); await gate.promise; } await original(value); });
    h.ports.request.mockImplementation(async input => { const result = await h.dispatch(input); return input.method.endsWith('.confirm') ? null : result; });
    const confirmation = h.client.reviews.confirm(); await entered.promise; await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ state: 'pending', facts: { attempt: 'submitted' } });
    gate.resolve(); await confirmation; expect(h.client.view).toMatchObject({ busy: false, review: { phase: 'unknown', outcome: { facts: { attempt: 'submitted' } } } });
    await h.client.reviews.inspect(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'committed' }, facts: { attempt: 'submitted' } }); expect(writes(h)).toHaveLength(1);
});
it('the complete native client review preserves an inherited global pause when its explicit session pause is false', async () => {
    const h = await fixture(); h.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 2, paused: true }); await h.client.reader.read();
    await h.client.reviews.preview({ type: 'replace', preferences: { paused: false, density: 'compact' } }, 0);
    expect(h.client.view.review).toMatchObject({ phase: 'preview', plan: { effectiveBefore: { pauseSources: ['global'] }, effectiveAfter: { paused: true, pauseSources: ['global'] } } });
});
it('a complete150-feature override survives the actual native wire and source validation without an omitted or invented feature', async () => {
    const h = await fixture(); const features = Object.fromEntries(Object.keys(FEATURE_DEFAULTS).map((id, index) => [id, index % 2 === 0]));
    await h.client.reviews.preview({ type: 'replace', preferences: { features } }, 0); expect(h.client.view.review).toMatchObject({ phase: 'preview', plan: { after: { preferences: { features } }, effectiveAfter: { features } } });
    await h.client.reviews.confirm(); expect(h.client.view.review?.outcome).toMatchObject({ outcome: { state: 'committed' } }); expect(writes(h)).toHaveLength(1);
});
