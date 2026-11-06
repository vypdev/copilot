import { expect, it } from 'vitest';
import { journalFact, operationTransition, type OperationFact } from '../../src/domain/journal_facts.ts';
import { decideJournal, JOURNAL_LIMITS, JOURNAL_TTL, validJournalCommand, validJournalSnapshot, type JournalSnapshot } from '../../src/domain/local_journal.ts';
import { append, committed, destination, helper, NOW, reviewed, saved, submitted } from '../fixtures/local_journal.ts';

it('reads a new empty history without writing scaffolding or claiming any recorded success', () => {
    const decision = decideJournal('diagnostics', undefined, { type: 'read', now: NOW });
    expect(decision).toEqual({ result: { state: 'ready', snapshot: { schemaVersion: 1, kind: 'diagnostics', epoch: 0,
        revision: 0, nextSequence: 1, lastTime: 0, entries: [] } } });
});
it('records only redacted intent and preserves independent acknowledgement and canonical observation', () => {
    const before = saved();
    const sent = decideJournal('diagnostics', before, { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted }).write!;
    const unknown: OperationFact = { ...submitted, phase: 'settled', observation: 'unchanged' };
    const result = decideJournal('diagnostics', sent, { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: unknown }).write!;
    expect(result.entries[0].fact).toEqual(unknown); expect(result.entries[0].at).toBe(NOW);
    expect(decideJournal('diagnostics', result, { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: committed }).write!.entries[0].fact).toEqual(committed);
    expect(before.entries[0].fact).toEqual(reviewed);
});
it('clears the exact reviewed revision and rejects both a late old append and update after restart', () => {
    const before = saved(); const result = decideJournal('diagnostics', before, { type: 'clear', now: NOW, epoch: 0, revision: 1 });
    expect(result.write).toMatchObject({ epoch: 1, revision: 2, nextSequence: 1, entries: [] });
    const restarted: unknown = JSON.parse(JSON.stringify(result.write));
    expect(decideJournal('diagnostics', restarted, append()).result.state).toBe('stale');
    expect(decideJournal('diagnostics', restarted, { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted }).result.state).toBe('stale');
    expect(decideJournal('diagnostics', restarted, append(reviewed, 1)).write!.entries[0].sequence).toBe(1);
});
it('does not clear records captured after the user reviewed an older revision', () => {
    const before = saved(); const later = decideJournal('diagnostics', before, append(helper)).write!;
    expect(decideJournal('diagnostics', later, { type: 'clear', now: NOW, epoch: 0, revision: 1 })).toEqual({ result: { state: 'stale' } });
    expect(later.entries).toHaveLength(2);
});
it('can explicitly clear an empty generation so already admitted old work still becomes stale', () => {
    const cleared = decideJournal('diagnostics', undefined, { type: 'clear', now: NOW, epoch: 0, revision: 0 }).write!;
    expect(cleared).toMatchObject({ epoch: 1, revision: 1, entries: [] });
    expect(decideJournal('diagnostics', cleared, append()).result.state).toBe('stale');
});
it.each(['diagnostics', 'recents'] as const)('bounds %s independently and evicts oldest sequences', kind => {
    let raw: JournalSnapshot | undefined;
    for (let i = 0; i <= JOURNAL_LIMITS[kind]; i++) raw = decideJournal(kind, raw, append(kind === 'recents' ? destination : helper)).write;
    expect(raw!.entries).toHaveLength(JOURNAL_LIMITS[kind]); expect(raw!.entries[0].sequence).toBe(2);
    expect(raw!.entries.at(-1)!.sequence).toBe(JOURNAL_LIMITS[kind] + 1);
});
it('expires records exactly at seven days during access without relying on enabled collection', () => {
    const before = saved();
    expect(decideJournal('diagnostics', before, { type: 'read', now: NOW + JOURNAL_TTL - 1 }).write).toBeUndefined();
    const expired = decideJournal('diagnostics', before, { type: 'read', now: NOW + JOURNAL_TTL });
    expect(expired.write).toMatchObject({ epoch: 0, revision: 2, entries: [] }); expect(before.entries).toHaveLength(1);
});
it('rejects an expired admitted append and an expired completion rather than resurrecting records', () => {
    expect(decideJournal('diagnostics', saved(), { ...append(), now: NOW + JOURNAL_TTL }).result.state).toBe('stale');
    expect(decideJournal('diagnostics', saved(), { type: 'update', epoch: 0, sequence: 1, fact: submitted, now: NOW + JOURNAL_TTL }).result.state).toBe('stale');
});
it('never invents freshness for a backwards clock or an admission in the future', () => {
    expect(decideJournal('diagnostics', saved(), { type: 'read', now: NOW - 1 })).toEqual({ result: { state: 'clock-invalid' } });
    expect(decideJournal('diagnostics', undefined, { ...append(), at: NOW + 1 }).result.state).toBe('stale');
});
it('accepts the exact lower time boundary but rejects unsafe clock values and counters', () => {
    expect(decideJournal('diagnostics', undefined, append(helper, 0, 0)).write!.lastTime).toBe(0);
    for (const now of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 'now', null]) {
        expect(validJournalCommand('diagnostics', { type: 'read', now })).toBe(false);
    }
});
it('preserves future and corrupt envelopes even for an explicit clear command', () => {
    for (const raw of [null, [], {}, { ...saved(), extra: 'private' }, { ...saved(), kind: 'recents' }]) {
        expect(decideJournal('diagnostics', raw, { type: 'clear', now: NOW, epoch: 0, revision: 1 })).toEqual({ result: { state: 'corrupt' } });
    }
    expect(decideJournal('diagnostics', { schemaVersion: 2, private: 'preserve' }, { type: 'clear', now: NOW, epoch: 0, revision: 0 })).toEqual({ result: { state: 'future' } });
});
it('contains hostile getters without copying their errors or replacing the stored document', () => {
    const raw = { get schemaVersion() { throw new Error('private-target'); } };
    expect(decideJournal('diagnostics', raw, { type: 'read', now: NOW })).toEqual({ result: { state: 'corrupt' } });
});
it('fails closed at revision or sequence exhaustion without wrapping identifiers', () => {
    for (const raw of [{ ...saved(), revision: Number.MAX_SAFE_INTEGER }, { ...saved(), nextSequence: Number.MAX_SAFE_INTEGER }]) {
        expect(decideJournal('diagnostics', raw, append(helper))).toEqual({ result: { state: 'exhausted' } });
    }
    expect(decideJournal('diagnostics', { ...saved(), epoch: Number.MAX_SAFE_INTEGER, revision: Number.MAX_SAFE_INTEGER },
        { type: 'clear', now: NOW, epoch: Number.MAX_SAFE_INTEGER, revision: Number.MAX_SAFE_INTEGER }).result.state).toBe('exhausted');
});
it('returns detached immutable records and never freezes mutable caller-owned facts', () => {
    const fact = { ...reviewed }; const result = decideJournal('diagnostics', undefined, append(fact));
    expect(Object.isFrozen(result.write)).toBe(true); expect(Object.isFrozen(result.write!.entries[0].fact)).toBe(true);
    expect(Object.isFrozen(fact)).toBe(false); fact.phase = 'cancelled'; expect(result.write!.entries[0].fact).toEqual(reviewed);
});
it('rejects a fact that changes while being inspected rather than persisting a private late replacement', () => {
    let inspected = 0;
    const command = { ...append(), get fact() { return ++inspected === 1 ? helper : { ...helper, rawError: 'private' }; } };
    expect(decideJournal('diagnostics', undefined, command)).toEqual({ result: { state: 'invalid' } });
});
it('detaches unchanged reads from native storage without changing revision or exposing mutable historical facts', () => {
    const raw = structuredClone(saved()); const result = decideJournal('diagnostics', raw, { type: 'read', now: NOW });
    expect(result.write).toBeUndefined(); expect(Object.isFrozen(raw)).toBe(false);
    expect(result.result).toMatchObject({ state: 'ready', snapshot: { revision: 1 } });
    if (!('snapshot' in result.result)) throw new Error('missing-snapshot');
    expect(result.result.snapshot).not.toBe(raw); expect(Object.isFrozen(result.result.snapshot.entries[0].fact)).toBe(true);
});
it('keeps an unrelated observed revision distinct from proof that the intended operation committed', () => {
    const unknown: OperationFact = { ...submitted, phase: 'settled', observation: 'unavailable' };
    const changed: OperationFact = { ...unknown, observation: 'changed' };
    const result = decideJournal('diagnostics', saved('diagnostics', unknown), { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: changed });
    expect(result.write!.entries[0].fact).toEqual(changed); expect(result.write!.entries[0].fact).not.toEqual(committed);
});
it('retains admission time for delayed writes and expires by that time rather than delivery order', () => {
    const recent = saved(); const late = decideJournal('diagnostics', recent, { ...append(helper), at: NOW - JOURNAL_TTL + 1 }).write!;
    expect(late.entries.map(entry => entry.sequence)).toEqual([1, 2]);
    const next = decideJournal('diagnostics', late, { type: 'read', now: NOW + 1 });
    expect(next.write!.entries.map(entry => entry.sequence)).toEqual([1]);
});
it('recognizes each closed settings operation without accepting prototype properties as actions', () => {
    for (const action of ['profile-create', 'profile-edit', 'profile-select', 'profile-deselect', 'profile-remove',
        'preferences', 'appearance', 'shortcuts', 'center-preferences', 'repository-preferences', 'import', 'rollback',
        'reset-global', 'reset-profiles', 'reset-appearance', 'reset-repository', 'reset-all']) {
        expect(journalFact('diagnostics', { ...reviewed, action })).toBe(true);
    }
    expect(journalFact('diagnostics', { ...reviewed, action: '__proto__' })).toBe(false);
    expect(journalFact('diagnostics', { ...reviewed, action: 'constructor' })).toBe(false);
});
it('ignores semantic duplicate updates regardless of object insertion order', () => {
    const fact: OperationFact = { observation: 'not-observed', acknowledgement: 'not-submitted', phase: 'reviewed', action: 'preferences', kind: 'operation' };
    const result = decideJournal('diagnostics', saved(), { type: 'update', now: NOW, epoch: 0, sequence: 1, fact });
    expect(result.result).toMatchObject({ state: 'unchanged', sequence: 1 }); expect(result.write).toBeUndefined();
});
it('a duplicate current update still removes other expired records from the returned snapshot', () => {
    const first = saved(); const later = decideJournal('diagnostics', first, { ...append(), at: NOW + 1, now: NOW + 1 }).write!;
    const result = decideJournal('diagnostics', later, { type: 'update', now: NOW + JOURNAL_TTL, epoch: 0, sequence: 2, fact: reviewed });
    expect(result.write!.entries.map(entry => entry.sequence)).toEqual([2]); expect(result.result.state).toBe('written');
});
it('does not rewrite a helper, a missing sequence, an unrelated action or a terminal completion', () => {
    expect(decideJournal('diagnostics', saved('diagnostics', helper), { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted }).result.state).toBe('invalid');
    expect(decideJournal('diagnostics', saved(), { type: 'update', now: NOW, epoch: 0, sequence: 2, fact: submitted }).result.state).toBe('stale');
    for (const [before, fact] of [[reviewed, { ...submitted, action: 'rollback' }], [reviewed, committed], [committed, { ...committed, observation: 'unavailable' }]] as const) {
        expect(decideJournal('diagnostics', saved('diagnostics', before), { type: 'update', now: NOW, epoch: 0, sequence: 1, fact }).result.state).toBe('invalid');
    }
});
it('accepts cancellation/block before submission and prohibits reopening those final facts', () => {
    for (const phase of ['cancelled', 'blocked'] as const) {
        const terminal = { ...reviewed, phase };
        expect(operationTransition(reviewed, terminal)).toBe(true); expect(operationTransition(terminal, submitted)).toBe(false);
        expect(journalFact('diagnostics', terminal)).toBe(true);
    }
});
it('preserves a known accepted acknowledgement when reconciling an unknown observation', () => {
    const accepted: OperationFact = { ...committed, observation: 'unavailable' };
    expect(operationTransition(accepted, { ...accepted, acknowledgement: 'unknown' })).toBe(false);
    expect(operationTransition(accepted, committed)).toBe(true);
    expect(operationTransition({ ...accepted, acknowledgement: 'unknown' }, committed)).toBe(true);
    expect(operationTransition(accepted, submitted)).toBe(false);
});
it('admits fixed center destinations and feature IDs without persisting arbitrary labels, paths or URLs', () => {
    expect(journalFact('recents', destination)).toBe(true);
    expect(journalFact('recents', { kind: 'destination', route: 'features', featureId: 'BEX-CENTER-01' })).toBe(true);
    for (const fact of [{ kind: 'destination', route: 'profiles', featureId: 'my-private-profile' }, { kind: 'destination', route: 'https://github.com/private/repo' },
        { kind: 'destination', route: 'features', featureId: 'unknown' }, { ...destination, target: 'private/repo' }, { ...destination, featureId: undefined }]) {
        expect(journalFact('recents', fact)).toBe(false);
    }
});
it('accepts only known helper IDs/codes and observations without raw errors', () => {
    expect(journalFact('diagnostics', helper)).toBe(true);
    expect(journalFact('diagnostics', { ...helper, helper: 'center-shortcuts', code: 'cleanup-failed', scope: 'retired-at-observation' })).toBe(true);
    for (const fact of [null, [], { ...helper, helper: 'private/repo' }, { ...helper, code: 'stack trace' }, { ...helper, scope: 'current' }, { ...helper, error: 'secret' }]) {
        expect(journalFact('diagnostics', fact)).toBe(false);
    }
});
it('enforces phase-specific acknowledgement and observation without treating submission as completion', () => {
    for (const fact of [reviewed, submitted, committed, { ...reviewed, action: 'connect-read' }, { ...reviewed, action: 'disconnect-read' }, { ...reviewed, action: 'rename-session' }]) {
        expect(journalFact('diagnostics', fact)).toBe(true);
    }
    for (const fact of [{ ...reviewed, action: 'arbitrary-write' }, { ...reviewed, phase: 'future' }, { ...reviewed, acknowledgement: 'accepted' },
        { ...submitted, observation: 'committed' }, { ...committed, acknowledgement: 'not-submitted' }, { ...committed, observation: 'not-observed' },
        { ...reviewed, token: 'secret' }, { ...reviewed, target: 'private' }, { ...reviewed, action: null }, { kind: 'unknown' }]) {
        expect(journalFact('diagnostics', fact)).toBe(false);
    }
    expect(journalFact('recents', helper)).toBe(false); expect(journalFact('diagnostics', destination)).toBe(false);
});
it('rejects extra authority, malformed command fields and updates to the recent-navigation store', () => {
    for (const command of [null, [], {}, { type: 'read', now: NOW, token: 'secret' }, { ...append(), epoch: -1 }, { ...append(), at: null },
        { ...append(), fact: { ...helper, raw: 'private' } }, { type: 'clear', now: NOW, epoch: 0, revision: -1 },
        { type: 'clear', now: NOW, epoch: 0, revision: 0, key: 'credential' },
        { type: 'update', now: NOW, epoch: 0, sequence: 0, fact: submitted }, { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: helper },
        { type: 'unknown', now: NOW, epoch: 0 }]) {
        expect(validJournalCommand('diagnostics', command)).toBe(false);
        expect(decideJournal('diagnostics', undefined, command as never).result.state).toBe('invalid');
    }
    expect(validJournalCommand('unknown', { type: 'read', now: NOW })).toBe(false);
    expect(validJournalCommand('recents', { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted })).toBe(false);
});
it('rejects corrupt metadata, sparse entries, duplicate/out-of-order IDs, foreign facts and future stored times', () => {
    const before = saved();
    const variants = [{ ...before, epoch: -1 }, { ...before, epoch: 2 }, { ...before, revision: -1 }, { ...before, nextSequence: 0 },
        { ...before, lastTime: -1 }, { ...before, entries: {} }, { ...before, entries: Array(1) },
        { ...before, entries: [...before.entries, before.entries[0]] }, { ...before, nextSequence: 1 },
        { ...before, entries: [{ ...before.entries[0], at: NOW + 1 }] }, { ...before, entries: [{ ...before.entries[0], raw: 'private' }] },
        { ...before, entries: [{ ...before.entries[0], fact: destination }] }, { ...before, entries: Array(201).fill(before.entries[0]) }];
    for (const variant of variants) expect(validJournalSnapshot('diagnostics', variant)).toBe(false);
});
