import { expect, it } from 'vitest';
import { initialCollectionFact } from '../../src/domain/collection_fact.ts';
import { progressiveFact, progressiveTerminal, progressiveTransition, journalFact } from '../../src/domain/journal_facts.ts';
import { mergeProgressiveFact, nextStoredProgress, sameJournalFact, snapshotJournalFact } from '../../src/domain/journal_progress.ts';
import { settingsObservation } from '../../src/domain/settings_observation.ts';
import type { SessionFact } from '../../src/domain/session_fact.ts';

it('the closed compound family belongs only to diagnostics and progresses its same semantic row without a fabricated settings submission', () => {
    const before = initialCollectionFact('diagnostics', 'start', true); const after = { ...before, state: 'running' as const };
    expect(journalFact('diagnostics', before)).toBe(true); expect(journalFact('recents', before)).toBe(false); expect(progressiveFact(before)).toBe(true);
    expect(mergeProgressiveFact(before, after)).toEqual(after); expect(progressiveTransition(before, after)).toBe(true); expect(nextStoredProgress(before, after)).toBe(after);
    const snapshot = snapshotJournalFact('diagnostics', after); expect(snapshot).toEqual(after); expect(Object.isFrozen(snapshot)).toBe(true);
    if (snapshot?.kind !== 'collection-operation') throw new Error('wrong-family'); expect(Object.isFrozen(snapshot.pause)).toBe(true);
});
it('settings, session and compound rows cannot be merged across operation families', () => {
    const compound = initialCollectionFact('recents', 'stop', true); const settings = settingsObservation('appearance', 'reviewed');
    const session: SessionFact = { kind: 'session-operation', action: 'connect', state: 'running', result: 'pending', effects: [], incomplete: false };
    for (const other of [settings, session]) {
        expect(mergeProgressiveFact(compound, other)).toBeNull(); expect(mergeProgressiveFact(other, compound)).toBeNull();
        expect(progressiveTransition(compound, other)).toBe(false); expect(progressiveTransition(other, compound)).toBe(false); expect(sameJournalFact(compound, other)).toBe(false);
    }
});
it('semantic nested equality ignores key order while terminal and running compound rows keep different tracking lifetimes', () => {
    const before = initialCollectionFact('recents', 'stop', false); const reordered = { ...before, pause: Object.fromEntries(Object.entries(before.pause).reverse()) } as typeof before;
    expect(sameJournalFact(before, reordered)).toBe(true); expect(progressiveTerminal(before)).toBe(false);
    for (const state of ['cancelled', 'blocked', 'settled'] as const) expect(progressiveTerminal({ ...before, state, result: state === 'settled' ? 'busy' : state })).toBe(true);
});
