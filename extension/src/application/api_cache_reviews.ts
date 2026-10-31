import { deepFreeze, natural } from '../domain/value.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import type { ApiCacheFactState, ApiCacheOutcome, ApiCacheReply } from '../domain/api_cache.ts';
import type { SettingsOwnerFence } from '../domain/settings_result.ts';
import type { ApiCachePort, ApiCacheReviewPorts } from './api_cache_ports.ts';

interface Review {
    readonly id: string; readonly owner: string; readonly fence: SettingsOwnerFence;
    readonly witness: Readonly<object>; readonly generation: object;
    readonly createdAt: number; readonly expiresAt: number;
    retired: boolean;
    observe: ((state: ApiCacheFactState) => void) | null;
    result?: ApiCacheOutcome;
}
const TTL = 300_000;
/** Explicit native cache review; no preference, credential, scheduling or provider port. */
export class ApiCacheReviews {
    private readonly records = new Map<string, Review>();
    private generation: object = {};
    private stopped = false;
    private preparing = false;
    constructor(private readonly cache: ApiCachePort, private readonly ports: ApiCacheReviewPorts) {}
    private time(): number | null {
        try { const now = this.ports.now(); return natural(now) && natural(now + TTL) ? now : null; } catch { return null; }
    }
    private fence(owner: string): SettingsOwnerFence | null {
        if (!settingsOperationId(owner)) return null;
        try {
            const value = this.ports.fence(owner);
            return value && natural(value.controllerEpoch) && natural(value.credentialEpoch)
                ? { controllerEpoch: value.controllerEpoch, credentialEpoch: value.credentialEpoch } : null;
        } catch { return null; }
    }
    private sameFence(owner: string, before: SettingsOwnerFence): boolean {
        const now = this.fence(owner); return now !== null && now.controllerEpoch === before.controllerEpoch && now.credentialEpoch === before.credentialEpoch;
    }
    private current(record: Review): boolean {
        if (this.stopped || record.retired || record.generation !== this.generation || this.records.get(record.id) !== record) { record.retired = true; return false; }
        const now = this.time();
        const fence = this.fence(record.owner);
        const valid = !record.retired && now !== null && now >= record.createdAt && now < record.expiresAt
            && fence !== null && fence.controllerEpoch === record.fence.controllerEpoch && fence.credentialEpoch === record.fence.credentialEpoch
            && !this.stopped && record.generation === this.generation && this.records.get(record.id) === record;
        if (!valid) record.retired = true;
        return valid;
    }
    private witness(record: Review): boolean {
        if (!this.current(record)) return false;
        try { return this.cache.current(record.witness) === true && this.current(record); } catch { return false; }
    }
    private report(record: Review, state: ApiCacheFactState): void {
        try { record.observe?.(state); } catch { /* Secondary observation cannot change or repeat primary clearing. */ }
    }
    private prune(now: number): void {
        for (const [id, record] of [...this.records]) if (now < record.createdAt || now >= record.expiresAt) {
            this.records.delete(id); if (!record.result) this.report(record, 'blocked');
        }
    }
    preview(owner: string): ApiCacheReply {
        if (this.preparing) return { state: 'busy' };
        this.preparing = true;
        try { return this.prepare(owner); } finally { this.preparing = false; }
    }
    private prepare(owner: string): ApiCacheReply {
        if (this.stopped) return { state: 'denied' };
        const fence = this.fence(owner); if (!fence) return { state: 'denied' };
        const now = this.time(); if (now === null) return { state: 'unavailable' };
        const generation = this.generation; this.prune(now);
        if (this.records.size >= 32 || [...this.records.values()].some(value => value.owner === owner && !value.result)) return { state: 'busy' };
        let id: string; let witness: Readonly<object>;
        try {
            id = this.ports.identifier();
            if (!settingsOperationId(id) || this.records.has(id)) return { state: 'unavailable' };
            if (this.stopped || generation !== this.generation || !this.sameFence(owner, fence)) return { state: 'stale' };
            witness = this.cache.capture();
        } catch { return { state: 'unavailable' }; }
        const record: Review = { id, owner, fence, witness, generation, createdAt: now, expiresAt: now + TTL, retired: false, observe: null };
        if (this.stopped || generation !== this.generation || !this.sameFence(owner, fence)) return { state: 'stale' };
        this.records.set(id, record);
        if (!this.witness(record)) { this.records.delete(id); return { state: 'stale' }; }
        try { record.observe = this.ports.observe?.(owner, () => this.current(record)) ?? null; } catch { /* No collection fallback. */ }
        this.report(record, 'reviewed');
        if (!this.witness(record)) { this.records.delete(id); this.report(record, 'blocked'); return { state: 'stale' }; }
        return deepFreeze({ state: 'preview', operationId: id, expiresAt: record.expiresAt });
    }
    private lookup(id: string, owner: string): Review | ApiCacheOutcome {
        if (!settingsOperationId(id)) return { state: 'invalid' };
        if (this.stopped) return { state: 'denied' };
        const fence = this.fence(owner); if (!fence || this.stopped) {
            const retained = this.records.get(id); if (retained?.owner === owner) retained.retired = true;
            return { state: 'denied' };
        }
        const now = this.time(); if (now === null) return { state: 'unavailable' };
        const record = this.records.get(id); if (!record) return { state: 'expired' };
        if (record.owner !== owner) return { state: 'denied' };
        if (now < record.createdAt || now >= record.expiresAt) {
            this.records.delete(id); if (!record.result) this.report(record, 'blocked'); return { state: 'expired' };
        }
        return this.current(record) ? record : { state: 'stale' };
    }
    inspect(id: string, owner: string): ApiCacheOutcome {
        const record = this.lookup(id, owner); if ('state' in record) return record;
        return record.result ?? { state: this.witness(record) ? 'not-submitted' : 'stale' };
    }
    cancel(id: string, owner: string): ApiCacheOutcome {
        if (this.preparing) return { state: 'busy' };
        const record = this.lookup(id, owner); if ('state' in record) return record;
        if (!record.result) { record.result = Object.freeze({ state: 'cancelled' }); this.report(record, 'cancelled'); }
        return record.result;
    }
    confirm(id: string, owner: string): ApiCacheOutcome {
        if (this.preparing) return { state: 'busy' };
        const record = this.lookup(id, owner); if ('state' in record) return record;
        if (record.result) return record.result;
        if (!this.witness(record)) { record.result = Object.freeze({ state: 'stale' }); this.report(record, 'blocked'); return record.result; }
        // An observer may synchronously re-enter; reserve this attempt before its first notification.
        record.result = Object.freeze({ state: 'unknown' }); this.report(record, 'submitted');
        if (!this.witness(record)) { record.result = Object.freeze({ state: 'stale' }); this.report(record, 'not-applied'); return record.result; }
        try {
            const cleared = this.cache.clear(record.witness, () => this.current(record));
            record.result = Object.freeze({ state: cleared === true ? 'cleared' : 'stale' });
            this.report(record, cleared === true ? 'cleared' : 'not-applied');
        } catch { this.report(record, 'unknown'); }
        return record.result;
    }
    invalidate(): void {
        this.generation = {}; const old = [...this.records.values()]; this.records.clear();
        for (const record of old) if (!record.result) this.report(record, 'blocked');
    }
    stop(): void { this.stopped = true; this.invalidate(); }
}
