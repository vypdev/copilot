import { vi } from 'vitest';
import { decideJournal, type JournalResult, type JournalSnapshot } from '../../src/domain/local_journal.ts';
import { writeJournal, type JournalWriteInput } from '../../src/application/journal_writer_io.ts';
import type { JournalStore } from '../../src/application/journal_ports.ts';
import { writerFact } from './journal_writer.ts';

export function writerIOFixture(known = false) {
    const row = writerFact('submitted');
    const initial = decideJournal('diagnostics', undefined, { type: 'append', epoch: 0, at: 1000, now: 1000, fact: row }).write!;
    let saved: JournalSnapshot | undefined = known ? initial : undefined;
    const execute = vi.fn<JournalStore['execute']>(async (kind, command, current) => {
        if (current && !current()) return { state: 'stale' };
        const result = decideJournal(kind, saved, command); if (result.write) saved = result.write; return result.result;
    });
    const control = { current: vi.fn(() => true), now: vi.fn((): number | null => 1000) };
    const input: JournalWriteInput = { kind: 'diagnostics', at: 1000, epoch: 0, sequence: known ? 1 : null, desired: writerFact('settled'),
        stored: known ? row : null, needsRead: false, authority: { policyRevision: 1, current: vi.fn(() => true) }, source: vi.fn(() => true) };
    const store = { execute };
    return { input, store, control, initial, run: (changes: Partial<JournalWriteInput> = {}) => writeJournal({ ...input, ...changes }, store, control),
        read: (changes: Partial<JournalSnapshot> = {}): JournalResult => ({ state: 'ready', snapshot: { ...initial, ...changes } }) };
}
