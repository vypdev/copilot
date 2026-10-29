import type { JournalKind } from '../domain/journal_facts.ts';
import type { Settings, SettingsLoad } from '../domain/settings.ts';
import { deepFreeze } from '../domain/value.ts';
import { loadCollectionPolicy, type CollectionPolicy } from '../domain/collection_policy.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import type { CollectionPolicyStore } from './collection_policy_ports.ts';
import { collectionCurrent, pauseCollectionPolicy, readCollectionPolicy, type CollectionObservation, type CollectionRestrictionFact, type CollectionRestrictionResult } from './collection_restrictions.ts';
import type { SettingsWriteEffects, SettingsWritePreparation } from './settings_write_effects.ts';
import type { CollectionCapture, CollectionPreparation, CollectionPreparations, CollectionActivationLease } from './collection_transition_ports.ts';
import type { CollectionState } from '../domain/history_state.ts';
export type { CollectionState } from '../domain/history_state.ts';

const KINDS = ['diagnostics', 'recents'] as const;
interface Preferences { readonly revision: number; readonly paused: boolean; readonly diagnostics: boolean; readonly recents: boolean }
interface Slot { observed: CollectionObservation; blocked: boolean; epoch: object; held: object | null; restriction: CollectionRestrictionFact | null }
export interface CollectionCoordinatorPorts {
    settings(): Promise<SettingsLoad>; identifier(): string; writerIdle(kind: JournalKind): boolean; changed(): void;
}

