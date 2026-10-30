import { currentTarget, type CurrentOperationReply, type CurrentTarget, type OperationStage } from '../domain/current_operation.ts';
import { decodeHistoryValue } from '../domain/history_decode.ts';
import { settingsCompletion, settingsObservation } from '../domain/settings_observation.ts';
import { mergeOperationFact } from '../domain/journal_progress.ts';
import { settingsJournalAction, type OperationFact } from '../domain/journal_facts.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { SettingsAction } from '../domain/settings_change.ts';
import type { SettingsCommit } from '../domain/settings_result.ts';
import type { JournalRetention } from '../domain/history_state.ts';
import type { SettingsOperationTrace } from './settings_observation_ports.ts';
import { collectionCurrent } from './collection_restrictions.ts';

export interface CurrentOperationPorts {
    now(): number; changed(): void;
    admit(fact: OperationFact, current: () => boolean): Readonly<object> | null;
    update(ticket: Readonly<object>, fact: OperationFact): unknown; retention(ticket: Readonly<object>): JournalRetention;
}
interface Entry {
    readonly owner: string; readonly at: number; readonly current: () => boolean;
    target: CurrentTarget | null; fact: OperationFact; stage: OperationStage; ticket: Readonly<object> | null; submitted: boolean;
}
const LIFETIME = 300_000;
/** Current private targets and optional redacted retention have separate ownership and failure paths. */
export class CurrentOperations {
    private readonly entries = new Map<string, Entry>();
    private generation: object = {};
    private stopped = false;
    constructor(private readonly ports: CurrentOperationPorts) {}
    private time(): number | null { try { const at = this.ports.now(); return natural(at) && natural(at + LIFETIME) ? at : null; } catch { return null; } }
    private forget(entry: Entry): void { entry.target = null; this.entries.delete(entry.owner); }
    private prune(at: number | null): void {
        for (const entry of this.entries.values()) if (at === null || at < entry.at || at - entry.at >= LIFETIME) this.forget(entry);
    }
    private changed(entry: Entry): void {
        if (this.stopped || this.entries.get(entry.owner) !== entry) return;
        const now = this.time(); this.prune(now); if (this.entries.get(entry.owner) !== entry) return;
        if (!collectionCurrent(entry.current)) entry.target = null;
        try { this.ports.changed(); } catch { /* Observability never changes primary state. */ }
    }
    reviewSettings(owner: string, action: SettingsAction, target: CurrentTarget, current: () => boolean): SettingsOperationTrace | null {
        const generation = this.generation;
        if (this.stopped || !settingsOperationId(owner) || !settingsJournalAction(action) || !collectionCurrent(current)) return null;
        if (this.stopped || generation !== this.generation) return null;
        const now = this.time(); this.prune(now); if (now === null) return null;
        const snapshot = decodeHistoryValue(target, currentTarget); if (!snapshot || !collectionCurrent(current)) return null;
        if (this.stopped || generation !== this.generation) return null;
        const old = this.entries.get(owner); if (old) this.forget(old);
        if (this.entries.size >= 8) this.forget(this.entries.values().next().value!);
        const entry: Entry = { owner, at: now, target: snapshot, current, fact: settingsObservation(action, 'reviewed'), stage: 'reviewed', ticket: null, submitted: false };
        this.entries.set(owner, entry);
        try { entry.ticket = this.ports.admit(entry.fact, current); } catch { /* A missing ticket is not primary failure or permission to retry. */ }
        this.changed(entry);
        const advance = (stage: OperationStage, fact: OperationFact | null) => {
            if (this.stopped || ['cancelled', 'blocked'].includes(entry.fact.phase)) return;
            if (entry.fact.phase === 'settled' && entry.fact.observation === 'committed') return;
            const next = fact ? mergeOperationFact(entry.fact, fact) : entry.fact; if (!next) return;
            const prior = entry.fact; entry.fact = next; entry.stage = stage;
            if (entry.ticket && next !== prior) { try { this.ports.update(entry.ticket, next); } catch { /* Never reacquire or repeat a ticket. */ } }
            this.changed(entry);
        };
        return Object.freeze({
            confirming: () => { if (entry.stage === 'reviewed') advance('confirming', null); },
            submitted: () => { if (!entry.submitted) { entry.submitted = true; advance('submitted', settingsObservation(action, 'submitted')); } },
            cancelled: () => { if (entry.stage === 'reviewed') advance('cancelled', settingsObservation(action, 'cancelled')); },
            blocked: () => { if (entry.stage === 'reviewed') advance('blocked', settingsObservation(action, 'blocked')); },
            complete: (outcome: SettingsCommit) => { const value = settingsCompletion(action, entry.submitted, outcome); advance(value.stage, value.fact); },
        });
    }
    read(owner: string): CurrentOperationReply | { readonly state: 'unavailable' } {
        const now = this.time(); this.prune(now); if (this.stopped || now === null) return { state: 'unavailable' };
        const entry = this.entries.get(owner); if (!entry) return { state: 'empty' };
        const current = collectionCurrent(entry.current); if (!current) entry.target = null;
        let retention: JournalRetention = 'untracked';
        if (entry.ticket) { try {
            const value = this.ports.retention(entry.ticket); retention = ['pending', 'stored', 'not-retained', 'unknown', 'untracked'].includes(value) ? value : 'unknown';
        } catch { retention = 'unknown'; } }
        // A synchronous port may replace/retire this entry; no old private target escapes that boundary.
        if (this.stopped || this.entries.get(owner) !== entry) return { state: 'empty' };
        const live = collectionCurrent(entry.current); if (!live) entry.target = null;
        const end = this.time(); this.prune(end); if (end === null) return { state: 'unavailable' };
        if (this.stopped || this.entries.get(owner) !== entry) return { state: 'empty' };
        return deepFreeze({ state: 'current', operation: { family: 'settings' as const, stage: entry.stage, fact: entry.fact,
            target: entry.target, sourceCurrent: current && live, firstObserved: entry.at, retention } });
    }
    invalidate(): void { this.generation = {}; for (const entry of this.entries.values()) entry.target = null; this.entries.clear(); }
    stop(): void { this.stopped = true; this.invalidate(); }
}
