import { vi } from 'vitest';
import { JournalWriter } from '../../src/application/journal_writer.ts';
import { ObservedJournalStore } from '../../src/application/observed_journal_store.ts';
import type { JournalStore } from '../../src/application/journal_ports.ts';
import { decideControlledJournal } from '../../src/domain/controlled_journal.ts';
import type { JournalKind, OperationFact } from '../../src/domain/journal_facts.ts';
import { collectionFixture, collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';

export const writerFact = (phase: OperationFact['phase'] = 'reviewed', observation: OperationFact['observation'] = 'committed'): OperationFact =>
    ({ kind: 'operation', action: 'preferences', phase, acknowledgement: phase === 'settled' ? 'accepted' : phase === 'submitted' ? 'unknown' : 'not-submitted',
        observation: phase === 'settled' ? observation : 'not-observed' });
/** Real application ownership plus pure provider decisions; not a browser/IndexedDB acceptance driver. */
export async function journalWriterFixture(active = true, observe = true) {
    const f = collectionFixture(collectionSettings(active, active)); let now = 1000;
    if (active) { f.values.set('diagnostics', activeCollectionPolicy()); f.values.set('recents', activeCollectionPolicy('recents')); }
    await f.coordinator.refresh();
    const journals = new Map<JournalKind, unknown>(); const commands: Parameters<JournalStore['execute']>[] = [];
    const native: JournalStore = { execute: vi.fn<JournalStore['execute']>(async (...args) => {
        const [kind, command, current, policy] = args; commands.push(args);
        if (current && !current()) return { state: 'stale' };
        const result = decideControlledJournal(kind, journals.get(kind), f.values.get(kind), command, policy);
        if (result.write) journals.set(kind, result.write);
        return result.result;
    }) };
    const store = observe ? new ObservedJournalStore(native, (kind, value) => { writer.observe(kind, value); }) : native;
    const ports = { now: vi.fn(() => now), admission: vi.fn((kind: JournalKind) => f.coordinator.admission(kind)),
        mayRun: vi.fn((kind: JournalKind) => f.coordinator.writerMayRun(kind)), changed: vi.fn() };
    const writer = new JournalWriter(store, ports);
    f.ports.writerIdle.mockImplementation(kind => writer.idle(kind)); f.ports.changed.mockImplementation(() => { writer.wake(); });
    return { ...f, writer, store, native, writerPorts: ports, journals, commands,
        ready: async () => { await writer.prime('diagnostics'); await writer.prime('recents'); }, advance: (ms: number) => { now += ms; } };
}
