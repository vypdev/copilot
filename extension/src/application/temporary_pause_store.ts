import { copyTemporaryPauses, type TemporaryPauseLoad, type TemporaryPauses } from '../domain/temporary_pauses.ts';
import type { TemporaryPauseOutcome } from '../domain/temporary_pause_result.ts';
import type { StoragePort } from './runtime_ports.ts';
import { TemporaryPauseGuard } from './temporary_pause_guard.ts';
import { TEMPORARY_PAUSES_KEY, TemporaryPauseReader } from './temporary_pause_reader.ts';
import { protectedMutation } from './protected_mutation.ts';
import { SettingsMutationQueue } from './settings_mutation_queue.ts';

export interface TemporaryPauseStorePorts { protectedArea(): Promise<boolean>; changed(): void }
export interface TemporaryPauseInspection { readonly loaded: TemporaryPauseLoad; readonly witness: object; readonly precaution: boolean; readonly pending: boolean }
const same = (left: TemporaryPauses, right: TemporaryPauses): boolean => JSON.stringify(left) === JSON.stringify(right);
const eligible = (current: () => boolean): boolean => { try { return current() === true; } catch { return false; } };

/** One native writer for reviewed complete snapshots. No repair, rollback, automatic retry or preference write. */
export class TemporaryPauseStore {
    private readonly native: TemporaryPauseReader;
    private readonly mutations = new SettingsMutationQueue();
    private pending = 0;
    constructor(private readonly storage: StoragePort, readonly guard: TemporaryPauseGuard, private readonly ports: TemporaryPauseStorePorts) {
        this.native = new TemporaryPauseReader(storage, () => ports.protectedArea());
    }
    async inspect(): Promise<TemporaryPauseInspection> {
        const loaded = await this.native.read();
        return { loaded, witness: this.guard.capture(), precaution: this.guard.uncertain, pending: this.guard.pending };
    }
    private changed(): void { try { this.ports.changed(); } catch { /* Native facts and the precaution are already settled. */ } }
    protectUnknown(): void { this.guard.protect(); this.changed(); }
    private enqueue(work: () => Promise<TemporaryPauseOutcome>): Promise<TemporaryPauseOutcome> {
        this.pending++;
        return this.mutations.run(work).finally(() => { this.pending--; });
    }
    commit(before: unknown, after: unknown, current: () => boolean): Promise<TemporaryPauseOutcome> {
        const expected = copyTemporaryPauses(before); const desired = copyTemporaryPauses(after);
        if (!expected || !desired || expected.revision === Number.MAX_SAFE_INTEGER || desired.revision !== expected.revision + 1
            || expected.emergency === desired.emergency && JSON.stringify(expected.tabs) === JSON.stringify(desired.tabs)) return Promise.resolve({ state: 'invalid' });
        if (!eligible(current)) return Promise.resolve({ state: 'stale' });
        if (this.pending >= 16) return Promise.resolve({ state: 'busy' });
        const token = this.guard.hold(); if (!token) return Promise.resolve({ state: 'busy' });
        // Reserve FIFO ownership before a notification can synchronously reenter this application port.
        const operation = this.enqueue(() => this.write(expected, desired, current, token)); this.changed(); return operation;
    }
    private async write(expected: TemporaryPauses, desired: TemporaryPauses, current: () => boolean, token: object): Promise<TemporaryPauseOutcome> {
        let uncertain = false; let outcome: TemporaryPauseOutcome;
        try {
            if (!eligible(current)) return { state: 'stale' };
            const observed = await this.native.read();
            if (!eligible(current)) return { state: 'stale' };
            if (observed.state !== 'ready') return { state: observed.state };
            if (!same(observed.value, expected)) return { state: 'conflict' };
            // The current callback itself can retire the source; check it immediately before the native attempt.
            if (!eligible(current)) return { state: 'stale' };
            let observedRevision: number | null = null;
            const fact = await protectedMutation(() => this.storage.set(TEMPORARY_PAUSES_KEY, desired), async () => {
                const value = await this.native.read();
                if (value.state !== 'ready') return undefined;
                observedRevision = value.value.revision; return same(value.value, desired);
            });
            const live = eligible(current); uncertain = fact.observation !== 'committed' || !live;
            outcome = fact.observation === 'committed' ? { state: 'committed', revision: desired.revision, acknowledgement: fact.acknowledgement, current: live }
                : { state: 'unknown', acknowledgement: fact.acknowledgement, observation: fact.observation, observedRevision, current: live };
        } finally { this.guard.settle(token, uncertain); this.changed(); }
        return { ...outcome, current: eligible(current) };
    }
    /** Adopt an explicitly reviewed current native state; this neither writes nor certifies an earlier outcome. */
    reconcile(expectedValue: unknown, witness: object, current: () => boolean): Promise<TemporaryPauseOutcome> {
        const expected = copyTemporaryPauses(expectedValue);
        if (!expected) return Promise.resolve({ state: 'invalid' });
        if (!eligible(current)) return Promise.resolve({ state: 'stale' });
        if (this.pending >= 16) return Promise.resolve({ state: 'busy' });
        return this.enqueue(async () => {
            if (!eligible(current)) return { state: 'stale' };
            const observed = await this.native.read();
            if (!eligible(current)) return { state: 'stale' };
            if (observed.state !== 'ready') return { state: observed.state };
            if (!same(observed.value, expected) || this.guard.capture() !== witness || this.guard.pending) return { state: 'conflict' };
            if (!this.guard.uncertain) return { state: 'unchanged' };
            if (!eligible(current)) return { state: 'stale' };
            if (!this.guard.reconcile(witness)) return { state: 'conflict' };
            this.changed(); return { state: 'reconciled', revision: expected.revision, current: eligible(current) };
        });
    }
}
