import { recentsPermitId, validCenterDestination, type CenterDestination, type RecentsPermit } from '../domain/center_visits.ts';
import type { DestinationFact } from '../domain/journal_facts.ts';
import { collectionCurrent } from './collection_restrictions.ts';
import { natural } from '../domain/value.ts';

export interface RecentsSource {
    readonly clientId: string; readonly controllerEpoch: number; readonly credentialEpoch: number;
    readonly documentId: string | null; readonly tabId: number | null;
}
export interface RecentsCapturePorts {
    admission(): { readonly policyRevision: number; current(): boolean } | null;
    epoch(): number | null; identifier(): string;
    admit(fact: DestinationFact, current: () => boolean): unknown;
}
interface Permit {
    readonly id: string; readonly source: RecentsSource; readonly epoch: number; readonly admission: NonNullable<ReturnType<RecentsCapturePorts['admission']>>;
    sequence: number; last: string | null; result: { readonly state: 'observed' | 'unavailable' };
}
const same = (a: RecentsSource, b: RecentsSource) => a.clientId === b.clientId && a.controllerEpoch === b.controllerEpoch
    && a.credentialEpoch === b.credentialEpoch && a.documentId === b.documentId && a.tabId === b.tabId;

/** Narrow destination producer. A private source permit can never become a generic record or review capability. */
export class RecentsCapture {
    private readonly permits = new Map<string, Permit>();
    private stopped = false;
    constructor(private readonly ports: RecentsCapturePorts) {}
    private live(value: Permit): boolean { return !this.stopped && collectionCurrent(value.admission.current) && this.ports.epoch() === value.epoch; }
    /** Called synchronously on consent/writer changes; a later recovery cannot revive a retired permit. */
    retire(): void {
        for (const [owner, value] of this.permits) {
            try { if (!this.live(value)) this.permits.delete(owner); } catch { this.permits.delete(owner); }
        }
    }
    capture(source: RecentsSource, current: () => boolean): RecentsPermit | { readonly state: 'stale' | 'unavailable' } {
        if (this.stopped || !collectionCurrent(current)) return { state: 'stale' };
        this.retire(); const owner = { ...source };
        try {
            const epoch = this.ports.epoch(); const admission = this.ports.admission();
            if (epoch === null || !admission || !collectionCurrent(admission.current)) return { state: 'ready', permit: null, epoch, sequence: 0 };
            const existing = this.permits.get(owner.clientId);
            if (existing && same(existing.source, owner) && existing.sequence < Number.MAX_SAFE_INTEGER) return { state: 'ready', permit: existing.id, epoch, sequence: existing.sequence };
            const id = `visit-${this.ports.identifier()}`;
            if (!recentsPermitId(id) || [...this.permits.values()].some(value => value.id === id)) return { state: 'unavailable' };
            if (!collectionCurrent(current) || !collectionCurrent(admission.current) || this.ports.epoch() !== epoch) return { state: 'stale' };
            // A reentrant mint may already have registered this exact source. Reuse it without reviving stale admission.
            const raced = this.permits.get(owner.clientId);
            if (raced && same(raced.source, owner) && this.live(raced) && raced.sequence < Number.MAX_SAFE_INTEGER) return { state: 'ready', permit: raced.id, epoch, sequence: raced.sequence };
            this.permits.delete(owner.clientId);
            if (this.permits.size >= 8) this.permits.delete(this.permits.keys().next().value!);
            this.permits.set(owner.clientId, { id, source: owner, epoch, admission, sequence: 0, last: null, result: { state: 'unavailable' } });
            return Object.freeze({ state: 'ready', permit: id, epoch, sequence: 0 });
        } catch { return { state: 'unavailable' }; }
    }
    observe(source: RecentsSource, id: string, sequence: number, destination: CenterDestination, current: () => boolean): { readonly state: 'observed' | 'stale' | 'invalid' | 'unavailable' } {
        if (!recentsPermitId(id) || !natural(sequence) || sequence === 0 || !validCenterDestination(destination)) return { state: 'invalid' };
        this.retire(); const value = this.permits.get(source.clientId);
        if (!value || value.id !== id || !same(value.source, source) || !collectionCurrent(current)) return { state: 'stale' };
        if (!collectionCurrent(() => this.permits.get(source.clientId) === value && this.live(value))) return { state: 'stale' };
        if (sequence < value.sequence) return { state: 'stale' };
        const signature = JSON.stringify([destination.route, destination.featureId ?? null]);
        if (sequence === value.sequence) return value.last === signature ? value.result : { state: 'invalid' };
        value.sequence = sequence; value.last = signature; value.result = Object.freeze({ state: 'unavailable' });
        const fact: DestinationFact = { kind: 'destination', route: destination.route, ...(destination.featureId ? { featureId: destination.featureId } : {}) };
        try {
            this.ports.admit(fact, () => this.permits.get(source.clientId) === value && this.live(value) && collectionCurrent(current));
            value.result = Object.freeze({ state: 'observed' }); return value.result;
        } catch { return value.result; }
    }
    stop(): void { this.stopped = true; this.permits.clear(); }
}
