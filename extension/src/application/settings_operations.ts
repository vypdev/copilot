import { planSettingsChange, MAX_CENTER_REQUEST_BYTES } from '../domain/settings_change.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import { deepFreeze, jsonBytesWithin, natural, record } from '../domain/value.ts';
import type { Settings } from '../domain/settings.ts';
import { SettingsRepository } from './settings_repository.ts';
import type { SettingsOperationOutcome, SettingsOperationPorts, SettingsOwnerFence, SettingsPreview } from './settings_transaction_ports.ts';

interface Pending {
    readonly owner: string; readonly revision: number; readonly before: Settings; readonly after: Settings;
    readonly fence: SettingsOwnerFence; readonly createdAt: number; readonly expiresAt: number; readonly generation: number;
}
interface Completed extends Omit<Pending, 'before' | 'after'> { readonly result: SettingsOperationOutcome }
interface Running { readonly owner: string; readonly revision: number; readonly result: Promise<SettingsOperationOutcome> }
const PREVIEW_TTL = 300_000;

/** Background-owned previews; browser views receive copies and can confirm only the retained exact plan. */
export class SettingsOperations {
    private readonly pending = new Map<string, Pending>();
    private readonly completed = new Map<string, Completed>();
    private readonly running = new Map<string, Running>();
    private generation = 0;
    constructor(private readonly repository: SettingsRepository, private readonly ports: SettingsOperationPorts) {}
    invalidate(): void { this.generation++; this.pending.clear(); this.completed.clear(); }
    private time(): number | null {
        try { const now = this.ports.now(); return natural(now) ? now : null; } catch { return null; }
    }
    private fence(owner: string): SettingsOwnerFence | null {
        if (!settingsOperationId(owner)) return null;
        try {
            const fence = this.ports.fence(owner);
            return fence && natural(fence.controllerEpoch) && natural(fence.credentialEpoch) ? { ...fence } : null;
        } catch { return null; }
    }
    private current(record: Omit<Pending, 'before' | 'after' | 'revision'>): boolean {
        const now = this.time(); const fence = this.fence(record.owner);
        return now !== null && now >= record.createdAt && now < record.expiresAt && record.generation === this.generation
            && fence !== null && fence.controllerEpoch === record.fence.controllerEpoch && fence.credentialEpoch === record.fence.credentialEpoch;
    }
    private prune(now: number): void {
        for (const map of [this.pending, this.completed]) for (const [id, record] of map) {
            if (now < record.createdAt || now >= record.expiresAt) map.delete(id);
        }
    }
    async preview(intent: unknown, owner: string, expectedRevision?: number): Promise<SettingsPreview> {
        if (expectedRevision !== undefined && !natural(expectedRevision)) return { state: 'invalid', reason: 'invalid-input' };
        const now = this.time(); const fence = this.fence(owner);
        if (!fence) return { state: 'denied' };
        if (now === null || !natural(now + PREVIEW_TTL)) return { state: 'unavailable' };
        this.prune(now);
        if (this.pending.size + this.running.size >= 16) return { state: 'busy' };
        const generation = this.generation;
        const bound = { owner, fence, generation, createdAt: now, expiresAt: now + PREVIEW_TTL };
        try {
            if (!record(intent) || !jsonBytesWithin(intent, MAX_CENTER_REQUEST_BYTES)) return { state: 'invalid', reason: 'invalid-input' };
            const input: unknown = JSON.parse(JSON.stringify(intent));
            const inspected = await this.repository.inspect();
            if (!this.current(bound)) return { state: 'stale' };
            if (inspected.loaded.state !== 'ready') return { state: inspected.loaded.state === 'future' ? 'future' : 'corrupt' };
            if (inspected.loaded.migrated) return { state: 'migration-required' };
            const before = inspected.loaded.settings;
            if (expectedRevision !== undefined && before.revision !== expectedRevision) return { state: 'conflict' };
            const plan = planSettingsChange(before, input, inspected.rollback);
            if (plan.state !== 'ready') return plan;
            const id = this.ports.identifier();
            if (!settingsOperationId(id) || this.pending.has(id) || this.running.has(id) || this.completed.has(id)
                || inspected.operation?.id === id) return { state: 'unavailable' };
            // A concurrent preview may have consumed capacity while storage was read.
            if (this.pending.size + this.running.size >= 16) return { state: 'busy' };
            if (!this.current(bound)) return { state: 'stale' };
            this.pending.set(id, { ...bound, revision: before.revision, before, after: plan.settings });
            return deepFreeze({ state: 'preview', operationId: id, revision: before.revision, expiresAt: bound.expiresAt,
                action: plan.action, before, after: plan.settings });
        } catch { return { state: 'unavailable' }; }
    }
    confirm(id: string, revision: number, owner: string): Promise<SettingsOperationOutcome> {
        if (!settingsOperationId(id) || !natural(revision)) return Promise.resolve({ state: 'invalid' });
        const now = this.time();
        if (now === null) return Promise.resolve({ state: 'unavailable' });
        this.prune(now);
        const running = this.running.get(id);
        if (running) return running.owner === owner && running.revision === revision ? running.result : Promise.resolve({ state: 'denied' });
        const record = this.pending.get(id) ?? this.completed.get(id);
        if (!record) return Promise.resolve({ state: 'expired' });
        if (record.owner !== owner || record.revision !== revision) return Promise.resolve({ state: 'denied' });
        if (!this.current(record)) return Promise.resolve({ state: 'stale' });
        if ('result' in record) return Promise.resolve(record.result);
        this.pending.delete(id);
        const result = this.apply(id, record).finally(() => { this.running.delete(id); });
        this.running.set(id, { owner, revision, result });
        return result;
    }
    cancel(id: string, revision: number, owner: string): SettingsOperationOutcome {
        if (!settingsOperationId(id) || !natural(revision)) return { state: 'invalid' };
        const now = this.time();
        if (now === null) return { state: 'unavailable' };
        this.prune(now);
        const running = this.running.get(id);
        if (running) return running.owner === owner && running.revision === revision ? { state: 'pending' } : { state: 'denied' };
        const record = this.pending.get(id) ?? this.completed.get(id);
        if (!record) return { state: 'expired' };
        if (record.owner !== owner || record.revision !== revision) return { state: 'denied' };
        if (!this.current(record)) return { state: 'stale' };
        if ('result' in record) return record.result;
        this.pending.delete(id); return { state: 'cancelled' };
    }
    private async apply(id: string, record: Pending): Promise<SettingsOperationOutcome> {
        let result: SettingsOperationOutcome;
        try { result = await this.repository.commit(record.after, record.revision, id, () => this.current(record)); }
        catch { result = { state: 'unknown', acknowledgement: 'unknown', observedRevision: null, observation: 'unavailable' }; }
        const now = this.time();
        if (now !== null && natural(now + PREVIEW_TTL)) {
            const { before: _before, after: _after, ...facts } = record;
            this.completed.set(id, { ...facts, createdAt: now, expiresAt: now + PREVIEW_TTL, result: deepFreeze(result) });
            if (this.completed.size > 32) this.completed.delete(this.completed.keys().next().value!);
        }
        if (result.state === 'committed') { try { this.ports.notify(); } catch { /* Saved facts survive notification failure. */ } }
        return result;
    }
}
