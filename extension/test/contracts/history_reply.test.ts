import { expect, it } from 'vitest';
import { decodeHistoryDocument } from '../../src/domain/history_reply.ts';
import { historyWireExamples, changedHistoryField as change } from '../fixtures/history_wire.ts';

it('decodes actual off/active history independently and returns a frozen detached public value', async () => {
    const f = await historyWireExamples(); for (const example of [f.off, f.active]) {
        const value = decodeHistoryDocument(example); expect(value).toEqual(example); expect(value).not.toBe(example);
        expect(Object.isFrozen(value!.retained)).toBe(true); expect(Object.isFrozen(value!.writer)).toBe(true);
    }
});
it.each([
    ['state', 'future'], ['kind', 'foreign'], ['collection.kind', 'recents'], ['collection.preference', 'private'],
    ['collection.globallyPaused', 1], ['collection.policy', 'inferred'], ['collection.policyRevision', null],
    ['collection.collecting', 'true'], ['collection.sessionBlocked', null], ['collection.busy', 1],
    ['collection.restriction', {}], ['writer.kind', 'recents'], ['writer.epoch', null], ['writer.epoch', -1],
    ['writer.epoch', 2], ['writer.observedRevision', -1], ['writer.pending', -1], ['writer.pending', 201],
    ['writer.dropped', -1], ['writer.incomplete', true], ['writer.issue', 'private-error'], ['writer.issue', 'unknown'],
    ['retained', null], ['retained.state', 'written'], ['retained.snapshot', {}], ['retained.snapshot.epoch', 1],
    ['retained.snapshot.kind', 'recents'], ['retained.snapshot.entries', [{ private: 'private' }]],
])('rejects malformed or mixed-scope %s history metadata', async (path, value) => {
    const f = await historyWireExamples(); expect(decodeHistoryDocument(change(f.off, path, value))).toBeNull();
});
it.each([
    ['collection.preference', 'off'], ['collection.globallyPaused', true], ['collection.sessionBlocked', true],
    ['collection.policy', 'paused'], ['collection.policyRevision', Number.MAX_SAFE_INTEGER], ['writer.observedRevision', 0],
])('cannot turn contradictory active %s into collection or current history proof', async (path, value) => {
    const f = await historyWireExamples(); expect(decodeHistoryDocument(change(f.active, path, value))).toBeNull();
});
it('accepts unknown collection/metadata and unavailable retained data without inventing a saved preference', async () => {
    const f = await historyWireExamples(); const value = structuredClone(f.off);
    Object.assign(value.collection, { preference: 'unknown', globallyPaused: null, policy: 'unavailable', policyRevision: null });
    Object.assign(value.writer, { epoch: null, observedRevision: null, dropped: 1, incomplete: true, issue: 'not-ready' });
    Object.assign(value, { retained: { state: 'unavailable' } }); expect(decodeHistoryDocument(value)).toEqual(value);
    expect(decodeHistoryDocument(change(value, 'writer.observedRevision', 0))).toBeNull();
    expect(decodeHistoryDocument(change(value, 'writer.issue', 'none'))).toBeNull();
});
it('preserves independent historical restriction acknowledgements without joining them to current policy', async () => {
    const f = await historyWireExamples(); const value = change(f.off, 'collection.restriction', {
        acknowledgement: 'unknown', observation: 'paused', policyRevision: 2, sourceCurrentAtObservation: false,
    }); expect(decodeHistoryDocument(value)).not.toBeNull();
    for (const [field, bad] of [['acknowledgement', 'private'], ['observation', 'future'], ['policyRevision', null], ['sourceCurrentAtObservation', null]]) {
        expect(decodeHistoryDocument(change(value, `collection.restriction.${field}`, bad))).toBeNull();
    }
    const unknown = change(value, 'collection.restriction', { acknowledgement: 'not-attempted', observation: 'unavailable', policyRevision: null, sourceCurrentAtObservation: true });
    expect(decodeHistoryDocument(unknown)).not.toBeNull(); expect(decodeHistoryDocument(change(unknown, 'collection.restriction.policyRevision', 0))).toBeNull();
});
it.each(['future', 'corrupt', 'clock-invalid', 'exhausted', 'unavailable'])('retains %s as an independent history availability fact', async state => {
    const f = await historyWireExamples(); expect(decodeHistoryDocument({ ...f.off, retained: { state } })).toMatchObject({ retained: { state } });
});
it('rejects private/extra fields, oversized or non-JSON values and never returns accessor-backed mutable references', async () => {
    const f = await historyWireExamples(); expect(decodeHistoryDocument({ ...f.off, token: 'private' })).toBeNull();
    expect(decodeHistoryDocument({ ...f.off, private: 'x'.repeat(133 * 1024) })).toBeNull();
    const cycle: Record<string, unknown> = {}; cycle.self = cycle; expect(decodeHistoryDocument(cycle)).toBeNull();
    expect(decodeHistoryDocument(undefined)).toBeNull();
    expect(decodeHistoryDocument(Object.defineProperty({}, 'toJSON', { value() { throw new Error('private'); } }))).toBeNull();
    let reads = 0; const changing = Object.defineProperty({}, 'toJSON', { value() { if (++reads > 1) throw new Error('private'); return f.off; } });
    expect(decodeHistoryDocument(changing)).toBeNull();
});
