import { expect, it } from 'vitest';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import { sessionCopy } from '../../src/domain/session_copy.ts';
import { SESSION_ACTIONS, SESSION_EFFECTS, SESSION_RESULTS } from '../../src/domain/session_fact.ts';

const fact = { kind: 'session-operation', action: 'connect', state: 'running', result: 'pending', effects: [], incomplete: false } as const;
const operation = { family: 'sessions', stage: 'running', fact, target: { location: { route: 'connections' }, label: 'Private session' },
    sourceCurrent: true, firstObserved: 12, retention: 'untracked' } as const;
const reply = (value: unknown) => ({ state: 'current', operation: value });
it('decodes the closed session family as a detached immutable current view without freezing its sender', () => {
    const source = structuredClone(reply(operation)); const decoded = decodeCurrentOperation(source);
    expect(decoded).toEqual(source); expect(Object.isFrozen(decoded)).toBe(true); expect(Object.isFrozen(source)).toBe(false);
    expect(decodeCurrentOperation(reply({ ...operation, target: null, sourceCurrent: false }))).not.toBeNull();
});
it.each([
    { family: 'private' }, { stage: 'settled' }, { sourceCurrent: false }, { sourceCurrent: 1 }, { firstObserved: -1 },
    { retention: 'private' }, { target: { location: { route: 'connections' }, label: '' } }, { nativeSelector: 'private' },
    { fact: { ...fact, secret: 'private' } }, { fact: { ...fact, result: 'ready' } },
])('rejects an inconsistent or private session view %j atomically', change => {
    expect(decodeCurrentOperation(reply({ ...operation, ...change }))).toBeNull();
});
it('terminal metadata requires the observed terminal state and preserves independent retention', () => {
    const settled = { ...operation, stage: 'settled', fact: { ...fact, state: 'settled', result: 'unknown' }, retention: 'unknown' };
    expect(decodeCurrentOperation(reply(settled))).toEqual(reply(settled));
    expect(decodeCurrentOperation(reply({ ...settled, stage: 'running' }))).toBeNull();
});
it.each(['en', 'es', 'fr', 'pt'])('provides complete frozen %s session content for every native fact', locale => {
    const copy = sessionCopy(locale); expect(Object.isFrozen(copy)).toBe(true); expect(Object.isFrozen(copy.effects)).toBe(true);
    expect(Object.keys(copy.actions)).toEqual(SESSION_ACTIONS); expect(Object.keys(copy.effects)).toEqual(SESSION_EFFECTS);
    expect(Object.keys(copy.results)).toEqual(['pending', ...SESSION_RESULTS]);
    for (const group of Object.values(copy)) for (const value of typeof group === 'string' ? [group] : Object.values(group)) expect(value.trim()).not.toBe('');
    if (locale !== 'en') expect(copy.description).not.toBe(sessionCopy('en').description);
});
it.each(['ru', 'constructor', '__proto__', 'toString'])('uses atomic English fallback for unsupported own-resource key %s', locale => {
    expect(sessionCopy(locale)).toBe(sessionCopy('en'));
});
