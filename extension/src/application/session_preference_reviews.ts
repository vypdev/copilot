import { copySessionPreferenceReviewIntent, sessionPreferenceEffective, type SessionPreferenceFacts, type SessionPreferencePreview,
    type SessionPreferenceResult, type SessionPreferenceReviewIntent, type SessionPreferenceReviewOutcome } from '../domain/session_preference_review.ts';
import { planSessionPreferences, sessionPreferenceRestriction, type SessionPreferences } from '../domain/session_preferences.ts';
import type { NativeSnapshotOutcome } from '../domain/native_snapshot_outcome.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import type { SettingsOwnerFence } from '../domain/settings_result.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { SessionPreferenceReviewPorts } from './session_preference_review_ports.ts';
import { sameSessionPreferenceReviewSource, type SessionPreferenceReviewSource } from './session_preference_sources.ts';
import type { SessionPreferencesStore } from './session_preferences_store.ts';
import type { ProtectedMutationTrace } from './protected_mutation.ts';
import type { SettingsMutationReservation } from './settings_mutation_queue.ts';

interface Bound { readonly owner: string; readonly fence: SettingsOwnerFence; readonly revision: number; readonly generation: number;
    readonly createdAt: number; readonly expiresAt: number; readonly source: () => boolean }
interface Pending extends Bound { readonly intent: SessionPreferenceReviewIntent; readonly before: SessionPreferences; readonly after: SessionPreferences;
    readonly witness: object; readonly snapshot: SessionPreferenceReviewSource; facts: { -readonly [K in keyof SessionPreferenceFacts]: SessionPreferenceFacts[K] } }
interface Running { readonly record: Pending; readonly promise: Promise<SessionPreferenceReviewOutcome> }
interface Completed extends Bound { readonly result: SessionPreferenceResult }
const TTL = 300_000;

