import { journalKind, progressiveFact, progressiveTerminal, type JournalFact, type JournalKind, type ProgressiveFact } from '../domain/journal_facts.ts';
import { validJournalSnapshot, type JournalSnapshot } from '../domain/local_journal.ts';
import { mergeProgressiveFact, sameJournalFact, snapshotJournalFact } from '../domain/journal_progress.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { JournalStore } from './journal_ports.ts';
import { JournalWorkQueue } from './journal_work_queue.ts';
import { writeJournal, type JournalWriteInput } from './journal_writer_io.ts';
import type { JournalRetention, JournalTicket, JournalWriterIssue, JournalWriterPorts, JournalWriterState } from './journal_writer_ports.ts';

interface Work extends Omit<JournalWriteInput, 'desired' | 'stored' | 'sequence' | 'needsRead' | 'authority' | 'source'> {
    readonly ticket: JournalTicket; desired: JournalFact; stored: JournalWriteInput['stored']; sequence: number | null;
    needsRead: boolean; authority: JournalWriteInput['authority']; source: JournalWriteInput['source']; retention: JournalRetention;
}
interface Slot { epoch: number | null; revision: number | null; dropped: number; issue: JournalWriterIssue; loading: Promise<void> | null; generation: object }
const TRACK_TTL = 300_000;
const slot = (): Slot => ({ epoch: null, revision: null, dropped: 0, issue: 'none', loading: null, generation: {} });

