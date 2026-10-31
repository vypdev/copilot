import { currentTarget, type CurrentOperationReply, type CurrentTarget, type OperationStage } from '../domain/current_operation.ts';
import { decodeHistoryValue } from '../domain/history_decode.ts';
import { settingsCompletion, settingsObservation } from '../domain/settings_observation.ts';
import { mergeOperationFact } from '../domain/journal_progress.ts';
import { settingsJournalAction, type OperationFact, type ProgressiveFact } from '../domain/journal_facts.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { SettingsAction } from '../domain/settings_change.ts';
import type { SettingsCommit } from '../domain/settings_result.ts';
import type { JournalRetention } from '../domain/history_state.ts';
import type { SettingsOperationTrace } from './settings_observation_ports.ts';
import { collectionCurrent } from './collection_restrictions.ts';
import { sessionAction, type SessionAction, type SessionFact } from '../domain/session_fact.ts';
import { SessionObservations } from './session_observations.ts';
import { SessionObservationSource } from './session_observation_source.ts';
import type { SettingsOwnerFence } from './settings_transaction_ports.ts';
import type { SessionOperationTrace } from './session_observation_ports.ts';
import type { CollectionAction } from '../domain/collection_review.ts';
import type { CollectionFact } from '../domain/collection_fact.ts';
import { journalKind } from '../domain/journal_facts.ts';
import { CollectionObservations } from './collection_observations.ts';
import type { CollectionOperationTrace } from './collection_observation_ports.ts';
import type { ClearFact } from '../domain/clear_fact.ts';
import { ClearObservations } from './clear_observations.ts';
import type { ClearOperationTrace } from './clear_observation_ports.ts';
import { pauseAction, type PauseFact } from '../domain/pause_fact.ts';
import type { PauseReviewIntent } from '../domain/temporary_pause_review.ts';
import { PauseObservations } from './pause_observations.ts';
import type { PauseOperationTrace } from './pause_observation_ports.ts';
import { apiCacheFactTransition, type ApiCacheFact, type ApiCacheFactState } from '../domain/api_cache.ts';

