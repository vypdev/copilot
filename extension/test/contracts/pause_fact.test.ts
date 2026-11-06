import { expect, it } from 'vitest';
import { mergePauseFact, freezePauseFact, pauseAction, pauseFactTransition, samePauseFact, validPauseFact } from '../../src/domain/pause_fact.ts';
import { journalFact, progressiveFact, progressiveTerminal, progressiveTransition } from '../../src/domain/journal_facts.ts';
import { mergeProgressiveFact, sameJournalFact, snapshotJournalFact, nextStoredProgress } from '../../src/domain/journal_progress.ts';
import { pauseAdopted, pauseReviewed, pauseRunning, pauseSettled, pauseSubmitted } from '../fixtures/pause_fact.ts';

it.each([
    [{ type: 'emergency', paused: true }, 'pause-emergency'], [{ type: 'emergency', paused: false }, 'resume-emergency'],
    [{ type: 'tab', tabId: 7, paused: true }, 'pause-tab'], [{ type: 'tab', tabId: 7, paused: false }, 'resume-tab'],
    [{ type: 'adopt-observed' }, 'adopt-pauses'], [null, null], [{ type: 'tab', tabId: -1, paused: true }, null],
] as const)('projects only the action, never the target, from %j', (intent, action) => { expect(pauseAction(intent)).toBe(action); });
it('closed reviewed, running, cancelled, native-completed and adoption facts have independent fields', () => {
    for (const value of [pauseReviewed(), pauseRunning(), pauseSubmitted(), pauseSettled(), pauseAdopted(), { ...pauseReviewed(), state: 'cancelled', result: 'cancelled' }]) {
        expect(validPauseFact(value)).toBe(true); expect(journalFact('diagnostics', value)).toBe(true); expect(journalFact('recents', value)).toBe(false);
    }
    expect(progressiveFact(pauseReviewed())).toBe(true); expect(progressiveTerminal(pauseSettled())).toBe(true); expect(progressiveTerminal(pauseRunning())).toBe(false);
});
it.each([
    { kind: 'foreign' }, { action: 'foreign' }, { state: 'foreign' }, { submitted: 'true' }, { result: 'foreign' }, { acknowledgement: 'foreign' },
    { observation: 'foreign' }, { sourceCurrentAtObservation: 'true' }, { incomplete: 'true' }, { tabId: 7 }, { operationId: 'private' },
    { source: 'https://github.com/private/repo' }, { acknowledgement: 'accepted' }, { observation: 'committed' }, { submitted: true }, { incomplete: true },
] as const)('rejects malformed or private reviewed fields %j', patch => { expect(validPauseFact({ ...pauseReviewed(), ...patch })).toBe(false); });
it('missing fields and primitive payloads are not a partial default', () => {
    expect(validPauseFact(null)).toBe(false); const { incomplete: _value, ...rest } = pauseReviewed(); expect(validPauseFact(rest)).toBe(false);
    expect(snapshotJournalFact('diagnostics', { ...pauseSettled(), private: 'omit' })).toBeNull();
});
it('a running acknowledgement may precede canonical readback but cannot fabricate an adopted state', () => {
    expect(validPauseFact({ ...pauseSubmitted(), acknowledgement: 'accepted' })).toBe(true);
    expect(validPauseFact({ ...pauseRunning(), acknowledgement: 'accepted', incomplete: true })).toBe(true);
    for (const patch of [{ observation: 'adopted' }, { acknowledgement: 'not-observed', submitted: true }, { sourceCurrentAtObservation: true }, { result: 'committed' }]) expect(validPauseFact({ ...pauseRunning(), ...patch })).toBe(false);
});
it('a proved canonical record may coexist with a later lost primary result without inventing a new acknowledgement', () => {
    const fact = { ...pauseSettled(), result: 'unknown' as const }; expect(validPauseFact(fact)).toBe(true);
    expect(validPauseFact({ ...fact, sourceCurrentAtObservation: null })).toBe(false); expect(validPauseFact({ ...fact, observation: 'adopted' })).toBe(false);
    expect(validPauseFact({ ...fact, submitted: false })).toBe(false); expect(validPauseFact({ ...fact, submitted: false, incomplete: true })).toBe(true);
});
it('adoption cannot claim a native submission, acknowledgement or canonical write', () => {
    const adopted = pauseAdopted(); for (const patch of [{ submitted: true }, { acknowledgement: 'accepted' }, { observation: 'committed' }, { sourceCurrentAtObservation: null }, { action: 'pause-tab' }]) expect(validPauseFact({ ...adopted, ...patch })).toBe(false);
    expect(validPauseFact({ ...pauseSettled(), observation: 'different' })).toBe(false);
});
it('pre-attempt issues have no sampled source; incomplete attempted issues retain proved native facts', () => {
    expect(validPauseFact({ ...pauseRunning(), state: 'settled', result: 'conflict' })).toBe(true);
    const partial = { ...pauseSettled(), result: 'unavailable', sourceCurrentAtObservation: null, incomplete: true };
    expect(validPauseFact(partial)).toBe(true); expect(validPauseFact({ ...partial, incomplete: false })).toBe(false);
    expect(validPauseFact({ ...partial, observation: 'adopted' })).toBe(false); expect(validPauseFact({ ...partial, acknowledgement: 'not-observed' })).toBe(false);
    expect(validPauseFact({ ...pauseRunning(), state: 'settled', result: 'pending' })).toBe(false);
});
it('terminal facts cannot be rewritten, revived, assigned to another action or lose accepted proof', () => {
    const reviewed = pauseReviewed(); const running = pauseRunning(); const done = pauseSettled();
    expect(pauseFactTransition(reviewed, running)).toBe(true); expect(progressiveTransition(running, done)).toBe(true);
    expect(mergePauseFact(reviewed, running)).toEqual(running); expect(Object.isFrozen(mergePauseFact(reviewed, running))).toBe(true);
    for (const [before, after] of [[done, reviewed], [done, { ...done, result: 'unknown' }], [running, { ...running, action: 'pause-tab' }],
        [{ ...running, acknowledgement: 'accepted' }, { ...pauseSubmitted(), acknowledgement: 'unknown' }],
        [{ ...pauseSubmitted(), observation: 'committed' }, { ...pauseSubmitted(), observation: 'unavailable' }]]) expect(mergePauseFact(before as typeof done, after as typeof done)).toBeNull();
    expect(mergePauseFact({ ...reviewed, state: 'invalid' } as never, running)).toBeNull(); expect(mergePauseFact(reviewed, { ...running, result: 'invalid' } as never)).toBeNull();
});
it('semantic equality and journal progress ignore property insertion order without adding an extra native phase', () => {
    const fact = pauseSettled(); const reordered = Object.fromEntries(Object.entries(fact).reverse()) as unknown as typeof fact;
    expect(samePauseFact(fact, reordered)).toBe(true); expect(sameJournalFact(fact, reordered)).toBe(true); expect(mergePauseFact(fact, reordered)).toBe(fact);
    expect(mergeProgressiveFact(pauseReviewed(), fact)).toEqual(fact); expect(nextStoredProgress(pauseReviewed(), fact)).toBe(fact);
    expect(snapshotJournalFact('diagnostics', fact)).toEqual(fact); expect(Object.isFrozen(freezePauseFact(fact))).toBe(true);
    expect(() => freezePauseFact({ ...fact, private: true } as never)).toThrow('invalid-pause-observation');
});
