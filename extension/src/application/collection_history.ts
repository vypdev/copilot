import { journalKind, type JournalKind } from '../domain/journal_facts.ts';
import type { HistoryDocument, RetainedHistory } from '../domain/history_document.ts';
import { validJournalSnapshot } from '../domain/local_journal.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import { CollectionCoordinator } from './collection_coordinator.ts';
import { collectionCurrent } from './collection_restrictions.ts';
import type { CollectionPolicyStore } from './collection_policy_ports.ts';
import type { JournalStore } from './journal_ports.ts';
import { JournalWriter } from './journal_writer.ts';
import { ObservedJournalStore } from './observed_journal_store.ts';
import { SettingsRepository } from './settings_repository.ts';
import type { StoragePort } from './runtime_ports.ts';

export interface CollectionHistoryPorts { now(): number; identifier(): string; changed(): void }
/** One background owner, mandatory preference preflight and secondary retention; constructing performs no IO. */
export class CollectionHistory {
    readonly coordinator: CollectionCoordinator;
    readonly settings: SettingsRepository;
    readonly writer: JournalWriter;
    readonly store: JournalStore;
    private stopped = false;
    constructor(storage: StoragePort, journals: JournalStore, policies: CollectionPolicyStore, private readonly ports: CollectionHistoryPorts) {
        const coordinator: CollectionCoordinator = new CollectionCoordinator(policies, { settings: () => settings.read(), identifier: ports.identifier,
            writerIdle: kind => writer.idle(kind), changed: () => { writer.wake(); ports.changed(); } });
        const settings: SettingsRepository = new SettingsRepository(storage, coordinator);
        const store = new ObservedJournalStore(journals, (kind, snapshot) => { writer.observe(kind, snapshot); });
        const writer: JournalWriter = new JournalWriter(store, { now: ports.now, admission: kind => coordinator.admission(kind),
            mayRun: kind => coordinator.writerMayRun(kind), changed: ports.changed });
        this.coordinator = coordinator; this.settings = settings; this.writer = writer; this.store = store;
    }
    async refresh(): Promise<void> {
        if (this.stopped) return;
        await this.coordinator.refresh();
        for (const kind of ['diagnostics', 'recents'] as const) if (!this.stopped && this.coordinator.state(kind).collecting) await this.writer.prime(kind);
    }
    invalidate(): void { this.coordinator.invalidate(); }
    async read(kind: JournalKind, current: () => boolean): Promise<HistoryDocument | { readonly state: 'invalid' | 'stale' | 'unavailable' }> {
        if (!journalKind(kind)) return { state: 'invalid' };
        const eligible = () => !this.stopped && collectionCurrent(current);
        if (!eligible()) return { state: 'stale' };
        try {
            await this.coordinator.refresh(); if (!eligible()) return { state: 'stale' };
            const now = this.ports.now(); if (!natural(now)) return { state: 'unavailable' };
            const result = await this.store.execute(kind, { type: 'read', now }, eligible);
            if (!eligible()) return { state: 'stale' };
            const writer = this.writer.state(kind);
            const retained: RetainedHistory = result.state === 'ready' && validJournalSnapshot(kind, result.snapshot)
                && writer.epoch === result.snapshot.epoch && writer.observedRevision === result.snapshot.revision
                ? { state: 'ready', snapshot: result.snapshot }
                : { state: result.state === 'future' || result.state === 'corrupt' || result.state === 'clock-invalid' || result.state === 'exhausted' ? result.state : 'unavailable' };
            return deepFreeze({ state: 'ready', kind, retained, collection: this.coordinator.state(kind), writer });
        } catch { return eligible() ? { state: 'unavailable' } : { state: 'stale' }; }
    }
    stop(): void { this.stopped = true; this.coordinator.dispose(); this.writer.dispose(); }
}
