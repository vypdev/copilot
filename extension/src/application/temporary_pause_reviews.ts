import { copyPauseReviewIntent, type PauseReviewIntent, type PauseReviewOutcome, type PauseReviewPreview, type PauseReviewTarget } from '../domain/temporary_pause_review.ts';
import { planTemporaryPauseChange, type TemporaryPauses } from '../domain/temporary_pauses.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import type { SettingsOwnerFence } from '../domain/settings_result.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { NativePauseTarget, PauseReviewPorts } from './temporary_pause_review_ports.ts';
import type { TemporaryPauseStore } from './temporary_pause_store.ts';
import { reportPause, completePause, type PauseOperationTrace } from './pause_observation_ports.ts';

interface Bound { readonly owner: string; readonly fence: SettingsOwnerFence; readonly revision: number;
    readonly createdAt: number; readonly expiresAt: number; readonly generation: number }
interface Retirement { retired: boolean }
interface Preparing extends Bound { readonly intent: PauseReviewIntent; readonly retirement: Retirement }
interface Pending extends Preparing {
    readonly before: TemporaryPauses; readonly after: TemporaryPauses;
    readonly witness: object; readonly target: NativePauseTarget | null;
    trace: PauseOperationTrace | null;
}
interface Completed extends Bound { readonly result: PauseReviewOutcome }
interface Running { readonly record: Pending; readonly promise: Promise<PauseReviewOutcome> }
const TTL = 300_000;