/** One background owner. Observation can restore healthy consent after restart, never undo an uncertain local stop. */
export class CollectionCoordinator implements SettingsWriteEffects {
    private preferences: Preferences | null = null;
    private readonly slots: Record<JournalKind, Slot> = {
        diagnostics: { observed: { state: 'unavailable' }, blocked: false, epoch: {}, held: null, restriction: null },
        recents: { observed: { state: 'unavailable' }, blocked: false, epoch: {}, held: null, restriction: null },
    };
    private readonly writes = new Set<object>();
    private readonly preparations = new Map<string, CollectionPreparations>();
    private readonly stagedStops = new Map<string, { kind: JournalKind; revision: number; result: CollectionRestrictionResult }>();
    private readGeneration: object = {};
    private readRequested = false;
    private reading: Promise<void> | null = null;
    private signature = '';
    private disposed = false;
    private globalStop = false;
    constructor(private readonly policies: CollectionPolicyStore, private readonly ports: CollectionCoordinatorPorts) {}
    state(kind: JournalKind): CollectionState {
        const slot = this.slots[kind]; const known = slot.observed.state === 'ready' ? slot.observed.policy : null;
        return deepFreeze({ kind, preference: this.preferences ? this.preferences[kind] ? 'on' : 'off' : 'unknown',
            globallyPaused: this.preferences?.paused ?? null, policy: slot.observed.state === 'ready' ? slot.observed.policy.mode : slot.observed.state,
            policyRevision: known?.revision ?? null, collecting: this.eligible(kind), sessionBlocked: slot.blocked || this.globalStop,
            busy: this.writes.size > 0 || slot.held !== null, restriction: slot.restriction });
    }
    private eligible(kind: JournalKind): boolean {
        const slot = this.slots[kind];
        return !this.disposed && !this.globalStop && this.preferences !== null && !this.preferences.paused && this.preferences[kind]
            && !slot.blocked && slot.held === null && slot.observed.state === 'ready' && slot.observed.policy.mode === 'active'
            && slot.observed.policy.revision < Number.MAX_SAFE_INTEGER;
    }
    private publish(): void {
        const signature = JSON.stringify(KINDS.map(kind => this.state(kind)));
        if (signature === this.signature) return;
        this.signature = signature;
        try { this.ports.changed(); } catch { /* Center-only notification cannot change admission or persistence facts. */ }
    }
    invalidate(): void { this.readGeneration = {}; this.preferences = null; this.publish(); }
    dispose(): void { this.disposed = true; this.invalidate(); }
    refresh(): Promise<void> {
        if (this.disposed) return Promise.resolve();
        this.readGeneration = {}; this.readRequested = true;
        // Assign the shared promise before invoking a port: even a synchronous reentrant request joins it.
        this.reading ??= Promise.resolve().then(() => this.drainReads());
        return this.reading;
    }
    private async drainReads(): Promise<void> {
        do { this.readRequested = false; await this.observe(); }
        while (this.readRequested && !this.disposed);
        this.reading = null;
    }
    private async observe(): Promise<void> {
        if (this.disposed || this.writes.size) return;
        const generation = this.readGeneration;
        const settings = async () => { try { return await this.ports.settings(); } catch { return null; } };
        const [loaded, diagnostics, recents] = await Promise.all([settings(), readCollectionPolicy(this.policies, 'diagnostics'), readCollectionPolicy(this.policies, 'recents')]);
        if (this.disposed || generation !== this.readGeneration || this.writes.size) return;
        this.preferences = loaded?.state === 'ready' && !loaded.migrated ? { revision: loaded.settings.revision,
            paused: loaded.settings.paused, diagnostics: loaded.settings.center.diagnostics, recents: loaded.settings.center.recents } : null;
        // Only observing the durable pause discharges this pending stop; an unchanged false flag cannot.
        if (this.preferences?.paused) this.globalStop = false;
        this.slots.diagnostics.observed = diagnostics; this.slots.recents.observed = recents;
        this.publish();
    }
    /** Private admission lease; a resumed old policy cannot revive a ticket retired by a stop. */
    admission(kind: JournalKind): { readonly policyRevision: number; current(): boolean } | null {
        const slot = this.slots[kind];
        if (!this.eligible(kind) || slot.observed.state !== 'ready') return null;
        const epoch = slot.epoch; const revision = slot.observed.policy.revision;
        return Object.freeze({ policyRevision: revision, current: () => this.eligible(kind) && slot.epoch === epoch
            && slot.observed.state === 'ready' && slot.observed.policy.revision === revision });
    }
    pausedPolicyRevision(kind: JournalKind): number | null {
        const observed = this.slots[kind].observed;
        return observed.state === 'ready' && observed.policy.mode === 'paused' ? observed.policy.revision : null;
    }
    capture(kind: JournalKind, restricting = false): CollectionCapture | null {
        const slot = this.slots[kind];
        return !this.disposed && (!this.globalStop || restricting) && this.preferences && (restricting || this.idle(kind)) && (slot.observed.state === 'ready' || restricting)
            ? Object.freeze({ policy: slot.observed.state === 'ready' ? slot.observed.policy : null,
                stamp: slot.epoch, settingsRevision: this.preferences.revision }) : null;
    }
    /** An authorized stop retires admission immediately, even if persistence subsequently remains unavailable. */
    pause(kind: JournalKind): object { this.readGeneration = {}; this.slots[kind].blocked = true; this.slots[kind].epoch = {}; this.publish(); return this.slots[kind].epoch; }
    owns(kind: JournalKind, stamp: object): boolean { return !this.disposed && this.slots[kind].epoch === stamp; }
    writerMayRun(kind: JournalKind): boolean { return !this.disposed && this.slots[kind].held === null; }
    observeStop(kind: JournalKind, stamp: object, result: CollectionRestrictionResult): boolean {
        if (!this.owns(kind, stamp)) return false;
        this.readGeneration = {}; this.slots[kind].observed = result.observed; this.slots[kind].restriction = result.fact;
        this.publish(); return true;
    }
    takePreparation(id: string): CollectionPreparations | null {
        const value = this.preparations.get(id); this.preparations.delete(id); return value ?? null;
    }
    stageStop(id: string, kind: JournalKind, revision: number, result: CollectionRestrictionResult): boolean {
        if (!settingsOperationId(id) || this.stagedStops.has(id) || this.stagedStops.size >= 16) return false;
        this.stagedStops.set(id, { kind, revision, result }); return true;
    }
    clearStagedStop(id: string): void { this.stagedStops.delete(id); }
    reserveActivation(kind: JournalKind, stamp: object, settingsRevision: number, policyRevision: number, operationId: string): CollectionActivationLease | null {
        const slot = this.slots[kind];
        if (!settingsOperationId(operationId) || !this.capture(kind) || slot.epoch !== stamp || !this.preferences?.[kind]
            || this.preferences.paused || this.preferences.revision !== settingsRevision || slot.observed.state !== 'ready'
            || slot.observed.policy.revision !== policyRevision || policyRevision >= Number.MAX_SAFE_INTEGER - 1) return null;
        const held = {}; slot.held = held;
        const current = () => !this.disposed && !this.globalStop && slot.held === held && slot.epoch === stamp && !this.writes.size
            && this.preferences?.revision === settingsRevision && this.preferences[kind] && !this.preferences.paused;
        this.publish();
        return Object.freeze({ current, accept: (raw: CollectionPolicy, sourceCurrent: () => boolean) => {
            const loaded = loadCollectionPolicy(kind, raw);
            if (!current() || !collectionCurrent(sourceCurrent) || loaded.state !== 'ready' || loaded.policy.mode !== 'active'
                || loaded.policy.revision !== policyRevision + 1 || loaded.policy.receipt?.id !== operationId
                || loaded.policy.receipt.beforeRevision !== policyRevision || loaded.policy.receipt.settingsRevision !== settingsRevision) return false;
            slot.observed = loaded; slot.blocked = false; this.publish(); return true;
        }, release: () => {
            if (slot.held !== held) return;
            slot.held = null; this.publish(); void this.refresh();
        } });
    }
    idle(kind: JournalKind): boolean {
        return !this.disposed && !this.writes.size && this.slots[kind].held === null && collectionCurrent(() => this.ports.writerIdle(kind));
    }
    /** JournalReviews already owns the preference queue; acquiring it here again would deadlock. */
    reserve(kind: JournalKind, settingsRevision: number, policyRevision: number): { current(): boolean; release(): void } | null {
        if (!this.idle(kind) || !this.preferences || this.preferences.revision !== settingsRevision || this.preferences[kind]
            || this.pausedPolicyRevision(kind) !== policyRevision) return null;
        const slot = this.slots[kind]; const held = {}; slot.held = held; this.publish();
        const current = () => !this.disposed && slot.held === held && !this.writes.size && this.preferences?.revision === settingsRevision
            && !this.preferences[kind] && this.pausedPolicyRevision(kind) === policyRevision && collectionCurrent(() => this.ports.writerIdle(kind));
        return Object.freeze({ current, release: () => {
            if (slot.held !== held) return;
            slot.held = null; this.publish();
        } });
    }
    async prepare(before: Settings, after: Settings, current: () => boolean, operationId?: string): Promise<SettingsWritePreparation> {
        const increases = KINDS.some(kind => !before.center[kind] && after.center[kind]);
        if (this.disposed) return Object.freeze({ allowed: !increases, release() {} });
        const write = {}; this.writes.add(write); this.readGeneration = {};
        const stamps = { diagnostics: this.slots.diagnostics.epoch, recents: this.slots.recents.epoch };
        const preparations: Partial<Record<JournalKind, CollectionPreparation>> = {};
        if (!before.paused && after.paused) this.globalStop = true;
        if (before.paused !== after.paused || KINDS.some(kind => before.center[kind] !== after.center[kind])) this.preferences = null;
        for (const kind of KINDS) {
            if (before.center[kind] !== after.center[kind]) this.slots[kind].blocked = true;
            if (before.paused !== after.paused || before.center[kind] !== after.center[kind]) this.slots[kind].epoch = {};
        }
        const afterStamps = { diagnostics: this.slots.diagnostics.epoch, recents: this.slots.recents.epoch };
        this.publish();
        let allowed = true;
        for (const kind of KINDS) if (before.center[kind] !== after.center[kind]) {
            const guard = () => !this.disposed && this.writes.has(write) && this.slots[kind].held === null && collectionCurrent(current);
            const staged = operationId === undefined ? undefined : this.stagedStops.get(operationId);
            const reuse = staged?.kind === kind && staged.revision === before.revision && before.center[kind] && !after.center[kind];
            const result = reuse ? staged.result : await pauseCollectionPolicy(this.policies, kind, before.revision, () => this.ports.identifier(), guard);
            if (reuse) this.stagedStops.delete(operationId!);
            this.slots[kind].observed = result.observed; this.slots[kind].restriction = result.fact;
            preparations[kind] = Object.freeze({ beforeStamp: stamps[kind], afterStamp: afterStamps[kind], result });
            if (after.center[kind] && (result.observed.state !== 'ready' || result.observed.policy.mode !== 'paused')) allowed = false;
            this.publish();
        }
        if (settingsOperationId(operationId) && Object.keys(preparations).length) {
            this.preparations.set(operationId, Object.freeze(preparations));
            if (this.preparations.size > 32) this.preparations.delete(this.preparations.keys().next().value!);
        }
        return Object.freeze({ allowed, release: () => {
            if (!this.writes.delete(write)) return;
            this.publish(); void this.refresh();
        } });
    }
}
