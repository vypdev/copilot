import { expect, it } from 'vitest';
import { initialCollectionFact, validCollectionFact, collectionPreferenceFact, collectionPolicyObservation, freezeCollectionFact,
    mergeCollectionFact, sameCollectionFact, type CollectionFact } from '../../src/domain/collection_fact.ts';

const initial = () => initialCollectionFact('diagnostics', 'start', true);
const running = (): CollectionFact => ({ ...initial(), state: 'running' });
const paused = { phase: 'observed', acknowledgement: 'accepted', observation: 'paused', revision: 2, attributed: true } as const;
const submitted = { phase: 'submitted', acknowledgement: 'unknown', observation: 'unavailable', revision: null, attributed: false } as const;
const preference = { phase: 'settled', acknowledgement: 'accepted', observation: 'committed' } as const;
it.each(['diagnostics', 'recents'] as const)('a %s preview owns only detached closed intent before any actual effect', kind => {
    const fact = initialCollectionFact(kind, 'stop', false); expect(validCollectionFact(fact)).toBe(true); expect(Object.isFrozen(fact)).toBe(true);
    expect(Object.isFrozen(fact.pause)).toBe(true); expect(fact.pause).not.toBe(fact.activation); expect(JSON.stringify(fact)).not.toMatch(/operationId|credential|secret|owner/);
});
it('reports three independent phases, including a canonical pause that did not submit another command', () => {
    expect(validCollectionFact({ ...running(), pause: { ...paused, acknowledgement: 'not-attempted', attributed: false }, preference })).toBe(true);
    expect(validCollectionFact({ ...running(), pause: paused, preference, activation: submitted })).toBe(true);
});
it.each([null, [], {}, { kind: 'operation' }, { collection: 'private' }, { action: 'clear' }, { state: 'private' }, { result: 'done' },
    { preferenceRequired: 1 }, { incomplete: 'yes' }, { credential: 'private' }, { preference: null }, { pause: null }, { activation: null },
    { preferenceVerifiedAtObservation: true }, { admittedAtObservation: true }, { sourceCurrentAtObservation: true }])('rejects malformed or private initial collection fact %j', value => {
    expect(validCollectionFact(value === null || Array.isArray(value) || Object.keys(value).length === 0 ? value : { ...initial(), ...value })).toBe(false);
});
it('a reviewed or cancelled preview cannot claim already submitted effects', () => {
    expect(validCollectionFact({ ...initial(), pause: submitted })).toBe(false);
    expect(validCollectionFact({ ...initial(), state: 'cancelled', result: 'cancelled', pause: paused })).toBe(false);
    expect(validCollectionFact({ ...initial(), state: 'blocked', result: 'blocked', preference })).toBe(false);
});
it('a stop never embeds activation or claims to admit new capture', () => {
    expect(validCollectionFact({ ...running(), action: 'stop', activation: submitted })).toBe(false);
    expect(validCollectionFact({ ...running(), action: 'stop', state: 'settled', result: 'done', admittedAtObservation: true })).toBe(false);
});
it('terminal completion preserves pending effects only with explicit incomplete disclosure', () => {
    const value = { ...running(), state: 'settled', result: 'unavailable', pause: submitted };
    expect(validCollectionFact(value)).toBe(false); expect(validCollectionFact({ ...value, incomplete: true })).toBe(true);
    expect(validCollectionFact({ ...running(), state: 'settled', result: 'pending' })).toBe(false);
});
it.each(['preference', 'pause', 'activation'] as const)('private extra fields never enter the %s phase', phase => {
    const value = running(); expect(validCollectionFact({ ...value, [phase]: { ...value[phase], private: true } })).toBe(false);
});
it('preference state never turns a submitted request into accepted or committed proof', () => {
    for (const value of [{ phase: 'submitted', acknowledgement: 'accepted', observation: 'not-observed' },
        { phase: 'blocked', acknowledgement: 'unknown', observation: 'not-observed' }, { ...preference, observation: 'not-observed' },
        { ...preference, acknowledgement: 'not-submitted' }, { ...preference, phase: 'private' }]) expect(collectionPreferenceFact(value)).toBe(false);
});
it('policy state cannot infer a revision or attribution from an unavailable observation', () => {
    for (const value of [{ ...submitted, acknowledgement: 'accepted' }, { ...submitted, revision: 1 }, { ...submitted, attributed: true },
        { ...paused, revision: -1 }, { ...paused, observation: 'unavailable' }, { ...paused, acknowledgement: 'private' },
        { ...paused, observation: 'private' }, { ...paused, phase: 'private' }, { ...paused, attributed: 1 }]) expect(collectionPolicyObservation(value)).toBe(false);
});
it('an exact receipt attributes only its intended phase and cannot come from no attempted command', () => {
    expect(validCollectionFact({ ...running(), pause: { ...paused, observation: 'active' } })).toBe(false);
    expect(validCollectionFact({ ...running(), pause: { ...paused, acknowledgement: 'not-attempted' } })).toBe(false);
    expect(validCollectionFact({ ...running(), activation: paused })).toBe(false);
    expect(validCollectionFact({ ...running(), activation: { ...paused, observation: 'active' } })).toBe(true);
});
it('phase progression can coalesce independent submitted and canonical observations without rewriting an established result', () => {
    const before = { ...running(), pause: submitted }; const after: CollectionFact = { ...before, pause: paused, preference };
    expect(mergeCollectionFact(before, after)).toEqual(after); expect(mergeCollectionFact(after, { ...after, pause: submitted })).toBeNull();
    expect(mergeCollectionFact(after, { ...after, pause: { ...paused, observation: 'unavailable', revision: null, attributed: false } })).toBeNull();
});
it.each(['pause', 'activation'] as const)('a %s observation cannot erase an already recorded native submission', phase => {
    const before = { ...running(), [phase]: submitted };
    const skipped = { ...running(), [phase]: { ...submitted, phase: 'observed', acknowledgement: 'not-attempted' } } as CollectionFact;
    expect(validCollectionFact(skipped)).toBe(true);
    expect(mergeCollectionFact(running(), skipped)).toEqual(skipped);
    expect(mergeCollectionFact(before, skipped)).toBeNull();
    const observed = { ...running(), [phase]: { ...submitted, phase: 'observed' } } as CollectionFact;
    expect(mergeCollectionFact(before, observed)).toEqual(observed);
});
it('captured intent, phase identity, incomplete disclosure and confirmation cannot regress', () => {
    const before = { ...running(), incomplete: true };
    for (const after of [{ ...before, incomplete: false }, { ...before, action: 'stop' }, { ...before, collection: 'recents' },
        { ...before, preferenceRequired: false }, { ...before, state: 'reviewed' }, { ...before, state: 'cancelled', result: 'cancelled' }]) expect(mergeCollectionFact(before, after as CollectionFact)).toBeNull();
});
it('a submitted preference may settle but an observed settled result cannot become a blocked or different effect', () => {
    const before: CollectionFact = { ...running(), preference: { phase: 'submitted', acknowledgement: 'unknown', observation: 'not-observed' } };
    const after: CollectionFact = { ...before, preference }; expect(mergeCollectionFact(before, after)).toEqual(after);
    expect(mergeCollectionFact(after, before)).toBeNull(); expect(mergeCollectionFact(after, { ...after, preference: { ...preference, acknowledgement: 'unknown' } })).toBeNull();
});
it.each(['cancelled', 'blocked', 'settled'] as const)('terminal %s observations cannot be rewritten or promoted by later availability', state => {
    const value: CollectionFact = { ...initial(), state, result: state === 'settled' ? 'done' : state };
    expect(mergeCollectionFact(value, value)).toBe(value); expect(mergeCollectionFact(value, running())).toBeNull();
});
it('semantic equality ignores property order while exact snapshots neither alias nor freeze the caller', () => {
    const source = { ...running(), pause: { ...paused, revision: 2 as number }, preference: { ...preference } }; const snapshot = freezeCollectionFact(source);
    source.pause.revision = 3; expect(snapshot.pause.revision).toBe(2); expect(Object.isFrozen(source)).toBe(false);
    const reordered = Object.fromEntries(Object.entries(snapshot).reverse()) as unknown as CollectionFact;
    expect(sameCollectionFact(snapshot, reordered)).toBe(true); expect(mergeCollectionFact(snapshot, reordered)).toBe(snapshot);
    expect(mergeCollectionFact({} as never, snapshot)).toBeNull(); expect(mergeCollectionFact(snapshot, {} as never)).toBeNull();
    expect(() => freezeCollectionFact({ ...snapshot, result: 'private' } as never)).toThrow('invalid-collection-observation');
});
