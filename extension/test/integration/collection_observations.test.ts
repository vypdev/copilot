import { expect, it, vi } from 'vitest';
import { CollectionObservations } from '../../src/application/collection_observations.ts';
import { validCollectionFact } from '../../src/domain/collection_fact.ts';
import type { CollectionSettled } from '../../src/domain/collection_review.ts';

const result = (): CollectionSettled => ({ state: 'settled', kind: 'diagnostics', action: 'start', reason: 'done',
    preference: { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true }, observedPreference: { enabled: true, revision: 1 },
    preferenceVerifiedAtObservation: true, admittedAtObservation: true, sourceCurrentAtObservation: true,
    policy: { acknowledgement: 'accepted', observation: 'active', revision: 1, attributed: true } });
const policy = { acknowledgement: 'accepted', observation: 'paused', revision: 1, attributed: true } as const;
const fixture = () => { const changed = vi.fn(); const observer = new CollectionObservations('diagnostics', 'start', true, changed); return { changed, observer }; };
it('construction is inert and acquiring a phase observer before confirmation cannot invent a native attempt', () => {
    const f = fixture(); expect(f.changed).not.toHaveBeenCalled(); expect(f.observer.policy('pause')).toBeNull();
    f.observer.preferenceSubmitted(); f.observer.preference(result().preference as never); expect(f.changed).not.toHaveBeenCalled();
    f.observer.confirming(); expect(f.observer.fact.state).toBe('running');
});
it('confirmation alone preserves all three phases as unobserved', () => {
    const f = fixture(); f.observer.confirming(); f.observer.confirming(); expect(f.changed).toHaveBeenCalledOnce();
    expect(f.observer.fact.preference.phase).toBe('not-observed'); expect(f.observer.fact.pause.phase).toBe('not-observed'); expect(f.observer.fact.activation.phase).toBe('not-observed');
});
it('submissions and canonical phase facts are independent immutable observations, with no raw payload', () => {
    const f = fixture(); f.observer.confirming(); const trace = f.observer.policy('pause')!; trace.submitted();
    expect(f.observer.fact.pause).toMatchObject({ phase: 'submitted', acknowledgement: 'unknown', observation: 'unavailable' });
    const source = { ...policy, revision: 1 as number, secret: 'private' }; trace.observed(source); source.revision = 2;
    expect(f.observer.fact.pause.revision).toBe(1); expect(JSON.stringify(f.observer.fact)).not.toContain('private'); expect(Object.isFrozen(f.observer.fact.pause)).toBe(true);
});
it('an inspection of already paused policy does not fabricate a command submission', () => {
    const f = fixture(); f.observer.confirming(); f.observer.policy('pause')!.observed({ ...policy, acknowledgement: 'not-attempted', attributed: false });
    expect(f.observer.fact.pause).toMatchObject({ phase: 'observed', acknowledgement: 'not-attempted', attributed: false });
});
it('duplicate callbacks cannot downgrade a canonical result and invalid phase input acquires no observer', () => {
    const f = fixture(); f.observer.confirming(); const trace = f.observer.policy('pause')!; trace.submitted(); trace.submitted(); trace.observed(policy);
    const fact = f.observer.fact; trace.observed({ ...policy, acknowledgement: 'unknown' }); trace.submitted(); expect(f.observer.fact).toBe(fact);
    expect(f.observer.policy('private' as never)).toBeNull();
});
it('an equal canonical phase replay keeps the same immutable fact and emits no additional change notification', () => {
    const f = fixture(); f.observer.confirming(); f.observer.policy('pause')!.observed(policy); const value = f.observer.fact; const count = f.changed.mock.calls.length;
    f.observer.policy('pause')!.observed({ ...policy }); expect(f.observer.fact).toBe(value); expect(f.changed).toHaveBeenCalledTimes(count);
});
it('a second actual phase attempt is disclosed as incomplete instead of replacing the first observed effect', () => {
    const f = fixture(); f.observer.confirming(); const first = f.observer.policy('pause')!; first.submitted(); first.observed(policy);
    f.observer.policy('pause')!.submitted(); expect(f.observer.fact).toMatchObject({ incomplete: true, pause: { acknowledgement: 'accepted', observation: 'paused' } });
});
it('malformed phase facts cannot poison the slot or hide its later actual canonical observation', () => {
    const f = fixture(); f.observer.confirming(); const trace = f.observer.policy('pause')!;
    trace.observed({ ...policy, acknowledgement: 'private' } as never); trace.observed({ ...policy, observation: 'active' }); expect(f.observer.fact.pause.phase).toBe('not-observed');
    trace.observed(policy); expect(f.observer.fact.pause.phase).toBe('observed');
});
it('unexpected preference publication is still observed and discloses that the reviewed plan did not require it', () => {
    const f = new CollectionObservations('diagnostics', 'stop', false, vi.fn()); f.confirming(); f.preferenceSubmitted();
    expect(f.fact).toMatchObject({ preferenceRequired: false, incomplete: true, preference: { phase: 'submitted' } }); expect(f.policy('activation')).toBeNull();
});
it('an unknown result before any native submission cannot create an observed preference write', () => {
    const f = fixture(); f.observer.confirming(); f.observer.preference({ state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null });
    expect(f.observer.fact.preference.phase).toBe('not-observed'); f.observer.preference({ state: 'stale' }); expect(f.observer.fact.preference.phase).toBe('blocked');
});
it('a settled preference result cannot be erased by later availability or an out-of-order submission callback', () => {
    const f = fixture(); f.observer.confirming(); f.observer.preferenceSubmitted(); f.observer.preference(result().preference as never);
    f.observer.preferenceSubmitted(); f.observer.preference({ state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null });
    expect(f.observer.fact.preference).toMatchObject({ phase: 'settled', acknowledgement: 'accepted', observation: 'committed' });
});
it('a pending observed effect stays incomplete after the primary service finishes and late callbacks cannot rewrite terminal history', () => {
    const f = fixture(); f.observer.confirming(); const trace = f.observer.policy('activation')!; trace.submitted(); f.observer.complete(result());
    const fact = f.observer.fact; expect(fact).toMatchObject({ state: 'settled', incomplete: true, activation: { phase: 'submitted' } });
    trace.observed({ ...policy, observation: 'active' }); f.observer.preferenceSubmitted(); f.observer.complete({ ...result(), reason: 'unavailable' }); expect(f.observer.fact).toBe(fact);
});
it('a missing detailed phase remains undisclosed by the service summary only through an explicit incomplete flag, never a reconstructed effect', () => {
    const f = fixture(); f.observer.confirming(); f.observer.complete(result());
    expect(f.observer.fact).toMatchObject({ state: 'settled', incomplete: true, preference: { phase: 'not-observed' }, activation: { phase: 'not-observed' }, admittedAtObservation: true });
});
it.each(['cancelled', 'blocked'] as const)('an unconfirmed %s review stays terminal despite late primary callbacks', event => {
    const f = fixture(); f.observer[event](); const fact = f.observer.fact; f.observer.confirming(); f.observer.complete(result());
    expect(f.observer.fact).toBe(fact); expect(fact.state).toBe(event);
});
it('cancelling or blocking after confirmation cannot pretend that an already running plan was unsubmitted', () => {
    const f = fixture(); f.observer.confirming(); f.observer.cancelled(); f.observer.blocked(); expect(f.observer.fact.state).toBe('running');
});
it('a result for another collection or action cannot finish this observer', () => {
    const f = fixture(); f.observer.confirming(); f.observer.complete({ ...result(), kind: 'recents' }); f.observer.complete({ ...result(), action: 'stop' }); expect(f.observer.fact.state).toBe('running');
});
it('secondary notification failure preserves the immutable facts and cannot throw into the primary service', () => {
    const f = fixture(); f.changed.mockImplementation(() => { throw new Error('secondary'); });
    expect(() => { f.observer.confirming(); f.observer.preferenceSubmitted(); f.observer.preference(result().preference as never); f.observer.complete(result()); }).not.toThrow();
    expect(validCollectionFact(f.observer.fact)).toBe(true); expect(f.observer.fact.state).toBe('settled');
});