export interface CurrentOperationPorts {
    now(): number; changed(): void;
    admit(fact: ProgressiveFact, current: () => boolean): Readonly<object> | null;
    update(ticket: Readonly<object>, fact: ProgressiveFact): unknown; retention(ticket: Readonly<object>): JournalRetention;
}
interface EntryBase {
    readonly owner: string; readonly at: number; readonly current: () => boolean;
    target: CurrentTarget | null; ticket: Readonly<object> | null;
}
interface SettingsEntry extends EntryBase { readonly family: 'settings'; fact: OperationFact; stage: OperationStage; submitted: boolean }
interface SessionEntry extends EntryBase { readonly family: 'sessions'; fact: SessionFact; stage: SessionFact['state'] }
interface CollectionEntry extends EntryBase { readonly family: 'collection'; fact: CollectionFact; stage: CollectionFact['state'] }
interface ClearEntry extends EntryBase { readonly family: 'clear'; fact: ClearFact; stage: ClearFact['state'] }
interface PauseEntry extends EntryBase { readonly family: 'pauses'; fact: PauseFact; stage: PauseFact['state'] }
interface ApiCacheEntry extends EntryBase { readonly family: 'cache'; fact: ApiCacheFact; stage: ApiCacheFactState }
type Entry = SettingsEntry | SessionEntry | CollectionEntry | ClearEntry | PauseEntry | ApiCacheEntry;
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
    private prepare(owner: string, target: CurrentTarget, current: () => boolean): EntryBase | null {
        const generation = this.generation;
        if (this.stopped || !settingsOperationId(owner) || !collectionCurrent(current)) return null;
        if (this.stopped || generation !== this.generation) return null;
        const now = this.time(); this.prune(now); if (now === null) return null;
        const snapshot = decodeHistoryValue(target, currentTarget); if (!snapshot || !collectionCurrent(current)) return null;
        if (this.stopped || generation !== this.generation) return null;
        const old = this.entries.get(owner); if (old) this.forget(old);
        if (this.entries.size >= 8) this.forget(this.entries.values().next().value!);
        return { owner, at: now, target: snapshot, current, ticket: null };
    }
    private install(entry: Entry, retain = true): void {
        this.entries.set(entry.owner, entry);
        if (retain) { try { entry.ticket = this.ports.admit(entry.fact, entry.current); } catch { /* A missing ticket is not primary failure or permission to retry. */ } }
        this.changed(entry);
    }
    private update(entry: Entry, fact: ProgressiveFact): void {
        if (entry.ticket) { try { this.ports.update(entry.ticket, fact); } catch { /* Never reacquire or repeat a ticket. */ } }
        this.changed(entry);
    }
    reviewSettings(owner: string, action: SettingsAction, target: CurrentTarget, current: () => boolean): SettingsOperationTrace | null {
        if (!settingsJournalAction(action)) return null;
        const base = this.prepare(owner, target, current); if (!base) return null;
        const entry: SettingsEntry = { ...base, family: 'settings', fact: settingsObservation(action, 'reviewed'), stage: 'reviewed', submitted: false };
        this.install(entry);
        const advance = (stage: OperationStage, fact: OperationFact | null) => {
            if (this.stopped || ['cancelled', 'blocked'].includes(entry.fact.phase)) return;
            if (entry.fact.phase === 'settled' && entry.fact.observation === 'committed') return;
            const next = fact ? mergeOperationFact(entry.fact, fact) : entry.fact; if (!next) return;
            const prior = entry.fact; entry.fact = next; entry.stage = stage;
            if (next !== prior) this.update(entry, next); else this.changed(entry);
        };
        return Object.freeze({
            confirming: () => { if (entry.stage === 'reviewed') advance('confirming', null); },
            submitted: () => { if (!entry.submitted) { entry.submitted = true; advance('submitted', settingsObservation(action, 'submitted')); } },
            cancelled: () => { if (entry.stage === 'reviewed') advance('cancelled', settingsObservation(action, 'cancelled')); },
            blocked: () => { if (entry.stage === 'reviewed') advance('blocked', settingsObservation(action, 'blocked')); },
            complete: (outcome: SettingsCommit) => { const value = settingsCompletion(action, entry.submitted, outcome); advance(value.stage, value.fact); },
        });
    }
    observeSession(owner: string, action: SessionAction, target: CurrentTarget, live: () => boolean, query: () => SettingsOwnerFence | null): SessionOperationTrace | null {
        if (this.stopped || !settingsOperationId(owner) || !sessionAction(action)) return null;
        const generation = this.generation; const source = new SessionObservationSource(query);
        if (this.stopped || generation !== this.generation) return null;
        const current = () => { if (!collectionCurrent(live)) source.retire(); return source.current(); };
        const base = this.prepare(owner, target, current); if (!base) return null;
        const observer = new SessionObservations(action, fact => {
            if (this.stopped) return;
            entry.fact = fact; entry.stage = fact.state; this.update(entry, fact);
        }, (previous, next) => { if (!this.stopped) source.advance(previous, next); });
        const entry: SessionEntry = { ...base, family: 'sessions', fact: observer.fact, stage: 'running' };
        this.install(entry); return observer;
    }
    reviewCollection(owner: string, kind: CollectionFact['collection'], action: CollectionAction, preferenceRequired: boolean, live: () => boolean): CollectionOperationTrace | null {
        if (!journalKind(kind) || !['start', 'stop'].includes(action) || typeof preferenceRequired !== 'boolean') return null;
        let sourceCurrent = true;
        const current = () => { sourceCurrent = sourceCurrent && collectionCurrent(live); return sourceCurrent; };
        const base = this.prepare(owner, { location: { route: 'privacy' }, label: null }, current); if (!base) return null;
        const observer = new CollectionObservations(kind, action, preferenceRequired, fact => {
            if (this.stopped) return;
            entry.fact = fact; entry.stage = fact.state; this.update(entry, fact);
        });
        const entry: CollectionEntry = { ...base, family: 'collection', fact: observer.fact, stage: 'reviewed' };
        this.install(entry); return observer;
    }
    reviewClear(owner: string, kind: ClearFact['collection'], live: () => boolean): ClearOperationTrace | null {
        if (!journalKind(kind)) return null;
        let sourceCurrent = true; const current = () => { sourceCurrent = sourceCurrent && collectionCurrent(live); return sourceCurrent; };
        const base = this.prepare(owner, { location: { route: 'privacy' }, label: null }, current); if (!base) return null;
        const observer = new ClearObservations(kind, fact => { if (!this.stopped) { entry.fact = fact; entry.stage = fact.state; this.update(entry, fact); } });
        const entry: ClearEntry = { ...base, family: 'clear', fact: observer.fact, stage: 'reviewed' };
        // Diagnostics deletion must not record itself, including under a stale secondary admission cache.
        this.install(entry, kind !== 'diagnostics'); return observer;
    }
    reviewPause(owner: string, intent: PauseReviewIntent, live: () => boolean): PauseOperationTrace | null {
        const action = pauseAction(intent); if (!action) return null;
        let sourceCurrent = true; const current = () => { sourceCurrent = sourceCurrent && collectionCurrent(live); return sourceCurrent; };
        const base = this.prepare(owner, { location: { route: 'repositories' }, label: null }, current); if (!base) return null;
        const observer = new PauseObservations(action, fact => { if (!this.stopped) { entry.fact = fact; entry.stage = fact.state; this.update(entry, fact); } });
        const entry: PauseEntry = { ...base, family: 'pauses', fact: observer.fact, stage: 'reviewed' };
        this.install(entry); return observer;
    }
    reviewApiCache(owner: string, live: () => boolean): ((state: ApiCacheFactState) => void) | null {
        let sourceCurrent = true; const current = () => { sourceCurrent = sourceCurrent && collectionCurrent(live); return sourceCurrent; };
        const base = this.prepare(owner, { location: { route: 'privacy' }, label: null }, current); if (!base) return null;
        const entry: ApiCacheEntry = { ...base, family: 'cache', fact: Object.freeze({ kind: 'cache-operation', action: 'clear-api-cache', state: 'reviewed' }), stage: 'reviewed' };
        this.install(entry);
        return state => {
            if (this.stopped || state === entry.fact.state) return;
            const fact: ApiCacheFact = Object.freeze({ kind: 'cache-operation', action: 'clear-api-cache', state });
            if (!apiCacheFactTransition(entry.fact, fact)) return;
            entry.fact = fact; entry.stage = state; this.update(entry, fact);
        };
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
        const common = { target: entry.target, sourceCurrent: current && live, firstObserved: entry.at, retention };
        const operation = entry.family === 'settings' ? { ...common, family: entry.family, stage: entry.stage, fact: entry.fact }
            : entry.family === 'sessions' ? { ...common, family: entry.family, stage: entry.stage, fact: entry.fact }
                : entry.family === 'collection' ? { ...common, family: entry.family, stage: entry.stage, fact: entry.fact }
                    : entry.family === 'clear' ? { ...common, family: entry.family, stage: entry.stage, fact: entry.fact }
                        : entry.family === 'pauses' ? { ...common, family: entry.family, stage: entry.stage, fact: entry.fact }
                            : { ...common, family: entry.family, stage: entry.stage, fact: entry.fact };
        return deepFreeze({ state: 'current', operation });
    }
    invalidate(): void { this.generation = {}; for (const entry of this.entries.values()) entry.target = null; this.entries.clear(); }
    stop(): void { this.stopped = true; this.invalidate(); }
}