/** Native clients confirm opaque IDs selecting immutable server-retained plans, never caller-provided effects. */
export class TemporaryPauseReviews {
    private readonly preparing = new Set<Preparing>();
    private readonly pending = new Map<string, Pending>();
    private readonly running = new Map<string, Running>();
    private readonly completed = new Map<string, Completed>();
    private generation = 0;
    constructor(private readonly store: TemporaryPauseStore, private readonly ports: PauseReviewPorts) {}
    invalidate(): void { this.generation++; this.pending.clear(); this.completed.clear(); }
    invalidateTab(tabId: number): void {
        if (!natural(tabId)) return;
        for (const value of this.preparing) if (value.intent.type === 'tab' && value.intent.tabId === tabId) value.retirement.retired = true;
        for (const [id, value] of this.pending) if (value.intent.type === 'tab' && value.intent.tabId === tabId) {
            value.retirement.retired = true; this.pending.delete(id);
        }
        for (const { record } of this.running.values()) if (record.intent.type === 'tab' && record.intent.tabId === tabId) record.retirement.retired = true;
    }
    private time(): number | null { try { const now = this.ports.now(); return natural(now) ? now : null; } catch { return null; } }
    private fence(owner: string): SettingsOwnerFence | null {
        if (!settingsOperationId(owner)) return null;
        try {
            const value = this.ports.fence(owner);
            return value && natural(value.controllerEpoch) && natural(value.credentialEpoch) ? { ...value } : null;
        } catch { return null; }
    }
    private current(value: Bound & { readonly retirement?: Retirement }): boolean {
        const now = this.time(); const fence = this.fence(value.owner);
        return !value.retirement?.retired && now !== null && now >= value.createdAt && now < value.expiresAt && value.generation === this.generation
            && fence !== null && fence.controllerEpoch === value.fence.controllerEpoch && fence.credentialEpoch === value.fence.credentialEpoch;
    }
    private observerCurrent(source: Bound & { readonly retirement: Retirement }): () => boolean {
        // A separate closure scope never contains preview snapshots, native paths, intents or guard witnesses.
        return () => this.current(source);
    }
    private prune(now: number): void {
        for (const [id, value] of this.pending) if (now < value.createdAt || now >= value.expiresAt) this.pending.delete(id);
        for (const [id, value] of this.completed) if (now < value.createdAt || now >= value.expiresAt) this.completed.delete(id);
    }
    async preview(value: unknown, owner: string, expectedRevision: number): Promise<PauseReviewPreview> {
        const now = this.time(); const fence = this.fence(owner);
        if (!fence) return { state: 'denied' };
        if (now === null || !natural(now + TTL)) return { state: 'unavailable' };
        const intent = copyPauseReviewIntent(value);
        if (!intent || !natural(expectedRevision)) return { state: 'invalid', reason: 'invalid-input' };
        this.prune(now); if (this.preparing.size + this.pending.size + this.running.size >= 16) return { state: 'busy' };
        const bound: Preparing = { owner, fence, intent, retirement: { retired: false }, revision: expectedRevision, createdAt: now, expiresAt: now + TTL, generation: this.generation };
        this.preparing.add(bound);
        try {
            const inspection = await this.store.inspect(); if (!this.current(bound)) return { state: 'stale' };
            if (inspection.loaded.state !== 'ready') return { state: inspection.loaded.state };
            if (inspection.pending) return { state: 'busy' };
            const before = inspection.loaded.value;
            let after = before; let target: NativePauseTarget | null = null;
            if (intent.type === 'adopt-observed') {
                if (before.revision !== expectedRevision) return { state: 'conflict' };
                if (!inspection.precaution) return { state: 'unchanged' };
            }
            else {
                const plan = planTemporaryPauseChange(before, intent, expectedRevision);
                if (plan.state === 'invalid') return plan.reason === 'conflict' ? { state: 'conflict' } : { state: 'invalid', reason: plan.reason };
                if (!intent.paused && inspection.precaution) return { state: 'precaution' };
                if (plan.state !== 'ready') return plan;
                after = plan.after;
                if (intent.type === 'tab') {
                    const native = await this.ports.target(intent.tabId); if (!this.current(bound)) return { state: 'stale' };
                    if (native && native.tabId !== intent.tabId) return { state: 'unavailable' };
                    if (native) target = { tabId: native.tabId, source: native.source, label: native.label };
                    if (intent.paused && !target) return { state: 'unavailable' };
                }
            }
            const id = this.ports.identifier();
            if (!settingsOperationId(id) || this.pending.has(id) || this.running.has(id) || this.completed.has(id)) return { state: 'unavailable' };
            if (!this.current(bound)) return { state: 'stale' };
            const retained: Pending = { ...bound, before, after, witness: inspection.witness, target: target ? deepFreeze(target) : null, trace: null };
            this.preparing.delete(bound);
            this.pending.set(id, retained);
            // Retain only source liveness. An optional observer must not keep the native plan/source/witness alive after completion.
            const { revision, createdAt, expiresAt, generation, retirement } = bound;
            const source = { owner, fence, revision, createdAt, expiresAt, generation, retirement };
            try { retained.trace = this.ports.observe?.(owner, intent, this.observerCurrent(source)) ?? null; }
            catch { /* Missing optional observation never authorizes or blocks a native operation. */ }
            if (!this.current(retained) || this.pending.get(id) !== retained) {
                if (this.pending.get(id) === retained) this.pending.delete(id);
                return { state: 'stale' };
            }
            const publicTarget: PauseReviewTarget = intent.type === 'adopt-observed' ? { kind: 'precaution' }
                : intent.type === 'emergency' ? { kind: 'emergency' } : { kind: 'tab', tabId: intent.tabId, label: target?.label ?? null };
            return deepFreeze({ state: 'preview', operationId: id, revision: before.revision, expiresAt: bound.expiresAt,
                action: intent.type === 'adopt-observed' ? 'adopt-observed' : 'change', before, after, precautionBefore: inspection.precaution,
                precautionAfter: intent.type === 'adopt-observed' ? false : inspection.precaution, target: publicTarget });
        } catch { return { state: 'unavailable' }; }
        finally { this.preparing.delete(bound); }
    }
    private admit(id: string, revision: number, owner: string): Pending | Completed | Running | { readonly state: 'invalid' | 'unavailable' | 'expired' | 'denied' | 'stale' } {
        if (!settingsOperationId(id) || !natural(revision) || !settingsOperationId(owner)) return { state: 'invalid' };
        const now = this.time(); if (now === null) return { state: 'unavailable' }; this.prune(now);
        const running = this.running.get(id); const value = running?.record ?? this.pending.get(id) ?? this.completed.get(id);
        if (!value) return { state: 'expired' };
        if (value.owner !== owner || value.revision !== revision) return { state: 'denied' };
        if (!this.current(value)) return { state: 'stale' };
        return running ?? value;
    }
    inspect(id: string, revision: number, owner: string): PauseReviewOutcome {
        const value = this.admit(id, revision, owner); if ('state' in value) return value;
        return 'result' in value ? value.result : { state: 'promise' in value ? 'pending' : 'not-submitted' };
    }
    confirm(id: string, revision: number, owner: string): Promise<PauseReviewOutcome> {
        const value = this.admit(id, revision, owner); if ('state' in value) return Promise.resolve(value);
        if ('promise' in value) return value.promise;
        if ('result' in value) return Promise.resolve(value.result);
        this.pending.delete(id);
        let resolve!: (outcome: PauseReviewOutcome) => void;
        const promise = new Promise<PauseReviewOutcome>(done => { resolve = done; }); this.running.set(id, { record: value, promise });
        // Register before execute: an emergency reserves its native precaution synchronously and may notify immediately.
        reportPause(value.trace, 'confirming');
        void this.execute(value).then(result => { resolve(this.finish(id, value, result)); }); return promise;
    }
    cancel(id: string, revision: number, owner: string): PauseReviewOutcome {
        const value = this.admit(id, revision, owner); if ('state' in value) return value;
        if ('promise' in value) return { state: 'pending' };
        if ('result' in value) return value.result;
        this.pending.delete(id); reportPause(value.trace, 'cancelled'); return this.finish(id, value, { state: 'cancelled' });
    }
    private async execute(value: Pending): Promise<PauseReviewOutcome> {
        let applying = false;
        try {
            if (!this.current(value)) return { state: 'stale' };
            if (value.intent.type === 'tab' && value.target) {
                const target = await this.ports.target(value.intent.tabId);
                if (!this.current(value)) return { state: 'stale' };
                if (!target || target.tabId !== value.intent.tabId || target.source !== value.target.source) return { state: 'conflict' };
            }
            applying = true;
            return await (value.intent.type === 'adopt-observed' ? this.store.reconcile(value.before, value.witness, () => this.current(value))
                : this.store.commit(value.before, value.after, () => this.current(value), value.trace));
        } catch {
            if (!applying) return { state: 'unavailable' };
            this.store.protectUnknown();
            return value.intent.type === 'adopt-observed' ? { state: 'unavailable' }
                : { state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null, current: this.current(value) };
        }
    }
    private finish(id: string, value: Pending, result: PauseReviewOutcome): PauseReviewOutcome {
        const now = this.time();
        // Native effects stay factual; publication must not preserve authority retired after the primitive returned.
        const observed = deepFreeze('current' in result ? { ...result, current: now !== null && result.current && this.current(value) } : result);
        completePause(value.trace, observed);
        const published = deepFreeze('current' in observed ? { ...observed, current: observed.current && this.current(value) } : observed);
        if (now !== null && natural(now + TTL)) {
            this.prune(now);
            this.completed.set(id, { owner: value.owner, fence: value.fence, revision: value.revision,
                generation: value.generation, createdAt: now, expiresAt: now + TTL, result: published });
            if (this.completed.size > 32) this.completed.delete(this.completed.keys().next().value!);
        }
        this.running.delete(id);
        return published;
    }
}
