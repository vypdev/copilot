import { expect, it } from 'vitest';
import { initialClearFact, validClearFact, freezeClearFact, mergeClearFact, sameClearFact } from '../../src/domain/clear_fact.ts';
import { journalFact, progressiveTransition, progressiveTerminal } from '../../src/domain/journal_facts.ts';
import { snapshotJournalFact, mergeProgressiveFact, sameJournalFact, nextStoredProgress } from '../../src/domain/journal_progress.ts';
import { CLEAR_ISSUES, clearIssue } from '../../src/domain/clear_operation.ts';
import { clearRunning, clearSubmitted, clearSettled } from '../fixtures/clear_fact.ts';

it.each(['diagnostics', 'recents'] as const)('a %s clear preview retains closed intent without native selectors', kind => {
    const fact = initialClearFact(kind); expect(validClearFact(fact)).toBe(true); expect(Object.isFrozen(fact)).toBe(true);
    expect(fact).toMatchObject({ submitted: false, sourceCurrentAtObservation: null, acknowledgement: 'not-observed' });
    expect(JSON.stringify(fact)).not.toMatch(/operationId|epoch|revision|owner|credential|secret/);
});
it.each([
    ['unknown family', { kind: 'private' }], ['unknown action', { action: 'reset-all' }], ['private collection', { collection: 'private' }],
    ['unknown lifecycle', { state: 'private' }], ['private extra field', { secret: 'private' }], ['missing observation', { observation: undefined }],
    ['nonboolean submission', { submitted: 1 }], ['nonboolean incomplete', { incomplete: 'yes' }], ['unknown acknowledgement', { acknowledgement: 'private' }],
    ['unknown read', { observation: 'private' }], ['unknown no-write reason', { notAppliedReason: 'private' }], ['unknown source', { sourceCurrentAtObservation: 'yes' }],
] as const)('rejects %s at the closed persistence boundary', (_label, patch) => {
    expect(validClearFact({ ...initialClearFact('diagnostics'), ...patch })).toBe(false);
});
it('nonobjects and incomplete records cannot enter durable clear history', () => {
    for (const value of [null, [], {}, 'clear']) expect(validClearFact(value)).toBe(false);
    const { result: _result, ...missing } = initialClearFact('diagnostics'); expect(validClearFact(missing)).toBe(false);
});
it('a preview cannot claim an attempt, returned acknowledgement or retrospective source state', () => {
    for (const patch of [{ submitted: true }, { acknowledgement: 'accepted', incomplete: true }, { observation: 'cleared' },
        { sourceCurrentAtObservation: false }, { notAppliedReason: 'aborted' }]) expect(validClearFact({ ...initialClearFact('diagnostics'), ...patch })).toBe(false);
});
it('a running attempt cannot fabricate a canonical read or erase the missing-acknowledgement disclosure', () => {
    expect(validClearFact({ ...clearSubmitted(), acknowledgement: 'not-observed' })).toBe(false);
    expect(validClearFact({ ...clearRunning(), acknowledgement: 'accepted' })).toBe(false);
    expect(validClearFact({ ...clearRunning(), acknowledgement: 'accepted', incomplete: true })).toBe(true);
    for (const patch of [{ result: 'unknown' }, { observation: 'cleared' }, { notAppliedReason: 'aborted' }, { sourceCurrentAtObservation: true }]) expect(validClearFact({ ...clearSubmitted(), ...patch })).toBe(false);
});
it('observed empty state accepts lost acknowledgements without promoting them to accepted proof', () => {
    expect(validClearFact({ ...clearSettled(), acknowledgement: 'unknown', sourceCurrentAtObservation: false })).toBe(true);
    expect(validClearFact({ ...clearSettled(), acknowledgement: 'not-applied' })).toBe(false);
    expect(validClearFact({ ...clearSettled(), sourceCurrentAtObservation: null })).toBe(false);
    expect(validClearFact({ ...clearSettled(), observation: 'changed' })).toBe(false);
});
it('an uncertain read preserves changed versus unavailable without claiming an empty generation', () => {
    for (const observation of ['changed', 'unavailable'] as const) expect(validClearFact({ ...clearSettled(), result: 'unknown', observation })).toBe(true);
    expect(validClearFact({ ...clearSettled(), result: 'unknown' })).toBe(false);
});
it.each(['not-started', 'aborted'] as const)('an explicit %s response needs independent no-write acknowledgement and observation', notAppliedReason => {
    const fact = { ...clearSubmitted(), state: 'settled', result: 'not-applied', acknowledgement: 'not-applied', observation: 'not-applied', notAppliedReason };
    expect(validClearFact(fact)).toBe(true); expect(validClearFact({ ...fact, notAppliedReason: null })).toBe(false);
    expect(validClearFact({ ...fact, sourceCurrentAtObservation: false })).toBe(false); expect(validClearFact({ ...fact, acknowledgement: 'accepted' })).toBe(false);
});
it('a service issue distinguishes preflight rejection from an attempted command', () => {
    for (const result of CLEAR_ISSUES) {
        expect(clearIssue(result)).toBe(true); expect(validClearFact({ ...clearRunning(), state: 'settled', result })).toBe(true);
        expect(validClearFact({ ...clearSubmitted(), state: 'settled', result, observation: 'unavailable' })).toBe(true);
    }
    expect(clearIssue('private')).toBe(false); expect(validClearFact({ ...clearRunning(), state: 'settled', result: 'private' })).toBe(false);
    expect(validClearFact({ ...clearSubmitted(), state: 'settled', result: 'stale', observation: 'cleared' })).toBe(false);
});
it.each(['cancelled', 'blocked'] as const)('a %s review remains unsubmitted and terminal', state => {
    const fact = { ...initialClearFact('diagnostics'), state, result: state }; expect(validClearFact(fact)).toBe(true);
    expect(mergeClearFact(fact, clearRunning())).toBeNull(); expect(mergeClearFact(fact, fact)).toBe(fact);
    expect(progressiveTerminal(fact)).toBe(true);
});
it('confirmation, actual submission and terminal observation can advance monotonically', () => {
    expect(mergeClearFact(initialClearFact('diagnostics'), clearRunning())).toEqual(clearRunning());
    expect(mergeClearFact(clearRunning(), clearSubmitted())).toEqual(clearSubmitted()); expect(mergeClearFact(clearSubmitted(), clearSettled())).toEqual(clearSettled());
    expect(progressiveTransition(clearSubmitted(), clearSettled())).toBe(true);
});
it('a running operation cannot regress to a review, cancellation or a different collection', () => {
    for (const after of [initialClearFact('diagnostics'), { ...initialClearFact('diagnostics'), state: 'cancelled', result: 'cancelled' } as const,
        { ...clearRunning(), collection: 'recents' } as const]) expect(mergeClearFact(clearRunning(), after)).toBeNull();
    expect(mergeClearFact(clearSubmitted(), clearRunning())).toBeNull();
});
it('an accepted acknowledgement and incomplete disclosure cannot be weakened by later availability', () => {
    const before = { ...clearSubmitted(), acknowledgement: 'accepted' as const, incomplete: true };
    expect(mergeClearFact(before, { ...before, acknowledgement: 'unknown' })).toBeNull();
    expect(mergeClearFact(before, { ...before, incomplete: false })).toBeNull();
});
it('a settled result cannot be rewritten even when another available read differs', () => {
    const before = clearSettled(); expect(mergeClearFact(before, { ...before, sourceCurrentAtObservation: false })).toBeNull();
    expect(mergeClearFact(before, clearRunning())).toBeNull(); expect(progressiveTerminal(before)).toBe(true); expect(progressiveTerminal(clearRunning())).toBe(false);
});
it('snapshot ownership detaches the caller and semantic replay preserves identity regardless of property order', () => {
    const original = { ...clearSettled() }; const copy = freezeClearFact(original); original.sourceCurrentAtObservation = false;
    expect(copy.sourceCurrentAtObservation).toBe(true); expect(Object.isFrozen(copy)).toBe(true); expect(Object.isFrozen(original)).toBe(false);
    const reordered = Object.fromEntries(Object.entries(copy).reverse()) as unknown as typeof copy;
    expect(sameClearFact(copy, reordered)).toBe(true); expect(mergeClearFact(copy, reordered)).toBe(copy);
    expect(() => freezeClearFact({ ...copy, secret: 'private' } as never)).toThrow('invalid-clear-observation');
    expect(mergeClearFact({} as never, copy)).toBeNull(); expect(mergeClearFact(copy, {} as never)).toBeNull();
});
it('clear facts are diagnostics only and retain exact validated transitions through the shared journal', () => {
    const reviewed = initialClearFact('recents'); const final = { ...clearSettled(), collection: 'recents' as const };
    expect(journalFact('diagnostics', reviewed)).toBe(true); expect(journalFact('recents', reviewed)).toBe(false);
    expect(snapshotJournalFact('diagnostics', final)).toEqual(final); expect(snapshotJournalFact('recents', final)).toBeNull();
    expect(sameJournalFact(final, { ...final })).toBe(true); expect(mergeProgressiveFact(reviewed, final)).toEqual(final);
    expect(nextStoredProgress(reviewed, final)).toBe(final); expect(mergeProgressiveFact(reviewed, { kind: 'operation' } as never)).toBeNull();
});
