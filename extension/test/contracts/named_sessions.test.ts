import { expect, it } from 'vitest';
import { connectionIntent, connectionsView, decodeConnections, sessionName, validVault } from '../../src/domain/named_sessions.ts';
import { connectionCopy } from '../../src/domain/connection_copy.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
const entry = { id: 'work', name: '<Work>', host: 'github.com', role: 'repository-read', connection: { ...CONNECTED, schemaVersion: 1 as const } } as const;
const vault = { schemaVersion: 1, revision: 3, selected: 'work', entries: [entry] } as const;
it('separates validated protected vault records from immutable nonsecret center replies', () => {
    expect(validVault(vault)).toBe(true); const view = connectionsView(vault, true);
    expect(view.entries[0]).toMatchObject({ name: '<Work>', viewerId: '1', repositoryId: '7' });
    expect(JSON.stringify(view)).not.toContain(CONNECTED.secret); expect(Object.isFrozen(view.entries[0])).toBe(true);
    expect(decodeConnections(view)).toEqual(view);
    const current = connectionsView(vault, true, 4); expect(decodeConnections(current)).toEqual(current);
    for (const credentialEpoch of [-1, '4', undefined]) expect(decodeConnections({ ...current, credentialEpoch })).toBeNull();
    expect(decodeConnections({ ...view, secret: CONNECTED.secret })).toBeNull();
    expect(decodeConnections({ ...view, entries: [{ ...view.entries[0], secret: CONNECTED.secret }] })).toBeNull();
});
it('rejects cross-purpose, cross-host, duplicate, sparse, oversized and malformed session vaults', () => {
    for (const value of [null, {}, { ...vault, schemaVersion: 2 }, { ...vault, revision: -1 }, { ...vault, selected: 'missing' },
        { ...vault, entries: Array(1) }, { ...vault, entries: [entry, entry] }, { ...vault, entries: Array(6).fill(entry) },
        ...[{ host: 'evil.test' }, { role: 'write' }, { name: ' Work' }, { id: 'Bad' }, { secret: CONNECTED.secret }, { connection: { ...CONNECTED, viewerId: '0' } }]
            .map(change => ({ ...vault, entries: [{ ...entry, ...change }] })),
        { ...vault, entries: [entry, { ...entry, id: 'second', name: '<work>' }] }]) expect(validVault(value)).toBe(false);
    expect(validVault({ ...vault, selected: null })).toBe(true);
    for (const value of ['', ' ', 'a'.repeat(65), 'x\n', 'x\u202e', null]) expect(sessionName(value)).toBe(false);
    expect(sessionName('Trabajo — équipe')).toBe(true);
});
it('admits only exact connect, select, removal and disconnect intents without executable or role fields', () => {
    for (const value of [CONNECTION_INPUT, { type: 'select', id: 'work' }, { type: 'remove', id: 'work' }, { type: 'disconnect' }, { type: 'revoke-all' }]) expect(connectionIntent(value)).toBe(true);
    for (const value of [null, {}, { ...CONNECTION_INPUT, role: 'write' }, { ...CONNECTION_INPUT, repository: 'https://evil.test/x' },
        { ...CONNECTION_INPUT, repository: 'a'.repeat(201) + '/x' }, { ...CONNECTION_INPUT, secret: 'short' },
        { type: 'disconnect', id: 'work' }, { type: 'select', id: 'Bad' }, { type: 'remove' }]) expect(connectionIntent(value)).toBe(false);
});
it('rejects malformed or private connection replies and keeps complete four-locale operation guidance', () => {
    const view = connectionsView(vault, true);
    for (const value of [null, {}, { state: 'unknown', private: 'raw' }, { ...view, connected: 1 }, { ...view, connected: true, selected: null },
        { ...view, revision: -1 }, { ...view, entries: Array(1) }, { ...view, entries: [{ ...view.entries[0], repositoryId: '0' }] }]) expect(decodeConnections(value)).toBeNull();
    for (const state of ['invalid', 'capacity', 'conflict', 'stale', 'unavailable', 'denied', 'unknown', 'limited', 'cooldown', 'budget']) expect(decodeConnections({ state })).toEqual({ state });
    const english = connectionCopy('en');
    for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
        const copy = connectionCopy(locale); expect(Object.keys(copy)).toEqual(Object.keys(english));
        expect(Object.keys(copy.outcomes)).toEqual(Object.keys(english.outcomes)); expect(Object.isFrozen(copy.outcomes)).toBe(true);
        expect(Object.values(copy).every(value => typeof value === 'object' || value.length > 0)).toBe(true);
    }
});
