import { expect, it, vi } from 'vitest';
import { compoundObserverFixture as fixture } from '../fixtures/compound_observer.ts';
import { collectionPreview, collectionConfirm, COLLECTION_OWNER } from '../fixtures/collection_reviews.ts';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { validCollectionFact } from '../../src/domain/collection_fact.ts';
import { deferred } from '../fixtures/runtime.ts';

it('the admitted start exposes its actual preference, prerequisite inspection and activation independently', async () => {
    const f = fixture(); const preview = await collectionPreview(f); expect(f.last().engine.fact.state).toBe('reviewed');
    expect(f.snapshots).toHaveLength(0); expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done' });
    expect(f.last().engine.fact).toMatchObject({ state: 'settled', result: 'done', preference: { phase: 'settled', observation: 'committed' },
        pause: { phase: 'observed', acknowledgement: 'not-attempted', observation: 'paused', attributed: false },
        activation: { phase: 'observed', acknowledgement: 'accepted', observation: 'active', attributed: true }, incomplete: false });
    expect(f.snapshots.every(validCollectionFact)).toBe(true); expect(JSON.stringify(f.snapshots)).not.toContain(preview.operationId);
});
it('an existing active policy is really paused before the opt-in save and then activated, with separate facts', async () => {
    const f = fixture(); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f);
    await collectionConfirm(f, preview.operationId); expect(f.events.filter(event => event.endsWith(':set'))).toEqual(['diagnostics:set', 'preferences:set', 'diagnostics:set']);
    expect(f.last().engine.fact.pause).toMatchObject({ acknowledgement: 'accepted', observation: 'paused', attributed: true });
    expect(f.last().engine.fact.activation).toMatchObject({ observation: 'active', attributed: true });
});
it('a stop reuses its exact staged restriction without another observed attempt or policy trace', async () => {
    const f = fixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const trace = vi.spyOn(f.last().engine, 'policy'); await collectionConfirm(f, preview.operationId);
    expect(trace).toHaveBeenCalledExactlyOnceWith('pause'); expect(f.events.filter(event => event.endsWith(':set'))).toEqual(['diagnostics:set', 'preferences:set']);
    expect(f.last().engine.fact).toMatchObject({ action: 'stop', result: 'done', activation: { phase: 'not-observed' }, pause: { attributed: true }, preferenceVerifiedAtObservation: true });
});
it('a stop with already-off intent can pause policy without fabricating preference publication', async () => {
    const f = fixture(); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    await collectionConfirm(f, preview.operationId); expect(f.port.set).not.toHaveBeenCalled();
    expect(f.last().engine.fact).toMatchObject({ preferenceRequired: false, preference: { phase: 'not-observed' }, pause: { observation: 'paused', attributed: true }, preferenceVerifiedAtObservation: true });
});
it('a pending native preference attempt stays distinct from a returned result and duplicate confirmation shares it', async () => {
    const f = fixture(); const preview = await collectionPreview(f); const gate = deferred<void>(); const entered = deferred<void>();
    const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation(async (...args) => { entered.resolve(); await gate.promise; await set(...args); });
    const pending = f.reviews.confirm(preview.operationId, COLLECTION_OWNER); await entered.promise;
    expect(f.last().engine.fact).toMatchObject({ state: 'running', preference: { phase: 'submitted', acknowledgement: 'unknown' } });
    expect(f.reviews.confirm(preview.operationId, COLLECTION_OWNER)).toBe(pending); expect(f.reviews.cancel(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'pending' });
    gate.resolve(); expect(await pending).toMatchObject({ reason: 'done' }); expect(f.port.set).toHaveBeenCalledOnce();
});
it.each(['lost-ack', 'unapplied', 'unreadable'] as const)('preference %s preserves independent pause and activation facts without retry', async mode => {
    const f = fixture(); const preview = await collectionPreview(f); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation(async (...args) => {
        if (mode !== 'unapplied') await set(...args);
        if (mode === 'lost-ack') throw new Error('private native acknowledgement');
        if (mode === 'unreadable') vi.mocked(f.port.get).mockRejectedValue(new Error('private canonical read'));
    });
    await collectionConfirm(f, preview.operationId); expect(f.port.set).toHaveBeenCalledOnce();
    const fact = f.last().engine.fact; expect(fact.preference).toMatchObject({ phase: 'settled', acknowledgement: mode === 'lost-ack' ? 'unknown' : 'accepted',
        observation: mode === 'lost-ack' ? 'committed' : mode === 'unapplied' ? 'unchanged' : 'unavailable' });
    expect(fact.activation.phase).toBe(mode === 'lost-ack' ? 'observed' : 'not-observed');
});
it('a failed policy pause cannot be hidden by a successful off preference or an overall service result', async () => {
    const f = fixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => args[1].type === 'set' ? { state: 'unavailable', effect: 'unknown' } : execute(...args));
    await collectionConfirm(f, preview.operationId); expect(f.last().engine.fact).toMatchObject({ result: 'done', preference: { observation: 'committed' },
        pause: { acknowledgement: 'unknown', observation: 'active', attributed: false }, admittedAtObservation: false });
});
it('retained-result inspection and replay do not create another current observer or repeated storage', async () => {
    const f = fixture(); const preview = await collectionPreview(f); const result = await collectionConfirm(f, preview.operationId); const snapshots = f.snapshots.length;
    expect(f.reviews.inspect(preview.operationId, COLLECTION_OWNER)).toBe(result); expect(await f.reviews.confirm(preview.operationId, COLLECTION_OWNER)).toBe(result);
    expect(f.observe).toHaveBeenCalledOnce(); expect(f.port.set).toHaveBeenCalledOnce(); expect(f.snapshots).toHaveLength(snapshots);
});
it.each(['cancel', 'expire', 'invalidate'] as const)('a %s preview remains unsubmitted and cannot be promoted by a late confirmation', async event => {
    const f = fixture(); const preview = await collectionPreview(f);
    if (event === 'cancel') f.reviews.cancel(preview.operationId, COLLECTION_OWNER); else if (event === 'expire') { f.advance(300001); f.reviews.inspect(preview.operationId, COLLECTION_OWNER); } else f.reviews.invalidate();
    expect(f.last().engine.fact).toMatchObject({ state: event === 'cancel' ? 'cancelled' : 'blocked', preference: { phase: 'not-observed' } });
    expect((await f.reviews.confirm(preview.operationId, COLLECTION_OWNER)).state).toBe('expired'); expect(f.port.set).not.toHaveBeenCalled();
});
it('source loss during observer capture blocks its retained preview without a native mutation', async () => {
    const f = fixture(); const observe = f.observe.getMockImplementation()!;
    f.observe.mockImplementation((...args) => { const trace = observe(...args); f.reviews.invalidate(); return trace; });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'stale' });
    expect(f.last().engine.fact.state).toBe('blocked'); expect(f.port.set).not.toHaveBeenCalled();
});
it('transient source loss during capture removes the owned pending record instead of reviving it when a later fence recovers', async () => {
    const f = fixture(); const observe = f.observe.getMockImplementation()!;
    f.observe.mockImplementation((...args) => { const trace = observe(...args); f.ports.review.fence.mockReturnValueOnce(null); return trace; });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'stale' });
    const id = f.ports.review.identifier.mock.results[0].value; expect(await f.reviews.confirm(id, COLLECTION_OWNER)).toEqual({ state: 'expired' });
    expect(f.last().engine.fact.state).toBe('blocked'); expect(f.port.set).not.toHaveBeenCalled();
});
it('preference observation cannot acquire a policy trace for a sibling collection through its semantic port', async () => {
    const f = fixture(); const prepare = f.coordinator.prepare.bind(f.coordinator); let checked = false;
    vi.spyOn(f.coordinator, 'prepare').mockImplementation(async (before, after, current, id, observe) => {
        expect(observe?.('recents')).toBeNull(); checked = true; return prepare(before, after, current, id, observe);
    });
    const preview = await collectionPreview(f); expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done' });
    expect(checked).toBe(true); expect(f.last().engine.fact.collection).toBe('diagnostics'); expect(f.values.has('recents')).toBe(false);
});
it.each(['capture', 'confirming', 'preferenceSubmitted', 'preference', 'policy', 'policySubmitted', 'policyObserved', 'complete'] as const)('a broken %s observer leaves actual consent and policy verification unchanged', async event => {
    const f = fixture(); const fail = () => { throw new Error('secondary'); }; const nothing = () => undefined;
    f.observe.mockImplementation(() => {
        if (event === 'capture') return fail();
        return { confirming: event === 'confirming' ? fail : nothing, cancelled: nothing, blocked: nothing,
            preferenceSubmitted: event === 'preferenceSubmitted' ? fail : nothing, preference: event === 'preference' ? fail : nothing,
            policy: () => { if (event === 'policy') return fail(); return { submitted: event === 'policySubmitted' ? fail : nothing, observed: event === 'policyObserved' ? fail : nothing }; },
            complete: event === 'complete' ? fail : nothing };
    });
    const preview = await collectionPreview(f); expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done', preferenceVerifiedAtObservation: true, admittedAtObservation: true });
    expect(f.port.set).toHaveBeenCalledOnce(); expect(vi.mocked(f.policies.execute).mock.calls.filter(([, command]) => command.type === 'set')).toHaveLength(1);
});
it('observer inputs cannot alter the primary complete snapshot or retained result', async () => {
    const f = fixture(); const preview = await collectionPreview(f); const original = f.last().engine.complete.bind(f.last().engine);
    vi.spyOn(f.last().engine, 'complete').mockImplementation(result => {
        expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.preference)).toBe(true); expect(Object.isFrozen(result.policy)).toBe(true); original(result);
        Object.defineProperty(result.preference, 'state', { value: 'private' });
    });
    const result = await collectionConfirm(f, preview.operationId); expect(result.preference.state).toBe('committed');
    expect(f.reviews.inspect(preview.operationId, COLLECTION_OWNER)).toEqual(result); expect((await f.repository.read()).settings.center.diagnostics).toBe(true);
});
