import { snapshotHelperIntent, latestHelperReasons, type HelperSnapshot, type HelperId } from '../domain/helper_sample.ts';
import type { HelperSampleReply, HelperRetained } from '../domain/helper_sample_view.ts';
import type { HelperFact } from '../domain/journal_facts.ts';
import type { JournalRetention } from '../domain/history_state.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import { collectionCurrent } from './collection_restrictions.ts';

export interface HelperSampleSource {
    readonly sourceTree: string; readonly generation: number; readonly credentialEpoch: number; readonly settingsRevision: number;
    current(): boolean;
}
export interface HelperSamplePorts {
    now(): number; changed(): void;
    admit(fact: HelperFact, current: () => boolean): Readonly<object> | null;
    retention(ticket: Readonly<object>): JournalRetention;
}
interface Sample {
    readonly at: number; readonly prepared: object; readonly health: HelperSnapshot | null;
    readonly tickets: { helper: HelperId; ticket: Readonly<object> | null }[];
    alive: boolean;
}
const TTL = 300_000;
/** Historical pre-open observations have no live-page target or mutation authority. */
export class HelperSamples {
    private prepared = new WeakMap<Readonly<object>, Sample>();
    private readonly tabs = new Map<number, Sample>();
    private preparation = {};
    private stopped = false;
    constructor(private readonly ports: HelperSamplePorts) {}
    private time(): number | null { try { const value = this.ports.now(); return natural(value) && natural(value + TTL) ? value : null; } catch { return null; } }
    private live(sample: Sample): boolean {
        const now = this.time(); return !this.stopped && sample.alive && now !== null && now >= sample.at && now - sample.at < TTL;
    }
    private forget(id: number): void { const sample = this.tabs.get(id); if (sample) sample.alive = false; this.tabs.delete(id); }
    private prune(now: number | null): void {
        for (const [id, sample] of this.tabs) if (now === null || now < sample.at || now - sample.at >= TTL) this.forget(id);
    }
    capture(value: unknown, source: HelperSampleSource | null): Readonly<object> | null {
        if (this.stopped || value === undefined) return null;
        const intent = snapshotHelperIntent(value); const now = this.time(); if (this.stopped || now === null) return null;
        const ready = intent?.state === 'ready' && source && intent.sourceTree === source.sourceTree && intent.generation === source.generation
            && intent.credentialEpoch === source.credentialEpoch && intent.settingsRevision === source.settingsRevision && collectionCurrent(source.current);
        if (this.stopped) return null;
        const sample: Sample = { at: now, prepared: this.preparation, health: ready ? intent.health : null, tickets: [], alive: true };
        const receipt = Object.freeze({}); this.prepared.set(receipt, sample);
        // The validated snapshot becomes historical now; source hiding does not undo its already established facts.
        if (sample.health) for (const reason of latestHelperReasons(sample.health)) {
            if (!this.live(sample)) { sample.alive = false; break; }
            let ticket: Readonly<object> | null = null;
            try { ticket = this.ports.admit({ kind: 'helper', helper: reason.featureId, code: reason.code, scope: reason.scope }, () => this.live(sample)); }
            catch { /* Optional retention cannot reject capture or block the native open. */ }
            sample.tickets.push({ helper: reason.featureId, ticket });
        }
        return receipt;
    }
    attach(receipt: Readonly<object>, tabId: number): boolean {
        const sample = this.prepared.get(receipt); this.prepared.delete(receipt);
        if (!sample) return false;
        if (!natural(tabId) || sample.prepared !== this.preparation || !this.live(sample)) { sample.alive = false; return false; }
        const now = this.time(); this.prune(now);
        if (!this.live(sample) || sample.prepared !== this.preparation) { sample.alive = false; return false; }
        this.forget(tabId); if (this.tabs.size >= 8) this.forget(this.tabs.keys().next().value!);
        this.tabs.set(tabId, sample); try { this.ports.changed(); } catch { /* A failed notification is not permission to repeat admission. */ }
        return !this.stopped && this.tabs.get(tabId) === sample;
    }
    read(tabId: number): HelperSampleReply {
        const now = this.time(); this.prune(now); if (this.stopped || now === null) return { state: 'unavailable' };
        const sample = this.tabs.get(tabId); if (!sample) return { state: 'empty' };
        if (!sample.health) return { state: 'unavailable' };
        const retention: HelperRetained[] = [];
        for (const { helper, ticket } of sample.tickets) {
            if (this.stopped || this.tabs.get(tabId) !== sample) return { state: 'empty' };
            let value: JournalRetention = 'untracked';
            if (ticket) { try { const read = this.ports.retention(ticket); value = ['pending', 'stored', 'not-retained', 'unknown', 'untracked'].includes(read) ? read : 'unknown'; }
                catch { value = 'unknown'; } }
            retention.push({ helper, retention: value });
        }
        // Ports can reenter stop, replacement or native removal; never republish a retired sample.
        this.prune(this.time());
        if (this.stopped || this.tabs.get(tabId) !== sample) return { state: 'empty' };
        return deepFreeze({ state: 'sample', capturedAt: sample.at, health: sample.health, retention });
    }
    releaseTab(tabId: number): void {
        // Any native removal retires unbound receipts: a delayed created-tab result cannot reuse an uncertain identifier.
        this.preparation = {}; this.forget(tabId);
    }
    stop(): void {
        this.stopped = true; this.preparation = {}; this.prepared = new WeakMap();
        for (const id of this.tabs.keys()) this.forget(id);
    }
}
