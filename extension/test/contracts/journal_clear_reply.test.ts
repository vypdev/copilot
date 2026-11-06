import { expect, it } from 'vitest';
import { decodeJournalClearInspection, decodeJournalClearOutcome, decodeJournalClearPreview } from '../../src/domain/journal_clear_reply.ts';
import { historyWireExamples, changedHistoryField as change } from '../fixtures/history_wire.ts';

it('decodes actual clear preview and outcome with detached frozen scope', async () => {
    const f = await historyWireExamples(); expect(decodeJournalClearPreview(f.clear)).toEqual(f.clear); const result = decodeJournalClearOutcome(f.cleared);
    expect(result).toEqual(f.cleared); expect(result).not.toBe(f.cleared); expect(Object.isFrozen(result)).toBe(true);
});
it.each([
    ['operationId', 'private'], ['kind', 'foreign'], ['epoch', -1], ['epoch', 9], ['revision', -1], ['policyRevision', -1],
    ['entries', -1], ['entries', 201], ['expiresAt', -1], ['privatePolicyNonce', 'b'.repeat(32)],
])('rejects unsafe clear preview %s', async (field, value) => {
    const f = await historyWireExamples(); expect(decodeJournalClearPreview(change(f.clear, field, value))).toBeNull();
});
it('enforces the distinct recent-destination bound', async () => {
    const f = await historyWireExamples(); expect(decodeJournalClearPreview({ ...f.clear, kind: 'recents', entries: 50 })).not.toBeNull();
    expect(decodeJournalClearPreview({ ...f.clear, kind: 'recents', entries: 51 })).toBeNull();
});
it.each([
    ['acknowledgement', 'inferred'], ['epoch', 0], ['epoch', -1], ['epoch', 9], ['revision', -1], ['sourceCurrentAtObservation', 'true'], ['token', 'private'],
])('does not claim observed clear from malformed %s', async (field, value) => {
    const f = await historyWireExamples(); expect(decodeJournalClearOutcome(change(f.cleared, field, value))).toBeNull();
});
it.each(['changed', 'unavailable'])('keeps unknown acknowledgement/observation separate for %s', observation => {
    const unknown = { state: 'unknown', acknowledgement: 'accepted', observation, sourceCurrentAtObservation: false };
    expect(decodeJournalClearOutcome(unknown)).toEqual(unknown); expect(decodeJournalClearOutcome({ ...unknown, acknowledgement: 'unknown' })).not.toBeNull();
    expect(decodeJournalClearOutcome({ ...unknown, acknowledgement: 'inferred' })).toBeNull();
    expect(decodeJournalClearOutcome({ ...unknown, observation: 'empty' })).toBeNull();
    expect(decodeJournalClearOutcome({ ...unknown, sourceCurrentAtObservation: null })).toBeNull();
});
it.each(['not-started', 'aborted'])('preserves the established not-applied cause %s', reason => {
    expect(decodeJournalClearOutcome({ state: 'not-applied', reason })).toEqual({ state: 'not-applied', reason });
    expect(decodeJournalClearOutcome({ state: 'not-applied', reason: 'private' })).toBeNull();
});
it.each(['invalid', 'stale', 'expired', 'denied', 'busy', 'unavailable', 'future', 'corrupt', 'clock-invalid', 'exhausted', 'collection-active', 'migration-required'])(
    'supports explicit %s without adding private payloads', state => {
        expect(decodeJournalClearPreview({ state })).toEqual({ state }); expect(decodeJournalClearOutcome({ state })).toEqual({ state });
        expect(decodeJournalClearOutcome({ state, private: 'private' })).toBeNull();
    });
it('keeps read-only pending/unsubmitted inspection distinct from confirmation outcomes', () => {
    expect(decodeJournalClearInspection({ state: 'not-submitted' })).toEqual({ state: 'not-submitted' }); expect(decodeJournalClearOutcome({ state: 'not-submitted' })).toBeNull();
    for (const state of ['pending', 'cancelled']) expect(decodeJournalClearInspection({ state })).toEqual({ state });
    expect(decodeJournalClearOutcome({ state: 'assumed' })).toBeNull(); expect(decodeJournalClearPreview(null)).toBeNull(); expect(decodeJournalClearOutcome(null)).toBeNull();
});
