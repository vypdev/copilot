import { expect, it } from 'vitest';
import { validSessionFact, sessionEffectFact, deepFreezeSessionFact, mergeSessionFact, sessionFactTransition, sameSessionFact, sessionEffectAllowed, type SessionFact, type SessionAction, SESSION_EFFECTS } from '../../src/domain/session_fact.ts';

const initial: SessionFact = { kind: 'session-operation', action: 'connect', state: 'running', result: 'pending', effects: [], incomplete: false };
const submitted = { ordinal: 1, effect: 'save-active', state: 'submitted', acknowledgement: 'unknown', observation: 'not-observed' } as const;
const settled = { ...submitted, state: 'settled', acknowledgement: 'accepted', observation: 'committed' } as const;
it('accepts inert admission and exact native effect facts without a target or private payload', () => {
    expect(validSessionFact(initial)).toBe(true); expect(sessionEffectFact(submitted)).toBe(true); expect(sessionEffectFact(settled)).toBe(true);
    expect(validSessionFact({ ...initial, state: 'settled', result: 'ready', effects: [settled] })).toBe(true);
});
it.each([
    ['connect', ['retire-active', 'save-active', 'cleanup-active', 'save-repository-preference', 'save-vault']], ['select', ['retire-active', 'save-active', 'cleanup-active', 'save-repository-preference', 'save-vault']],
    ['disconnect', ['retire-active', 'cleanup-active', 'save-vault']], ['remove', ['retire-active', 'cleanup-active', 'save-vault']], ['revoke-all', ['retire-active', 'remove-vault']],
] as [SessionAction, string[]][])('the %s action admits only its own closed native effects', (action, allowed) => {
    for (const effect of SESSION_EFFECTS) expect(sessionEffectAllowed(action, effect)).toBe(allowed.includes(effect));
    expect(sessionEffectAllowed(action, 'private' as never)).toBe(false);
});
it('rejects private extra fields at both the top level and effect boundary', () => {
    expect(validSessionFact({ ...initial, label: 'private' })).toBe(false);
    expect(validSessionFact({ ...initial, effects: [{ ...submitted, secret: 'private' }] })).toBe(false);
});
it('rejects malformed roots, action, state and service result instead of treating truthy data as proof', () => {
    for (const value of [null, [], {}, { ...initial, kind: 'operation' }, { ...initial, action: 'export' }, { ...initial, state: 'private' },
        { ...initial, result: 'ready' }, { ...initial, state: 'settled', result: 'pending' }, { ...initial, incomplete: 1 }]) expect(validSessionFact(value)).toBe(false);
});
it('does not accept settled service completion with an unobserved storage result unless it declares incomplete observation', () => {
    const value = { ...initial, state: 'settled', result: 'ready', effects: [submitted] };
    expect(validSessionFact(value)).toBe(false); expect(validSessionFact({ ...value, incomplete: true })).toBe(true);
});
it('keeps ordinal identity dense, bounded and independent of caller-controlled array properties', () => {
    for (const ordinal of [0, -1, 17, NaN, 1.5]) expect(sessionEffectFact({ ...submitted, ordinal })).toBe(false);
    expect(validSessionFact({ ...initial, effects: [{ ...submitted, ordinal: 2 }] })).toBe(false);
    expect(validSessionFact({ ...initial, effects: new Array(1) })).toBe(false);
    expect(validSessionFact({ ...initial, effects: Object.assign([submitted], { private: true }) })).toBe(false);
    expect(validSessionFact({ ...initial, effects: Array.from({ length: 17 }, (_, i) => ({ ...submitted, ordinal: i + 1 })) })).toBe(false);
});
it('submission alone never claims accepted acknowledgement or canonical persistence', () => {
    for (const value of [{ ...submitted, acknowledgement: 'accepted' }, { ...submitted, observation: 'committed' },
        { ...submitted, effect: 'private' }, { ...settled, acknowledgement: 'not-submitted' }, { ...settled, observation: 'not-observed' }, { ...submitted, state: 'private' }]) expect(sessionEffectFact(value)).toBe(false);
});
it('an action cannot embed another family’s effect even if its fields are well formed', () => {
    expect(validSessionFact({ ...initial, action: 'revoke-all', effects: [settled] })).toBe(false);
    expect(validSessionFact({ ...initial, effects: [{ ...settled, effect: 'remove-vault' }] })).toBe(false);
});
it('merges monotonic native results without depending on property insertion order', () => {
    const before = { ...initial, effects: [submitted] }; const after = { ...initial, effects: [settled] };
    expect(mergeSessionFact(before, after)).toEqual(after); expect(Object.isFrozen(mergeSessionFact(before, after)?.effects)).toBe(true);
    expect(mergeSessionFact(after, { ...after, effects: [Object.fromEntries(Object.entries(settled).reverse()) as unknown as typeof settled] })).toBe(after);
});
it('a later result cannot rewrite an earlier settled effect or change its action, order or effect type', () => {
    const before = { ...initial, effects: [settled] };
    for (const after of [{ ...before, action: 'select' }, { ...before, effects: [] }, { ...before, effects: [submitted] },
        { ...before, effects: [{ ...settled, acknowledgement: 'unknown' }] }, { ...before, effects: [{ ...settled, effect: 'save-vault' }] }]) expect(mergeSessionFact(before, after as SessionFact)).toBeNull();
});
it('a pending effect can settle while another independent effect has already completed', () => {
    const before: SessionFact = { ...initial, effects: [submitted, { ...settled, ordinal: 2, effect: 'save-vault' }] };
    const after: SessionFact = { ...before, effects: [settled, before.effects[1]], state: 'settled', result: 'ready' };
    expect(mergeSessionFact(before, after)).toEqual(after);
});
it('terminal service results cannot receive new effects or be rewritten by later availability', () => {
    const before: SessionFact = { ...initial, state: 'settled', result: 'ready', effects: [settled] };
    expect(sessionFactTransition(before, { ...before, result: 'unavailable' })).toBe(false); expect(mergeSessionFact(before, before)).toBe(before);
});
it('incomplete capture is irreversible, including when the service later returns ready', () => {
    const before = { ...initial, incomplete: true }; expect(mergeSessionFact(before, initial)).toBeNull();
    expect(mergeSessionFact(before, { ...before, state: 'settled', result: 'ready' })).toMatchObject({ incomplete: true });
});
it('malformed facts never enter a merge and snapshotting cannot freeze or follow caller-owned arrays', () => {
    expect(mergeSessionFact(initial, { ...initial, effects: null } as never)).toBeNull(); expect(mergeSessionFact({} as never, initial)).toBeNull();
    const effects = [{ ...submitted }]; const source = { ...initial, effects }; const copy = deepFreezeSessionFact(source); effects.length = 0;
    expect(copy.effects).toHaveLength(1); expect(Object.isFrozen(source)).toBe(false); expect(() => deepFreezeSessionFact({ ...initial, action: 'private' } as never)).toThrow('invalid-session-observation');
});
it('different result, step count and observation facts are semantically distinct', () => {
    expect(sameSessionFact(initial, { ...initial, effects: [submitted] })).toBe(false);
    expect(sameSessionFact({ ...initial, effects: [settled] }, { ...initial, effects: [{ ...settled, observation: 'different' }] })).toBe(false);
});
