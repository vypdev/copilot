import { expect, it } from 'vitest';
import { decideCollectionPolicy, loadCollectionPolicy, validCollectionPolicy, validCollectionPolicyCommand,
    type CollectionPolicy, type CollectionPolicyCommand } from '../../src/domain/collection_policy.ts';

const id = 'a'.repeat(32); const other = 'b'.repeat(32);
const enable = (expectedRevision = 0, operationId = id): Extract<CollectionPolicyCommand, { type: 'set' }> =>
    ({ type: 'set', expectedRevision, mode: 'active', operationId, settingsRevision: 1 });
const active = (): CollectionPolicy => decideCollectionPolicy('diagnostics', undefined, enable()).write!;

it.each(['diagnostics', 'recents'] as const)('missing %s policy means paused consent without a write', kind => {
    const result = decideCollectionPolicy(kind, undefined, { type: 'read' });
    expect(result).toEqual({ result: { state: 'ready', policy: { schemaVersion: 1, kind, revision: 0, mode: 'paused', receipt: null } } });
});
it('creates only a tentative active policy with a receipt for the reviewed preference context', () => {
    const result = decideCollectionPolicy('diagnostics', undefined, enable());
    expect(result.write).toEqual({ schemaVersion: 1, kind: 'diagnostics', revision: 1, mode: 'active', receipt: { id, beforeRevision: 0, settingsRevision: 1 } });
    expect(result.result.state).toBe('written');
});
it('persists an explicit pause even if the prior missing policy was already paused', () => {
    const result = decideCollectionPolicy('diagnostics', undefined, { ...enable(), mode: 'paused' });
    expect(result.write).toMatchObject({ revision: 1, mode: 'paused', receipt: { id, beforeRevision: 0 } });
});
it('pauses a known active policy while keeping the saved settings revision a separate historical fact', () => {
    const result = decideCollectionPolicy('diagnostics', active(), { ...enable(1, other), mode: 'paused', settingsRevision: 2 });
    expect(result.write).toMatchObject({ revision: 2, mode: 'paused', receipt: { id: other, beforeRevision: 1, settingsRevision: 2 } });
});
it('replays the exact observed receipt without another write or live authority claim', () => {
    const before = active(); expect(decideCollectionPolicy('diagnostics', before, enable())).toEqual({ result: { state: 'replayed', policy: before } });
    expect(decideCollectionPolicy('diagnostics', before, enable()).write).toBeUndefined();
});
it('rejects reusing a receipt for another revision, mode or preference context', () => {
    for (const command of [enable(1), { ...enable(), mode: 'paused' as const }, { ...enable(), settingsRevision: 2 }]) {
        expect(decideCollectionPolicy('diagnostics', active(), command)).toEqual({ result: { state: 'invalid' } });
    }
});
it('a different operation conflicts with a moved revision instead of replaying or overwriting it', () => {
    expect(decideCollectionPolicy('diagnostics', active(), enable(0, other))).toEqual({ result: { state: 'conflict' } });
});
it('does not wrap an exhausted counter, including when the requested mode is already active', () => {
    const before = { ...active(), revision: Number.MAX_SAFE_INTEGER, receipt: { id, beforeRevision: Number.MAX_SAFE_INTEGER - 1, settingsRevision: 1 } };
    expect(decideCollectionPolicy('diagnostics', before, enable(Number.MAX_SAFE_INTEGER, other))).toEqual({ result: { state: 'exhausted' } });
});
it('preserves future policy as unavailable for both reads and explicit set attempts', () => {
    const raw = { schemaVersion: 2, unknown: 'preserve' };
    expect(loadCollectionPolicy('diagnostics', raw)).toEqual({ state: 'future' });
    expect(decideCollectionPolicy('diagnostics', raw, enable())).toEqual({ result: { state: 'future' } });
});
it('contains corrupt private payloads without copying or replacing them', () => {
    for (const raw of [null, [], {}, { ...active(), token: 'secret' }, { ...active(), kind: 'recents' }, { ...active(), mode: 'remote' }]) {
        expect(loadCollectionPolicy('diagnostics', raw)).toEqual({ state: 'corrupt' });
        expect(decideCollectionPolicy('diagnostics', raw, enable())).toEqual({ result: { state: 'corrupt' } });
    }
});
it('freezes detached snapshots without mutating or retaining the caller-owned raw policy', () => {
    const raw = structuredClone(active()); const result = loadCollectionPolicy('diagnostics', raw);
    expect(result.state).toBe('ready'); if (result.state !== 'ready') throw new Error('missing-policy');
    expect(Object.isFrozen(raw)).toBe(false); expect(Object.isFrozen(result.policy.receipt)).toBe(true);
    Object.assign(raw, { mode: 'paused' }); expect(result.policy.mode).toBe('active');
});
it('accepts only exact initial and receipt-bearing policy shapes', () => {
    const empty = { schemaVersion: 1, kind: 'diagnostics', revision: 0, mode: 'paused', receipt: null };
    expect(validCollectionPolicy('diagnostics', empty)).toBe(true); expect(validCollectionPolicy('diagnostics', active())).toBe(true);
    for (const raw of [{ ...empty, mode: 'active' }, { ...empty, receipt: active().receipt }, { ...active(), receipt: null },
        { ...active(), revision: -1 }, { ...active(), receipt: { ...active().receipt, id: 'private-owner/repo' } },
        { ...active(), receipt: { ...active().receipt, beforeRevision: -1 } }, { ...active(), receipt: { ...active().receipt, beforeRevision: 1 } },
        { ...active(), receipt: { ...active().receipt, settingsRevision: -1 } }, { ...active(), receipt: { ...active().receipt, token: 'secret' } },
        { ...active(), receipt: { id, beforeRevision: 0 } }]) expect(validCollectionPolicy('diagnostics', raw)).toBe(false);
});
it('rejects invalid scopes/expanded commands and unsafe receipt inputs before any decision', () => {
    for (const command of [null, [], {}, { type: 'read', key: 'credential' }, { ...enable(), expectedRevision: -1 },
        { ...enable(), settingsRevision: Infinity }, { ...enable(), operationId: 'A'.repeat(32) }, { ...enable(), mode: 'remote' },
        { ...enable(), url: 'https://github.com/private' }, { type: 'future' }]) {
        expect(validCollectionPolicyCommand('diagnostics', command)).toBe(false);
        expect(decideCollectionPolicy('diagnostics', undefined, command as never)).toEqual({ result: { state: 'invalid' } });
    }
    expect(validCollectionPolicyCommand('other', { type: 'read' })).toBe(false);
});
it('does not copy a policy whose value changes during native snapshot decoding', () => {
    let reads = 0; const raw = { ...active(), get mode() { return ++reads === 1 ? 'active' : 'secret'; } };
    expect(loadCollectionPolicy('diagnostics', raw)).toEqual({ state: 'corrupt' });
});
it('contains getters that throw during command or stored-policy inspection without a raw error', () => {
    expect(loadCollectionPolicy('diagnostics', { get schemaVersion() { throw new Error('private'); } })).toEqual({ state: 'corrupt' });
    expect(decideCollectionPolicy('diagnostics', undefined, { get type() { throw new Error('private'); } } as never)).toEqual({ result: { state: 'invalid' } });
});
it('rejects a command fact replaced between validation and constructing its next policy', () => {
    let reads = 0; const command = { ...enable(), get mode() { return ++reads === 1 ? 'active' : 'private'; } };
    expect(decideCollectionPolicy('diagnostics', undefined, command as never)).toEqual({ result: { state: 'invalid' } });
});
