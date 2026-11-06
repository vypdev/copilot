import { expect, it } from 'vitest';
import { apiCacheFact, apiCacheFactTransition, mergeApiCacheFact, nextStoredApiCache, type ApiCacheFact } from '../../src/domain/api_cache.ts';
import { journalFact, progressiveFact, progressiveTerminal, progressiveTransition } from '../../src/domain/journal_facts.ts';
import { mergeProgressiveFact, nextStoredProgress, sameJournalFact, snapshotJournalFact } from '../../src/domain/journal_progress.ts';
import { decideJournal } from '../../src/domain/local_journal.ts';
import { currentApiCacheOperation, decodeCurrentOperation } from '../../src/domain/current_operation.ts';

const fact = (state: ApiCacheFact['state']): ApiCacheFact => Object.freeze({ kind: 'cache-operation', action: 'clear-api-cache', state });
it('a cache observation cannot carry storage operands and coalesced completion still requires the persisted submitted transition', () => {
    const reviewed = fact('reviewed'); const submitted = fact('submitted'); const cleared = fact('cleared');
    expect(apiCacheFact({ ...reviewed, action: 'clear-all' })).toBe(false); expect(journalFact('diagnostics', reviewed)).toBe(true); expect(journalFact('recents', reviewed)).toBe(false);
    expect(progressiveFact(reviewed)).toBe(true); expect(progressiveTerminal(reviewed)).toBe(false); expect(progressiveTerminal(submitted)).toBe(false);
    for (const state of ['cleared', 'cancelled', 'blocked', 'unknown', 'not-applied'] as const) expect(progressiveTerminal(fact(state))).toBe(true);
    expect(mergeApiCacheFact(reviewed, reviewed)).toBe(reviewed); expect(sameJournalFact(reviewed, fact('reviewed'))).toBe(true); expect(sameJournalFact(reviewed, submitted)).toBe(false);
    for (const state of ['cleared', 'unknown', 'not-applied'] as const) {
        expect(mergeProgressiveFact(reviewed, fact(state))).toEqual(fact(state)); expect(nextStoredProgress(reviewed, fact(state))).toEqual(submitted);
        expect(apiCacheFactTransition(reviewed, fact(state))).toBe(false); expect(progressiveTransition(submitted, fact(state))).toBe(true);
    }
    expect(mergeApiCacheFact(submitted, cleared)).toEqual(cleared); expect(nextStoredApiCache(submitted, cleared)).toBe(cleared);
    expect(nextStoredApiCache(reviewed, fact('cancelled'))).toEqual(fact('cancelled'));
    expect(mergeApiCacheFact(cleared, fact('unknown'))).toBeNull(); expect(mergeApiCacheFact({ ...reviewed, secret: 'private' } as never, submitted)).toBeNull();
    expect(mergeApiCacheFact(reviewed, { ...submitted, secret: 'private' } as never)).toBeNull();
    expect(snapshotJournalFact('diagnostics', { ...reviewed, body: 'private' })).toBeNull();
    const initial = decideJournal('diagnostics', undefined, { type: 'append', epoch: 0, at: 1000, now: 1000, fact: reviewed }).write!;
    expect(decideJournal('diagnostics', initial, { type: 'update', epoch: 0, sequence: 1, now: 1000, fact: cleared }).result.state).toBe('invalid');
    const sent = decideJournal('diagnostics', initial, { type: 'update', epoch: 0, sequence: 1, now: 1000, fact: submitted }).write!;
    expect(decideJournal('diagnostics', sent, { type: 'update', epoch: 0, sequence: 1, now: 1000, fact: cleared }).write!.entries[0].fact).toEqual(cleared);
    expect(progressiveTransition(fact('cancelled'), fact('submitted'))).toBe(false);
});
it('current cache metadata is detached, scope-fixed and cannot claim an arbitrary target, inconsistent stage or private body', () => {
    const operation = { family: 'cache', stage: 'reviewed', fact: fact('reviewed'), target: { location: { route: 'privacy' }, label: null }, sourceCurrent: true, firstObserved: 1000, retention: 'untracked' };
    const reply = { state: 'current', operation }; const decoded = decodeCurrentOperation(reply);
    expect(decoded).toEqual(reply); expect(decoded).not.toBe(reply); expect(Object.isFrozen(decoded)).toBe(true);
    expect(currentApiCacheOperation({ ...operation, target: null, sourceCurrent: false })).toBe(true);
    for (const value of [{ ...operation, stage: 'cleared' }, { ...operation, fact: { ...fact('reviewed'), body: 'private' } }, { ...operation, firstObserved: -1 },
        { ...operation, sourceCurrent: 'true' }, { ...operation, sourceCurrent: false }, { ...operation, retention: 'future' },
        { ...operation, target: { location: { route: 'profiles', detail: 'private' }, label: null } }, { ...operation, target: { location: { route: 'privacy' }, label: 'private' } },
        { ...operation, family: 'settings' }, { ...operation, witness: {} }]) expect(currentApiCacheOperation(value)).toBe(false);
});
