import { expect, it } from 'vitest';
import { decideControlledJournal, validJournalAdmission } from '../../src/domain/controlled_journal.ts';
import { decideCollectionPolicy } from '../../src/domain/collection_policy.ts';
import { decideJournal } from '../../src/domain/local_journal.ts';
import { activeCollectionPolicy, collectionChange } from '../fixtures/collection_policy.ts';
import { append, destination, NOW, saved, submitted } from '../fixtures/local_journal.ts';

it('does not treat missing or paused policy as permission to retain a new observation', () => {
    expect(decideControlledJournal('diagnostics', undefined, undefined, append(), 0)).toEqual({ result: { state: 'collection-inactive' } });
});
it.each(['diagnostics', 'recents'] as const)('requires exact active %s policy before delegating bounded journal decisions', kind => {
    const result = decideControlledJournal(kind, undefined, activeCollectionPolicy(kind), append(kind === 'recents' ? destination : undefined), 1);
    expect(result.write).toMatchObject({ kind, epoch: 0, revision: 1 });
    expect(result.write!.entries).toHaveLength(1);
});
it('rejects a stale admission revision even when collection currently remains active', () => {
    expect(decideControlledJournal('diagnostics', undefined, activeCollectionPolicy(), append(), 0)).toEqual({ result: { state: 'stale' } });
});
it('fails capture closed when its policy cannot advance to a future durable stop', () => {
    const policy = { ...activeCollectionPolicy(), revision: Number.MAX_SAFE_INTEGER,
        receipt: { id: 'f'.repeat(32), beforeRevision: Number.MAX_SAFE_INTEGER - 1, settingsRevision: 1 } };
    expect(decideControlledJournal('diagnostics', undefined, policy, append(), Number.MAX_SAFE_INTEGER)).toEqual({ result: { state: 'exhausted' } });
});
it('a paused exact policy allows clear but active policy cannot authorize it', () => {
    const command = { type: 'clear', now: NOW, epoch: 0, revision: 1 } as const;
    expect(decideControlledJournal('diagnostics', saved(), undefined, command, 0).write).toMatchObject({ epoch: 1, entries: [] });
    expect(decideControlledJournal('diagnostics', saved(), activeCollectionPolicy(), command, 1)).toEqual({ result: { state: 'collection-active' } });
});
it('requires a new clear review when the paused policy revision changed', () => {
    const paused = decideCollectionPolicy('diagnostics', activeCollectionPolicy(), collectionChange('paused', 1, 'b'.repeat(32))).write!;
    expect(decideControlledJournal('diagnostics', saved(), paused, { type: 'clear', now: NOW, epoch: 0, revision: 1 }, 0)).toEqual({ result: { state: 'stale' } });
});
it('allows completion of an already admitted operation while collection is off', () => {
    const result = decideControlledJournal('diagnostics', saved(), undefined, { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted });
    expect(result.write!.entries[0].fact).toEqual(submitted); expect(result.write!.entries).toHaveLength(1);
});
it('preserves future/corrupt policy and does not apply an update through unknown consent', () => {
    for (const [raw, state] of [[{ schemaVersion: 2 }, 'future'], [null, 'corrupt']] as const) {
        expect(decideControlledJournal('diagnostics', saved(), raw, { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted }))
            .toEqual({ result: { state } });
    }
});
it('can read known redacted history while collection policy is unknown without echoing its payload', () => {
    const result = decideControlledJournal('diagnostics', saved(), { schemaVersion: 99, token: 'private' }, { type: 'read', now: NOW });
    expect(result.result).toMatchObject({ state: 'ready', snapshot: { revision: 1 } }); expect(JSON.stringify(result)).not.toContain('private');
});
it('does not let an active new policy bypass a cleared journal generation', () => {
    const cleared = decideJournal('diagnostics', saved(), { type: 'clear', now: NOW, epoch: 0, revision: 1 }).write!;
    expect(decideControlledJournal('diagnostics', cleared, activeCollectionPolicy(), append(), 1)).toEqual({ result: { state: 'stale' } });
});
it('keeps corrupt journal data inert even under a healthy collection policy', () => {
    expect(decideControlledJournal('diagnostics', null, activeCollectionPolicy(), append(), 1)).toEqual({ result: { state: 'corrupt' } });
});
it('rejects missing/unsafe append and clear policy revisions and extraneous read/update authority', () => {
    for (const revision of [undefined, -1, NaN, Infinity, '1']) {
        expect(validJournalAdmission('diagnostics', append(), revision)).toBe(false);
        expect(decideControlledJournal('diagnostics', undefined, undefined, append(), revision as never).result.state).toBe('invalid');
    }
    expect(validJournalAdmission('notes', append(), 1)).toBe(false);
    expect(validJournalAdmission('diagnostics', { type: 'read', now: NOW }, 0)).toBe(false);
    expect(validJournalAdmission('diagnostics', { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted }, 0)).toBe(false);
    expect(validJournalAdmission('diagnostics', { type: 'clear', now: NOW, epoch: 0, revision: 1 }, undefined)).toBe(false);
});
it('contains a hostile command getter without copying its exception or mutating history', () => {
    const command = { ...append(), get type() { throw new Error('private-target'); } };
    expect(decideControlledJournal('diagnostics', saved(), undefined, command as never)).toEqual({ result: { state: 'invalid' } });
});
it('does not use another collection policy as authority for a selected destination store', () => {
    expect(decideControlledJournal('recents', undefined, activeCollectionPolicy('diagnostics'), append(destination), 1)).toEqual({ result: { state: 'corrupt' } });
});
