import type { CollectionAction, CollectionOutcome, CollectionPreview, CollectionReviewIssue } from '../domain/collection_review.ts';
import { journalKind, type JournalKind } from '../domain/journal_facts.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import type { SettingsOwnerFence } from '../domain/settings_result.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { CollectionCoordinator } from './collection_coordinator.ts';
import type { CollectionPolicyStore } from './collection_policy_ports.ts';
import { executeCollectionPlan, type CollectionEffectPlan } from './collection_effects.ts';
import type { SettingsRepository } from './settings_repository.ts';

export interface CollectionReviewPorts { now(): number; identifier(): string; fence(owner: string): SettingsOwnerFence | null }
interface Pending extends CollectionEffectPlan {
    readonly owner: string; readonly fence: SettingsOwnerFence; readonly createdAt: number; readonly expiresAt: number; readonly generation: number;
}
interface Completed extends Omit<Pending, 'before' | 'capture'> { readonly result: CollectionOutcome }
interface Running { readonly record: Pending; readonly promise: Promise<CollectionOutcome> }
const TTL = 300_000;

/** Review IDs select retained plans; policy nonces and ownership witnesses remain background-only. */
export class CollectionReviews {
    private readonly pending = new Map<string, Pending>();
    private readonly completed = new Map<string, Completed>();
    private readonly running = new Map<string, Running>();
    private generation = 0;
    constructor(private readonly repository: SettingsRepository, private readonly coordinator: CollectionCoordinator,
        private readonly policies: CollectionPolicyStore, private readonly ports: CollectionReviewPorts) {}
    invalidate(): void { this.generation++; this.pending.clear(); this.completed.clear(); }
    private time(): number | null { try { const now = this.ports.now(); return natural(now) ? now : null; } catch { return null; } }
    private fence(owner: string): SettingsOwnerFence | null {
        if (!settingsOperationId(owner)) return null;
        try {
            const value = this.ports.fence(owner);
            return value && natural(value.controllerEpoch) && natural(value.credentialEpoch) ? { ...value } : null;
        } catch { return null; }
    }
    private current(record: Pick<Pending, 'owner' | 'fence' | 'createdAt' | 'expiresAt' | 'generation'>): boolean {
        const now = this.time(); const fence = this.fence(record.owner);
        return now !== null && now >= record.createdAt && now < record.expiresAt && record.generation === this.generation && fence !== null
            && fence.controllerEpoch === record.fence.controllerEpoch && fence.credentialEpoch === record.fence.credentialEpoch;
    }
    private prune(now: number): void {
        for (const map of [this.pending, this.completed]) for (const [id, value] of map) if (now < value.createdAt || now >= value.expiresAt) map.delete(id);
    }
    private used(id: string): boolean {
        return [...this.pending.values(), ...this.completed.values(), ...Array.from(this.running.values(), value => value.record)]
            .some(value => value.id === id || value.policyId === id);
    }
    async preview(kind: JournalKind, action: CollectionAction, owner: string): Promise<CollectionPreview> {
        if (!journalKind(kind) || (action !== 'start' && action !== 'stop')) return { state: 'invalid' };
        const now = this.time(); const fence = this.fence(owner);
        if (!fence) return { state: 'denied' };
        if (now === null || !natural(now + TTL)) return { state: 'unavailable' };
        this.prune(now); if (this.pending.size + this.running.size >= 16) return { state: 'busy' };
        const bound = { owner, fence, createdAt: now, expiresAt: now + TTL, generation: this.generation };
        try {
            const inspected = await this.repository.inspect();
            if (!this.current(bound)) return { state: 'stale' };
            if (inspected.loaded.state !== 'ready') return { state: inspected.loaded.state === 'future' ? 'future' : 'corrupt' };
            if (inspected.loaded.migrated) return { state: 'migration-required' };
            const before = inspected.loaded.settings;
            if (action === 'start' && before.paused) return { state: 'globally-paused' };
            await this.coordinator.refresh(); if (!this.current(bound)) return { state: 'stale' };
            const capture = this.coordinator.capture(kind, action === 'stop'); const view = this.coordinator.state(kind);
            if (!capture) return { state: view.policy === 'future' || view.policy === 'corrupt' || view.policy === 'unavailable' ? view.policy
                : !this.coordinator.idle(kind) ? 'busy' : 'pause-unconfirmed' };
            if (capture.settingsRevision !== before.revision) return { state: 'conflict' };
            const steps = !before.center[kind] && capture.policy?.mode === 'active' ? 2 : 1;
            if (action === 'start' && ((!before.center[kind] && before.revision === Number.MAX_SAFE_INTEGER)
                || (capture.policy && capture.policy.revision >= Number.MAX_SAFE_INTEGER - steps))) return { state: 'exhausted' };
            if (action === 'start' && view.collecting) return { state: 'unchanged' };
            if (action === 'stop' && !before.center[kind] && capture.policy?.mode === 'paused') return { state: 'unchanged' };
            const id = this.ports.identifier(); const policyId = this.ports.identifier();
            if (!settingsOperationId(id) || !settingsOperationId(policyId) || id === policyId || this.used(id) || this.used(policyId)
                || inspected.operation?.id === id || capture.policy?.receipt?.id === policyId) return { state: 'unavailable' };
            if (this.pending.size + this.running.size >= 16) return { state: 'busy' };
            if (!this.current(bound)) return { state: 'stale' };
            this.pending.set(id, { ...bound, id, policyId, kind, action, before, capture });
            return deepFreeze({ state: 'preview', operationId: id, kind, action, settingsRevision: before.revision,
                policyRevision: capture.policy?.revision ?? null, preferenceBefore: before.center[kind], preferenceAfter: action === 'start',
                policyBefore: capture.policy?.mode ?? 'unknown', policyAfter: action === 'start' ? 'active' : 'paused', expiresAt: bound.expiresAt });
        } catch { return { state: 'unavailable' }; }
    }
    confirm(id: string, owner: string): Promise<CollectionOutcome> {
        const record = this.admit(id, owner);
        if ('state' in record) return Promise.resolve(record);
        if ('promise' in record) return record.promise;
        if ('result' in record) return Promise.resolve(record.result);
        this.pending.delete(id);
        let prePaused: object | null = null;
        const promise = Promise.resolve().then(() => executeCollectionPlan(record, this.repository, this.coordinator, this.policies,
            () => this.current(record), prePaused)).then(result => {
            const now = this.time();
            if (now !== null && natural(now + TTL)) {
                const { before: _before, capture: _capture, ...retained } = record;
                this.completed.set(id, { ...retained, createdAt: now, expiresAt: now + TTL, result: deepFreeze(result) });
                if (this.completed.size > 32) this.completed.delete(this.completed.keys().next().value!);
            }
            return result;
        }).finally(() => { this.running.delete(id); });
        this.running.set(id, { record, promise });
        if (record.action === 'stop') prePaused = this.coordinator.pause(record.kind);
        return promise;
    }
    cancel(id: string, owner: string): CollectionOutcome {
        const record = this.admit(id, owner); if ('state' in record) return record;
        if ('promise' in record) return { state: 'pending' };
        if ('result' in record) return record.result;
        this.pending.delete(id); return { state: 'cancelled' };
    }
    private admit(id: string, owner: string): Pending | Completed | Running | { readonly state: CollectionReviewIssue } {
        if (!settingsOperationId(id) || !settingsOperationId(owner)) return { state: 'invalid' };
        const now = this.time(); if (now === null) return { state: 'unavailable' }; this.prune(now);
        const running = this.running.get(id); const record = running?.record ?? this.pending.get(id) ?? this.completed.get(id);
        if (!record) return { state: 'expired' };
        if (record.owner !== owner) return { state: 'denied' };
        if (!this.current(record)) return { state: 'stale' };
        return running ?? record;
    }
}