/** Confirm only immutable server-retained effects. Completion drops snapshots, native targets and adoption witnesses. */
export class SessionPreferenceReviews {
    private preparing = 0;
    private generation = 0;
    private readonly pending = new Map<string, Pending>();
    private readonly running = new Map<string, Running>();
    private readonly completed = new Map<string, Completed>();
    constructor(private readonly store: SessionPreferencesStore, private readonly ports: SessionPreferenceReviewPorts) {}
    invalidate(): void { this.generation++; this.pending.clear(); this.completed.clear(); }
    private time(): number | null { try { const value = this.ports.now(); return natural(value) ? value : null; } catch { return null; } }
    private fence(owner: string): SettingsOwnerFence | null {
        try {
            if (!settingsOperationId(owner)) return null; const value = this.ports.fence(owner);
            return value && natural(value.controllerEpoch) && natural(value.credentialEpoch)
                ? { controllerEpoch: value.controllerEpoch, credentialEpoch: value.credentialEpoch } : null;
        } catch { return null; }
    }
    private current(value: Bound): boolean {
        const now = this.time(); const fence = this.fence(value.owner);
        try { return now !== null && now >= value.createdAt && now < value.expiresAt && value.source() === true && fence !== null
            && fence.controllerEpoch === value.fence.controllerEpoch && fence.credentialEpoch === value.fence.credentialEpoch && value.generation === this.generation; }
        catch { return false; }
    }
    private prune(now: number): void {
        for (const collection of [this.pending, this.completed]) for (const [id, value] of collection)
            if (now < value.createdAt || now >= value.expiresAt) collection.delete(id);
    }
    async preview(value: unknown, owner: string, expectedRevision: number): Promise<SessionPreferencePreview> {
        const now = this.time(); const fence = this.fence(owner); if (!fence) return { state: 'denied' };
        if (now === null || !natural(now + TTL)) return { state: 'unavailable' };
        const intent = copySessionPreferenceReviewIntent(value);
        if (!intent || !natural(expectedRevision)) return { state: 'invalid', reason: 'invalid-input' };
        this.prune(now); if (this.preparing + this.pending.size + this.running.size >= 16) return { state: 'busy' };
        this.preparing++; const generation = this.generation;
        try {
            const bound: Bound = { owner, fence, revision: expectedRevision, createdAt: now, expiresAt: now + TTL, generation, source: this.ports.captureSource() };
            const snapshot = await this.ports.readSource(() => this.current(bound)); if (!this.current(bound)) return { state: 'stale' };
            if (!snapshot) return { state: 'unavailable' };
            const inspection = await this.store.inspect(); if (!this.current(bound)) return { state: 'stale' };
            if (inspection.loaded.state !== 'ready') return { state: inspection.loaded.state };
            if (inspection.pending) return { state: 'busy' };
            const before = inspection.loaded.value; let after = before;
            if (before.revision !== expectedRevision) return { state: 'conflict' };
            if (intent.type === 'adopt-observed') { if (!inspection.precaution) return { state: 'unchanged' }; }
            else {
                if (inspection.precaution) return { state: 'precaution' };
                if (intent.type === 'replace' && (snapshot.settings?.state !== 'ready' || snapshot.binding.state !== 'ready' || snapshot.binding.context.verified !== true)) return { state: 'unverified' };
                const scope = snapshot.binding.state === 'ready' ? snapshot.binding.context.scope : null;
                const plan = planSessionPreferences(before, scope, intent, expectedRevision);
                if (plan.state === 'invalid') return plan.reason === 'conflict' ? { state: 'conflict' } : { state: 'invalid', reason: plan.reason };
                if (plan.state !== 'ready') return plan; after = plan.after;
            }
            const id = this.ports.identifier(); if (!this.current(bound)) return { state: 'stale' };
            if (!settingsOperationId(id) || this.pending.has(id) || this.running.has(id) || this.completed.has(id)) return { state: 'unavailable' };
            const record: Pending = { ...bound, intent, before, after, snapshot, witness: inspection.witness,
                facts: { attempt: 'unobserved', acknowledgement: null, observation: null } };
            const context = snapshot.binding.state === 'ready' ? snapshot.binding.context : null;
            const preview = deepFreeze({ state: 'preview' as const, operationId: id, revision: before.revision, expiresAt: bound.expiresAt, action: intent.type, before, after,
                settingsRevision: snapshot.settings?.state === 'ready' ? snapshot.settings.settings.revision : null,
                effectiveBefore: sessionPreferenceEffective(snapshot.settings, snapshot.binding, before), effectiveAfter: sessionPreferenceEffective(snapshot.settings, snapshot.binding, after),
                restrictionBefore: sessionPreferenceRestriction({ state: 'ready', value: before }, context), restrictionAfter: sessionPreferenceRestriction({ state: 'ready', value: after }, context),
                source: snapshot.binding.state === 'ready' && snapshot.binding.context.verified ? { name: snapshot.binding.name, account: snapshot.binding.account, repository: snapshot.binding.repository } : null,
                precautionBefore: inspection.precaution, precautionAfter: false as const });
            if (!this.current(record)) return { state: 'stale' };
            // No await follows collision admission. A reentrant source check can retire reviews,
            // but another preview cannot finish its asynchronous source acquisition in this turn.
            this.pending.set(id, record); return preview;
        } catch { return { state: 'unavailable' }; }
        finally { this.preparing--; }
    }
    private admit(id: string, revision: number, owner: string): Pending | Running | Completed | { readonly state: 'invalid' | 'unavailable' | 'expired' | 'denied' | 'stale' } {
        if (!settingsOperationId(id) || !natural(revision) || !settingsOperationId(owner)) return { state: 'invalid' };
        const now = this.time(); if (now === null) return { state: 'unavailable' }; this.prune(now);
        const running = this.running.get(id); const value = running?.record ?? this.pending.get(id) ?? this.completed.get(id);
        if (!value) return { state: 'expired' };
        if (value.owner !== owner || value.revision !== revision) return { state: 'denied' };
        if (!this.current(value)) return { state: 'stale' }; return running ?? value;
    }
    inspect(id: string, revision: number, owner: string): SessionPreferenceReviewOutcome {
        const value = this.admit(id, revision, owner); if ('state' in value) return value;
        return 'result' in value ? value.result : 'promise' in value ? deepFreeze({ state: 'pending', facts: { ...value.record.facts } }) : { state: 'not-submitted' };
    }
    confirm(id: string, revision: number, owner: string): Promise<SessionPreferenceReviewOutcome> {
        const value = this.admit(id, revision, owner); if ('state' in value) return Promise.resolve(value);
        if ('promise' in value) return value.promise; if ('result' in value) return Promise.resolve(value.result);
        const joined = this.running.get(id); if (joined) return joined.promise;
        if (this.pending.get(id) !== value) return Promise.resolve({ state: 'stale' });
        this.pending.delete(id);
        let resolve!: (outcome: SessionPreferenceReviewOutcome) => void;
        const promise = new Promise<SessionPreferenceReviewOutcome>(done => { resolve = done; }); this.running.set(id, { record: value, promise });
        void this.execute(value).then(outcome => resolve(this.finish(id, value, outcome))); return promise;
    }
    cancel(id: string, revision: number, owner: string): SessionPreferenceReviewOutcome {
        const value = this.admit(id, revision, owner); if ('state' in value) return value;
        if ('promise' in value) return deepFreeze({ state: 'pending', facts: { ...value.record.facts } });
        if ('result' in value) return value.result;
        if (this.pending.get(id) !== value) return { state: 'stale' };
        this.pending.delete(id); return this.finish(id, value, { state: 'cancelled' });
    }
    private async execute(value: Pending): Promise<NativeSnapshotOutcome> {
        let applying = false; let attempted = false;
        let reservation: SettingsMutationReservation | null = null; let reserved = false;
        const current = () => this.current(value) && (!reserved || reservation!.current()) && (attempted || value.intent.type === 'adopt-observed' || !this.store.guard.uncertain);
        const preflight = async () => { const source = await this.ports.readSource(current); return source !== null && sameSessionPreferenceReviewSource(value.snapshot, source) && current(); };
        const trace: ProtectedMutationTrace = { submitted: () => { attempted = true; value.facts.attempt = 'submitted'; },
            acknowledged: acknowledgement => { value.facts.acknowledgement = acknowledgement; }, settled: fact => { value.facts.observation = fact.observation; } };
        try {
            if (!current()) return { state: 'stale' };
            reservation = this.ports.reserveSettings(); if (!reservation) return { state: 'busy' }; reserved = true;
            if (!current()) return { state: 'stale' }; applying = true;
            return await (value.intent.type === 'adopt-observed' ? this.store.reconcile(value.before, value.witness, current, preflight)
                : this.store.commit(value.before, value.after, current, preflight, trace));
        } catch {
            if (!applying) return { state: 'unavailable' };
            this.store.protectUnknown(); return value.intent.type === 'adopt-observed' ? { state: 'unavailable' }
                : { state: 'unknown', acknowledgement: value.facts.acknowledgement ?? 'unknown', observation: 'unavailable', observedRevision: null, current: this.current(value) };
        } finally { reservation?.release(); }
    }
    private finish(id: string, value: Pending, outcome: NativeSnapshotOutcome | { readonly state: 'cancelled' }): SessionPreferenceResult {
        const result: SessionPreferenceResult = deepFreeze({ state: 'result', outcome: 'current' in outcome ? { ...outcome, current: outcome.current && this.current(value) } : outcome, facts: { ...value.facts } });
        const now = this.time();
        if (now !== null && natural(now + TTL)) {
            this.prune(now); this.completed.set(id, { owner: value.owner, fence: value.fence, revision: value.revision, generation: value.generation,
                source: value.source, createdAt: now, expiresAt: now + TTL, result });
            if (this.completed.size > 32) this.completed.delete(this.completed.keys().next().value!);
        }
        this.running.delete(id); return result;
    }
}
