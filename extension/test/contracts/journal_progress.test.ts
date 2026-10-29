import { expect, it } from 'vitest';
import { mergeOperationFact, sameJournalFact, snapshotJournalFact } from '../../src/domain/journal_progress.ts';
import { writerFact } from '../fixtures/journal_writer.ts';

it('snapshots exactly the closed fact, rejects hostile serialization, and retains no mutable source', () => {
    const input = { ...writerFact() }; const copied = snapshotJournalFact('diagnostics', input);
    expect(copied).toEqual(input); expect(copied).not.toBe(input); expect(Object.isFrozen(copied)).toBe(true);
    input.phase = 'blocked'; expect(copied).toMatchObject({ phase: 'reviewed' });
    const serialization = Object.defineProperty({ ...writerFact() }, 'toJSON', { value: () => ({ ...writerFact(), private: 'private' }) });
    expect(snapshotJournalFact('diagnostics', serialization)).toBeNull();
    expect(snapshotJournalFact('diagnostics', new Proxy(writerFact(), { get() { throw new Error('private'); } }))).toBeNull();
});
it('operation progress preserves accepted acknowledgement and rejects backwards or differently scoped facts', () => {
    const accepted = writerFact('settled', 'unavailable'); const later = { ...writerFact('settled', 'changed'), acknowledgement: 'unknown' as const };
    expect(mergeOperationFact(accepted, later)).toMatchObject({ acknowledgement: 'accepted', observation: 'changed' });
    expect(mergeOperationFact(writerFact('submitted'), writerFact('cancelled'))).toBeNull();
    expect(mergeOperationFact(writerFact(), { ...writerFact('submitted'), action: 'rollback' })).toBeNull();
    expect(sameJournalFact(writerFact(), { ...writerFact(), private: true } as unknown as ReturnType<typeof writerFact>)).toBe(false);
});
