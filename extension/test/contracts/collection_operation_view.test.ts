import { expect, it } from 'vitest';
import { initialCollectionFact } from '../../src/domain/collection_fact.ts';
import { collectionCopy } from '../../src/domain/collection_copy.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';

const value = () => ({ state: 'current', operation: { family: 'collection', stage: 'reviewed', fact: initialCollectionFact('diagnostics', 'start', true),
    target: { location: { route: 'privacy' }, label: null }, sourceCurrent: true, firstObserved: 1, retention: 'untracked' } });
it('decodes a detached collection-family metadata reply and retired target independently from history availability', () => {
    const source = value(); const result = decodeCurrentOperation(source); expect(result).toEqual(source); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(source)).toBe(false);
    expect(decodeCurrentOperation({ ...source, operation: { ...source.operation, target: null, sourceCurrent: false } })).not.toBeNull();
});
it.each([{ family: 'private' }, { stage: 'running' }, { sourceCurrent: false }, { sourceCurrent: 1 }, { firstObserved: -1 },
    { retention: 'private' }, { target: { location: { route: 'privacy' }, label: '' } }, { nativeSelector: 'private' }, { fact: { secret: 'private' } }])('rejects inconsistent collection metadata %j as a whole', change => {
    const source = value(); expect(decodeCurrentOperation({ ...source, operation: { ...source.operation, ...change } })).toBeNull();
});
it.each(['en', 'es', 'fr', 'pt'])('provides a complete frozen %s resource for current and retained compound effects', locale => {
    const copy = collectionCopy(locale); expect(Object.keys(copy.actions)).toEqual(['start', 'stop']); expect(Object.keys(copy.states)).toEqual(['reviewed', 'running', 'cancelled', 'blocked', 'settled']);
    expect(Object.isFrozen(copy)).toBe(true); expect(Object.isFrozen(copy.preferencePhases)).toBe(true);
    for (const group of Object.values(copy)) for (const text of typeof group === 'string' ? [group] : Object.values(group)) expect(text.trim()).not.toBe('');
    if (locale !== 'en') expect(copy.description).not.toBe(collectionCopy('en').description);
});
it.each(['ru', 'constructor', '__proto__', 'toString'])('unsupported resource key %s falls back atomically without inheriting a prototype entry', locale => {
    expect(collectionCopy(locale)).toBe(collectionCopy('en'));
});
