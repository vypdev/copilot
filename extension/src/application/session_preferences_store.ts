import { copySessionPreferences, type SessionPreferences, type SessionPreferencesLoad } from '../domain/session_preferences.ts';
import type { NativeSnapshotOutcome } from '../domain/native_snapshot_outcome.ts';
import type { StoragePort } from './runtime_ports.ts';
import { NativeMutationGuard } from './native_mutation_guard.ts';
import { SESSION_PREFERENCES_KEY, SessionPreferencesReader } from './session_preferences_reader.ts';
import { protectedMutation, type ProtectedMutationTrace } from './protected_mutation.ts';
import { SettingsMutationQueue } from './settings_mutation_queue.ts';

export interface SessionPreferencesStorePorts { protectedArea(): Promise<boolean>; changed(): void }
export interface SessionPreferenceInspection { readonly loaded: SessionPreferencesLoad; readonly witness: object; readonly precaution: boolean; readonly pending: boolean }
const same = (left: SessionPreferences, right: SessionPreferences): boolean => JSON.stringify(left) === JSON.stringify(right);
const eligible = (current: () => boolean): boolean => { try { return current() === true; } catch { return false; } };

/** Sole writer for this document, with its own guard. No implicit reconnect, repair, inverse or write replay. */
export class SessionPreferencesStore {
    readonly guard = new NativeMutationGuard();
    private readonly native: SessionPreferencesReader;
    private readonly mutations = new SettingsMutationQueue();
    private pending = 0;
    constructor(private readonly storage: StoragePort, private readonly ports: SessionPreferencesStorePorts) {
        this.native = new SessionPreferencesReader(storage, () => ports.protectedArea());
    }
    async inspect(): Promise<SessionPreferenceInspection> {
        const loaded = await this.native.read(); return { loaded, witness: this.guard.capture(), precaution: this.guard.uncertain, pending: this.guard.pending };
    }
    private changed(): void { try { this.ports.changed(); } catch { /* Native facts and this owner's guard remain primary. */ } }
    protectUnknown(): void { this.guard.protect(); this.changed(); }
    private enqueue(work: () => Promise<NativeSnapshotOutcome>): Promise<NativeSnapshotOutcome> {
        this.pending++; return this.mutations.run(work).finally(() => { this.pending--; });
    }
    commit(before: unknown, after: unknown, current: () => boolean, preflight: () => Promise<boolean>, trace?: ProtectedMutationTrace | null): Promise<NativeSnapshotOutcome> {
        const expected = copySessionPreferences(before); const desired = copySessionPreferences(after);
        if (!expected || !desired || expected.revision === Number.MAX_SAFE_INTEGER || desired.revision !== expected.revision + 1
            || same({ ...expected, revision: desired.revision }, desired)) return Promise.resolve({ state: 'invalid' });
        if (!eligible(current)) return Promise.resolve({ state: 'stale' });
        if (this.pending >= 16) return Promise.resolve({ state: 'busy' });
        const token = this.guard.hold(); if (!token) return Promise.resolve({ state: 'busy' });
        const operation = this.enqueue(() => this.write(expected, desired, current, preflight, token, trace)); this.changed(); return operation;
    }
    private async write(expected: SessionPreferences, desired: SessionPreferences, current: () => boolean, preflight: () => Promise<boolean>, token: object, trace?: ProtectedMutationTrace | null): Promise<NativeSnapshotOutcome> {
        let uncertain = false; let outcome: NativeSnapshotOutcome;
        try {
            if (!eligible(current)) return { state: 'stale' };
            const observed = await this.native.read(); if (!eligible(current)) return { state: 'stale' };
            if (observed.state !== 'ready') return { state: observed.state };
            if (!same(observed.value, expected)) return { state: 'conflict' };
            if (await preflight() !== true || !eligible(current)) return { state: 'stale' };
            let observedRevision: number | null = null;
            const fact = await protectedMutation(() => this.storage.set(SESSION_PREFERENCES_KEY, desired), async () => {
                const value = await this.native.read(); if (value.state !== 'ready') return undefined;
                observedRevision = value.value.revision; return same(value.value, desired);
            }, trace);
            const live = eligible(current); uncertain = fact.observation !== 'committed' || !live;
            outcome = fact.observation === 'committed' ? { state: 'committed', revision: desired.revision, acknowledgement: fact.acknowledgement, current: live }
                : { state: 'unknown', acknowledgement: fact.acknowledgement, observation: fact.observation, observedRevision, current: live };
        } catch { outcome = { state: 'unavailable' }; }
        finally { this.guard.settle(token, uncertain); this.changed(); }
        return { ...outcome, ...('current' in outcome ? { current: eligible(current) } : {}) };
    }
    /** A separately reviewed adoption observes current native data; it does not certify an older operation. */
    reconcile(value: unknown, witness: object, current: () => boolean, preflight: () => Promise<boolean>): Promise<NativeSnapshotOutcome> {
        const expected = copySessionPreferences(value); if (!expected) return Promise.resolve({ state: 'invalid' });
        if (!eligible(current)) return Promise.resolve({ state: 'stale' });
        if (this.pending >= 16) return Promise.resolve({ state: 'busy' });
        return this.enqueue(async () => {
            try {
                if (!eligible(current)) return { state: 'stale' };
                const observed = await this.native.read(); if (!eligible(current)) return { state: 'stale' };
                if (observed.state !== 'ready') return { state: observed.state };
                if (!same(observed.value, expected) || this.guard.capture() !== witness || this.guard.pending) return { state: 'conflict' };
                if (!this.guard.uncertain) return { state: 'unchanged' };
                if (await preflight() !== true || !eligible(current)) return { state: 'stale' };
                if (!this.guard.reconcile(witness)) return { state: 'conflict' };
                this.changed(); return { state: 'reconciled', revision: expected.revision, current: eligible(current) };
            } catch { return { state: 'unavailable' }; }
        });
    }
}
