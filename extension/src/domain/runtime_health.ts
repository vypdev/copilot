import { deepFreeze } from './value.ts';

export const RUNTIME_FAULT_CODES = Object.freeze(['mount-failed', 'refresh-failed', 'cleanup-failed'] as const);
export type RuntimeFaultCode = typeof RUNTIME_FAULT_CODES[number];
export interface RuntimeHealthEvent {
    readonly featureId: string; readonly code: RuntimeFaultCode;
    readonly scope: 'active-at-observation' | 'retired-at-observation';
}
export interface RuntimeHealthView { readonly blocked: readonly string[]; readonly events: readonly RuntimeHealthEvent[] }

/** Closed health reasons only: one content lifetime, at most100 entries, no settings/provider/history payloads. */
export class RuntimeHealth {
    private readonly registered: ReadonlySet<string>;
    private readonly failed = new Set<string>();
    private events: readonly RuntimeHealthEvent[] = Object.freeze([]);
    constructor(ids: readonly string[]) {
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 152 || new Set(ids).size !== ids.length
            || ![...ids].every(id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9-]{0,63}$(?![\s\S])/u.test(id))) throw new Error('invalid-health-registry');
        this.registered = new Set(ids);
    }
    canMount(id: string): boolean { return this.registered.has(id) && !this.failed.has(id); }
    record(featureId: unknown, code: unknown, current: unknown): void {
        if (typeof featureId !== 'string' || !this.registered.has(featureId) || typeof code !== 'string'
            || !RUNTIME_FAULT_CODES.includes(code as RuntimeFaultCode) || typeof current !== 'boolean') return;
        if (current) this.failed.add(featureId);
        this.events = deepFreeze([...this.events.slice(-99), { featureId, code: code as RuntimeFaultCode,
            scope: current ? 'active-at-observation' as const : 'retired-at-observation' as const }]);
    }
    resetFailures(retain: ReadonlySet<string> = new Set()): void { for (const id of this.failed) if (!retain.has(id)) this.failed.delete(id); }
    clear(): void { this.resetFailures(); this.events = Object.freeze([]); }
    snapshot(): RuntimeHealthView { return deepFreeze({ blocked: [...this.failed], events: [...this.events] }); }
}
