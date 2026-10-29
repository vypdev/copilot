import { journalKind, type JournalKind } from '../domain/journal_facts.ts';
import { validJournalSnapshot, type JournalResult } from '../domain/local_journal.ts';
import type { JournalClearOutcome, JournalClearPreview, JournalClearIssue } from '../domain/journal_clear.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import type { SettingsOwnerFence } from '../domain/settings_result.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { JournalStore } from './journal_ports.ts';
import type { SettingsRepository } from './settings_repository.ts';

export interface JournalReviewPorts {
    now(): number; identifier(): string; fence(owner: string): SettingsOwnerFence | null;
    idle(kind: JournalKind): boolean;
    /** Current verified paused policy revision; unknown/active policy cannot authorize a clear. */
    pausedPolicyRevision(kind: JournalKind): number | null;
    /** Shared owner reserves known-paused consent at this settings revision; blocks new admission/consent writes until released. */
    reserve(kind: JournalKind, settingsRevision: number, policyRevision: number): { current(): boolean; release(): void } | null;
}
interface Clear {
    readonly owner: string; readonly kind: JournalKind; readonly epoch: number; readonly revision: number;
    readonly settingsRevision: number; readonly policyRevision: number; readonly createdAt: number; readonly expiresAt: number;
    readonly generation: number; readonly fence: SettingsOwnerFence;
}
interface Completed extends Clear { readonly result: JournalClearOutcome }
interface Running { readonly record: Clear; readonly promise: Promise<JournalClearOutcome> }
const TTL = 300_000;