/** Secondary, bounded retention. Neither admission, provider failure nor queued work blocks a primary operation. */
export class JournalWriter {
    private readonly records = new Map<JournalTicket, Work>();
    private readonly slots: Record<JournalKind, Slot> = { diagnostics: slot(), recents: slot() };
    private readonly queue: JournalWorkQueue<Work>;
    private disposed = false;
    private signature = '';
    constructor(private readonly store: JournalStore, private readonly ports: JournalWriterPorts) {
        this.queue = new JournalWorkQueue({ mayRun: kind => this.ports.mayRun(kind), work: work => this.write(work),
            failed: work => {
                if (this.records.get(work.ticket) !== work) return;
                work.retention = 'unknown'; work.needsRead = true; work.authority = null; work.source = null; this.drop(work.kind, 'unknown');
            }, changed: () => this.publish() });
    }
    private time(): number | null { try { const now = this.ports.now(); return natural(now) ? now : null; } catch { return null; } }
    private current(work: Work): boolean {
        const now = this.time();
        return !this.disposed && this.records.get(work.ticket) === work && now !== null && now >= work.at && now - work.at < TRACK_TTL
            && this.slots[work.kind].epoch === work.epoch && this.ports.mayRun(work.kind) === true;
    }
    state(kind: JournalKind): JournalWriterState {
        const value = this.slots[kind];
        return deepFreeze({ kind, epoch: value.epoch, observedRevision: value.revision, pending: this.queue.count(kind),
            incomplete: value.dropped > 0, dropped: value.dropped, issue: value.issue });
    }
    retention(ticket: JournalTicket): JournalRetention { return this.records.get(ticket)?.retention ?? 'untracked'; }
    idle(kind: JournalKind): boolean { return !this.disposed && this.slots[kind].loading === null && this.queue.idle(kind); }
    wake(): void { this.queue.wake(); }
    flush(): Promise<void> { return this.queue.flush(); }
    private publish(): void {
        const signature = JSON.stringify([this.state('diagnostics'), this.state('recents')]);
        if (signature === this.signature) return;
        this.signature = signature;
        try { this.ports.changed(); } catch { /* History notification cannot change the primary result. */ }
    }
    private drop(kind: JournalKind, issue: JournalWriterIssue): void {
        const value = this.slots[kind]; value.dropped = Math.min(Number.MAX_SAFE_INTEGER, value.dropped + 1); value.issue = issue; this.publish();
    }
    private forget(work: Work): void { this.records.delete(work.ticket); work.authority = null; work.source = null; this.queue.remove(work); }
    private prune(now: number): void {
        for (const work of this.records.values()) if (now < work.at || now - work.at >= TRACK_TTL) {
            if (this.queue.contains(work) || work.retention === 'pending') this.drop(work.kind, now < work.at ? 'clock-invalid' : 'stale');
            this.forget(work);
        }
    }
    observe(kind: JournalKind, value: JournalSnapshot): boolean {
        try { if (this.disposed || !journalKind(kind) || !validJournalSnapshot(kind, value)) return false; } catch { return false; }
        const current = this.slots[kind];
        if (current.epoch !== null && (value.epoch < current.epoch || value.epoch === current.epoch && value.revision < current.revision!)) return false;
        if (current.epoch !== null && value.epoch !== current.epoch) {
            for (const work of this.records.values()) if (work.kind === kind) this.forget(work);
            current.dropped = 0; current.issue = 'none';
        }
        current.epoch = value.epoch; current.revision = value.revision; current.generation = {};
        const rows = new Map(value.entries.map(entry => [entry.sequence, entry]));
        for (const work of this.records.values()) if (work.kind === kind && work.sequence !== null) {
            const row = rows.get(work.sequence);
            if (!row) { this.forget(work); continue; }
            if (row.at !== work.at) continue;
            if (!progressiveFact(row.fact) || !progressiveFact(work.desired)) continue;
            const desired = mergeProgressiveFact(row.fact, work.desired); if (!desired) continue;
            work.stored = row.fact; work.desired = desired; work.needsRead = false;
            if (sameJournalFact(row.fact, desired)) { work.retention = 'stored'; this.queue.remove(work); }
        }
        this.publish(); return true;
    }
    prime(kind: JournalKind): Promise<void> {
        try { if (this.disposed || this.ports.mayRun(kind) !== true) return Promise.resolve(); } catch { return Promise.resolve(); }
        const value = this.slots[kind];
        value.loading ??= Promise.resolve().then(async () => {
            const generation = value.generation;
            try {
                const now = this.time(); if (now === null) { this.drop(kind, 'clock-invalid'); return; }
                const result = await this.store.execute(kind, { type: 'read', now }, () => !this.disposed);
                if (this.disposed) return;
                if (generation === value.generation && (result.state !== 'ready' || !this.observe(kind, result.snapshot))) {
                    value.epoch = null; value.revision = null; this.drop(kind, 'unavailable');
                }
            } catch { if (!this.disposed && generation === value.generation) { value.epoch = null; value.revision = null; this.drop(kind, 'unavailable'); } }
            finally { value.loading = null; this.publish(); }
        });
        this.publish(); return value.loading;
    }
    admit(kind: JournalKind, input: unknown, source: () => boolean): JournalTicket | null {
        if (this.disposed || !journalKind(kind)) return null;
        let authority: JournalWriteInput['authority'];
        try { authority = this.ports.admission(kind); if (!authority?.current() || source() !== true) return null; } catch { return null; }
        const now = this.time(); if (now === null) { this.drop(kind, 'clock-invalid'); return null; }
        const fact = snapshotJournalFact(kind, input); if (!fact) { this.drop(kind, 'invalid'); return null; }
        const epoch = this.slots[kind].epoch; if (epoch === null) { this.drop(kind, 'not-ready'); return null; }
        this.prune(now);
        if (this.records.size >= 200) {
            const closed = [...this.records.values()].find(work => !this.queue.contains(work) && (!progressiveFact(work.desired) || progressiveTerminal(work.desired)
                || work.sequence === null && work.retention !== 'pending'));
            if (closed) this.forget(closed);
        }
        if (this.records.size >= 200) { this.drop(kind, 'capacity'); return null; }
        const ticket = Object.freeze({}); const work: Work = { ticket, kind, at: now, epoch, desired: fact, stored: null, sequence: null,
            authority, source, retention: 'pending', needsRead: false };
        this.records.set(ticket, work); this.queue.enqueue(work); return ticket;
    }
    update(ticket: JournalTicket, input: unknown): 'queued' | 'unchanged' | 'invalid' | 'untracked' {
        const work = this.records.get(ticket);
        if (this.disposed || !work || !progressiveFact(work.desired) || work.sequence === null && work.retention !== 'pending') return 'untracked';
        const now = this.time(); if (now === null) { this.drop(work.kind, 'clock-invalid'); return 'invalid'; }
        this.prune(now); if (!this.records.has(ticket)) return 'untracked';
        const value = snapshotJournalFact('diagnostics', input);
        const desired = progressiveFact(value) ? mergeProgressiveFact(work.desired, value) : null;
        if (!desired) { this.drop(work.kind, 'invalid'); return 'invalid'; }
        if (sameJournalFact(work.desired, desired)) return 'unchanged';
        work.desired = desired; work.retention = 'pending'; this.queue.enqueue(work); return 'queued';
    }
    private async write(work: Work): Promise<void> {
        const result = await writeJournal({ ...work }, this.store, { current: () => this.current(work), now: () => this.time() });
        if (this.records.get(work.ticket) !== work) return;
        if (result.snapshot) { this.observe(work.kind, result.snapshot); if (this.records.get(work.ticket) !== work) return; }
        if (result.retention !== 'stored' && work.retention === 'stored' && work.stored && sameJournalFact(work.stored, work.desired)) return;
        work.retention = result.retention; work.authority = null; work.source = null;
        work.needsRead = result.needsRead === true;
        if (result.sequence !== undefined) work.sequence = result.sequence;
        if (result.stored) {
            // IO validates the same action and legal progress; observations and updates preserve those invariants.
            work.stored = work.stored ? mergeProgressiveFact(work.stored, result.stored)! : result.stored;
            work.desired = mergeProgressiveFact(work.stored, work.desired as ProgressiveFact)!;
        }
        if (result.issue !== 'none') this.drop(work.kind, result.issue);
        if (result.retention === 'stored' && work.stored && !sameJournalFact(work.stored, work.desired)) {
            work.retention = 'pending'; this.queue.enqueue(work);
        }
        this.publish();
    }
    dispose(): void { this.disposed = true; this.queue.stop(); for (const work of this.records.values()) this.forget(work); }
}
