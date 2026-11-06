import { expect, it } from 'vitest';
import { SESSION_EFFECTS, sessionEffectAllowed, validSessionFact, type SessionAction } from '../../src/domain/session_fact.ts';

it.each((['connect-role', 'disable-role'] as const).flatMap(action => SESSION_EFFECTS.map(effect => [action, effect] as const)))('%s can observe only its actual named-vault effect, rejecting %s when unrelated', (action, effect) => {
    const allowed = effect === 'save-vault'; expect(sessionEffectAllowed(action, effect)).toBe(allowed);
    const fact = { kind: 'session-operation', action, state: 'settled', result: 'ready', incomplete: false,
        effects: [{ ordinal: 1, effect, state: 'settled', acknowledgement: 'accepted', observation: 'committed' }] };
    expect(validSessionFact(fact)).toBe(allowed);
});
it.each(['connect-role', 'disable-role'] satisfies SessionAction[])('a running %s operation has no fabricated active-read effects before native submission', action => {
    expect(validSessionFact({ kind: 'session-operation', action, state: 'running', result: 'pending', effects: [], incomplete: false })).toBe(true);
});