/** Fixed-scope reviewed deletion; independent from preference writes and from generated-data admission. */
export class JournalReviews {
    private readonly pending = new Map<string, Clear>();
    private readonly completed = new Map<string, Completed>();
    private readonly running = new Map<string, Running>();
    private generation = 0;
    constructor(private readonly store: JournalStore, private readonly settings: Pick<SettingsRepository, 'inspect' | 'reserveMutations'>,
        private readonly ports: JournalReviewPorts) {}
    invalidate(): void { this.generation++; this.pending.clear(); this.completed.clear(); }
    private time(): number | null { try { const now = this.ports.now(); return natural(now) ? now : null; } catch { return null; } }
    private fence(owner: string): SettingsOwnerFence | null {
        if (!settingsOperationId(owner)) return null;
        try {
            const fence = this.ports.fence(owner);
            return fence && natural(fence.controllerEpoch) && natural(fence.credentialEpoch) ? { ...fence } : null;
        } catch { return null; }
    }
    private idle(kind: JournalKind): boolean { try { return this.ports.idle(kind) === true; } catch { return false; } }
    private current(record: Pick<Clear, 'owner' | 'createdAt' | 'expiresAt' | 'generation' | 'fence'>): boolean {
        const now = this.time(); const fence = this.fence(record.owner);
        return now !== null && now >= record.createdAt && now < record.expiresAt && record.generation === this.generation
            && fence !== null && fence.controllerEpoch === record.fence.controllerEpoch && fence.credentialEpoch === record.fence.credentialEpoch;
    }
    private prune(now: number): void {
        for (const map of [this.pending, this.completed]) for (const [id, record] of map) {
            if (now < record.createdAt || now >= record.expiresAt) map.delete(id);
        }
    }
    private async paused(kind: JournalKind): Promise<{ readonly revision: number; readonly policyRevision: number } | { readonly issue: JournalClearIssue }> {
        const { loaded } = await this.settings.inspect();
        if (loaded.state !== 'ready') return { issue: loaded.state === 'future' ? 'future' : 'corrupt' };
        if (loaded.migrated) return { issue: 'migration-required' };
        if (loaded.settings.center[kind]) return { issue: 'collection-active' };
        const policyRevision = this.ports.pausedPolicyRevision(kind);
        return natural(policyRevision) ? { revision: loaded.settings.revision, policyRevision } : { issue: 'unavailable' };
    }
    async preview(kind: JournalKind, owner: string): Promise<JournalClearPreview> {
        if (!journalKind(kind)) return { state: 'invalid' };
        const now = this.time(); const fence = this.fence(owner);
        if (!fence) return { state: 'denied' };
        if (now === null || !natural(now + TTL)) return { state: 'unavailable' };
        this.prune(now);
        if (this.pending.size + this.running.size >= 16 || !this.idle(kind)) return { state: 'busy' };
        const bound = { owner, fence, createdAt: now, expiresAt: now + TTL, generation: this.generation };
        try {
            const privacy = await this.paused(kind);
            if (!this.current(bound)) return { state: 'stale' };
            if ('issue' in privacy) return { state: privacy.issue };
            const result = await this.store.execute(kind, { type: 'read', now });
            if (!this.current(bound)) return { state: 'stale' };
            if (result.state !== 'ready') return { state: result.state === 'unavailable' ? 'unavailable'
                : ['future', 'corrupt', 'clock-invalid', 'exhausted'].includes(result.state) ? result.state as JournalClearIssue : 'unavailable' };
            if (!validJournalSnapshot(kind, result.snapshot)) return { state: 'unavailable' };
            const rechecked = await this.paused(kind);
            if (!this.current(bound)) return { state: 'stale' };
            if ('issue' in rechecked) return { state: rechecked.issue };
            if (rechecked.revision !== privacy.revision || rechecked.policyRevision !== privacy.policyRevision) return { state: 'stale' };
            if (!this.idle(kind) || this.pending.size + this.running.size >= 16) return { state: 'busy' };
            const id = this.ports.identifier();
            if (!settingsOperationId(id) || this.pending.has(id) || this.running.has(id) || this.completed.has(id)) return { state: 'unavailable' };
            if (!this.current(bound)) return { state: 'stale' };
            this.pending.set(id, { ...bound, kind, epoch: result.snapshot.epoch, revision: result.snapshot.revision,
                settingsRevision: privacy.revision, policyRevision: privacy.policyRevision });
            return deepFreeze({ state: 'preview', operationId: id, kind, epoch: result.snapshot.epoch,
                revision: result.snapshot.revision, policyRevision: privacy.policyRevision, entries: result.snapshot.entries.length, expiresAt: bound.expiresAt });
        } catch { return { state: 'unavailable' }; }
    }
    confirm(id: string, owner: string): Promise<JournalClearOutcome> {
        const admitted = this.admit(id, owner);
        if ('state' in admitted) return Promise.resolve(admitted);
        if ('promise' in admitted) return admitted.promise;
        if ('result' in admitted) return Promise.resolve(admitted.result);
        this.pending.delete(id);
        const promise = this.apply(admitted).then(result => {
            const now = this.time();
            if (now !== null && natural(now + TTL)) {
                this.completed.set(id, { ...admitted, createdAt: now, expiresAt: now + TTL, result: deepFreeze(result) });
                if (this.completed.size > 32) this.completed.delete(this.completed.keys().next().value!);
            }
            return result;
        }).finally(() => { this.running.delete(id); });
        this.running.set(id, { record: admitted, promise }); return promise;
    }
    cancel(id: string, owner: string): JournalClearOutcome {
        const admitted = this.admit(id, owner);
        if ('state' in admitted) return admitted;
        if ('promise' in admitted) return { state: 'pending' };
        if ('result' in admitted) return admitted.result;
        this.pending.delete(id); return { state: 'cancelled' };
    }
    private admit(id: string, owner: string): Clear | Completed | Running | { readonly state: JournalClearIssue } {
        if (!settingsOperationId(id) || !settingsOperationId(owner)) return { state: 'invalid' };
        const now = this.time(); if (now === null) return { state: 'unavailable' };
        this.prune(now);
        const running = this.running.get(id); const record = running?.record ?? this.pending.get(id) ?? this.completed.get(id);
        if (!record) return { state: 'expired' };
        if (record.owner !== owner) return { state: 'denied' };
        if (!this.current(record)) return { state: 'stale' };
        return running ?? record;
    }
    private async apply(record: Clear): Promise<JournalClearOutcome> {
        try {
            const preferences = this.settings.reserveMutations();
            if (!preferences) return { state: 'busy' };
            try {
                const lease = this.ports.reserve(record.kind, record.settingsRevision, record.policyRevision);
                if (!lease) return { state: 'busy' };
                const current = () => { try { return preferences.current() && lease.current() === true && this.current(record); } catch { return false; } };
                try { return await this.clear(record, current); }
                finally { try { lease.release(); } catch { /* Cleanup does not erase an observed native outcome. */ } }
            } finally { try { preferences.release(); } catch { /* Preference cleanup cannot erase a terminal effect fact. */ } }
        } catch { return { state: 'unavailable' }; }
    }
    private async clear(record: Clear, current: () => boolean): Promise<JournalClearOutcome> {
        let privacy: Awaited<ReturnType<JournalReviews['paused']>>;
        try { privacy = await this.paused(record.kind); } catch { return { state: 'unavailable' }; }
        if (!current()) return { state: 'stale' };
        if ('issue' in privacy) return { state: privacy.issue };
        if (privacy.revision !== record.settingsRevision || privacy.policyRevision !== record.policyRevision) return { state: 'stale' };
        if (!this.idle(record.kind)) return { state: 'busy' };
        const now = this.time(); if (now === null) return { state: 'unavailable' };
        let result: JournalResult;
        try { result = await this.store.execute(record.kind, { type: 'clear', now, epoch: record.epoch, revision: record.revision }, current, record.policyRevision); }
        catch { result = { state: 'unavailable', effect: 'unknown' }; }
        if (result.state === 'unavailable' && result.effect !== 'unknown') return { state: 'not-applied', reason: result.effect };
        if (result.state !== 'written' && result.state !== 'unavailable') {
            return { state: ['stale', 'invalid', 'future', 'corrupt', 'clock-invalid', 'exhausted', 'collection-active'].includes(result.state)
                ? result.state as JournalClearIssue : 'unavailable' };
        }
        const acknowledgement = result.state === 'written' ? 'accepted' as const : 'unknown' as const;
        const observed = await this.observe(record);
        return { ...observed, acknowledgement, sourceCurrentAtObservation: current() };
    }
    private async observe(record: Clear): Promise<{ state: 'observed-cleared'; epoch: number; revision: number }
        | { state: 'unknown'; observation: 'unavailable' | 'changed' }> {
        try {
            const now = this.time(); if (now === null) return { state: 'unknown', observation: 'unavailable' };
            const read = await this.store.execute(record.kind, { type: 'read', now });
            if (read.state !== 'ready' || !validJournalSnapshot(record.kind, read.snapshot)) return { state: 'unknown', observation: 'unavailable' };
            return read.snapshot.epoch === record.epoch + 1 && read.snapshot.revision === record.revision + 1 && read.snapshot.entries.length === 0
                ? { state: 'observed-cleared', epoch: read.snapshot.epoch, revision: read.snapshot.revision }
                : { state: 'unknown', observation: 'changed' };
        } catch { return { state: 'unknown', observation: 'unavailable' }; }
    }
}
