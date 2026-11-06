import { expect, it } from 'vitest';
import { mergeProgressiveFact, nextStoredProgress, sameJournalFact } from '../../src/domain/journal_progress.ts';
import { progressiveTerminal, progressiveTransition } from '../../src/domain/journal_facts.ts';
import { settingsObservation } from '../../src/domain/settings_observation.ts';
import type { SessionFact } from '../../src/domain/session_fact.ts';

const session: SessionFact = { kind: 'session-operation', action: 'connect', state: 'running', result: 'pending', effects: [], incomplete: false };
it('session progress coalesces exact ordered effects without fabricating settings submission or mixing operation families', () => {
    const settings = settingsObservation('appearance', 'reviewed'); const terminal: SessionFact = { ...session, state: 'settled', result: 'ready' };
    expect(mergeProgressiveFact(session, terminal)).toEqual(terminal); expect(nextStoredProgress(session, terminal)).toBe(terminal);
    expect(sameJournalFact(session, settings)).toBe(false); expect(mergeProgressiveFact(session, settings)).toBeNull();
    expect(mergeProgressiveFact(settings, session)).toBeNull(); expect(progressiveTransition(session, settings)).toBe(false);
    expect(progressiveTransition(settings, session)).toBe(false); expect(progressiveTransition(session, terminal)).toBe(true);
});
it('only a terminal session service result frees a completed slot; a running effect list does not imply completion', () => {
    expect(progressiveTerminal(session)).toBe(false); expect(progressiveTerminal({ ...session, state: 'settled', result: 'unknown', incomplete: true })).toBe(true);
});
