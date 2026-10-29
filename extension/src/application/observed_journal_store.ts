import type { JournalKind } from '../domain/journal_facts.ts';
import type { JournalSnapshot } from '../domain/local_journal.ts';
import type { JournalStore } from './journal_ports.ts';

/** Canonical observations reach the one writer owner before a clear lease can release deferred old work. */
export class ObservedJournalStore implements JournalStore {
    constructor(private readonly inner: JournalStore, private readonly observed: (kind: JournalKind, snapshot: JournalSnapshot) => void) {}
    async execute(...args: Parameters<JournalStore['execute']>): ReturnType<JournalStore['execute']> {
        const result = await this.inner.execute(...args);
        try { if ('snapshot' in result) this.observed(args[0], result.snapshot); }
        catch { /* A secondary observation cannot erase the terminal native result. */ }
        return result;
    }
}
