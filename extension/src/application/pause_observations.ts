import { initialPauseFact, mergePauseFact, pauseResultIssue, type PauseAction, type PauseFact } from '../domain/pause_fact.ts';
import type { PauseReviewOutcome } from '../domain/temporary_pause_review.ts';
import type { ProtectedMutationFact } from './protected_mutation.ts';
import type { PauseOperationTrace } from './pause_observation_ports.ts';

/** Redacted facts of one user review. Native expiry never creates this observer or a synthetic user operation. */
export class PauseObservations implements PauseOperationTrace {
    private value: PauseFact;
    constructor(action: PauseAction, private readonly changed: (value: PauseFact) => void) { this.value = initialPauseFact(action); }
    get fact(): PauseFact { return this.value; }
    private publish(value: PauseFact): void {
        const next = mergePauseFact(this.value, value); if (!next || next === this.value) return;
        this.value = next; try { this.changed(next); } catch { /* Proven facts survive a failed secondary sink. */ }
    }
    confirming(): void { if (this.value.state === 'reviewed') this.publish({ ...this.value, state: 'running' }); }
    cancelled(): void { if (this.value.state === 'reviewed') this.publish({ ...this.value, state: 'cancelled', result: 'cancelled' }); }
    submitted(): void {
        if (this.value.state === 'running' && this.value.action !== 'adopt-pauses' && !this.value.submitted)
            this.publish({ ...this.value, submitted: true, acknowledgement: 'unknown' });
    }
    acknowledged(acknowledgement: 'accepted' | 'unknown'): void {
        if (this.value.state === 'running' && this.value.action !== 'adopt-pauses') this.publish({ ...this.value,
            acknowledgement: this.value.acknowledgement === 'accepted' ? 'accepted' : acknowledgement,
            incomplete: this.value.incomplete || !this.value.submitted });
    }
    settled(fact: ProtectedMutationFact): void {
        if (this.value.state !== 'running' || this.value.action === 'adopt-pauses') return;
        this.publish({ ...this.value, acknowledgement: this.value.acknowledgement === 'accepted' ? 'accepted' : fact.acknowledgement,
            observation: this.value.observation === 'committed' ? 'committed' : fact.observation, incomplete: this.value.incomplete || !this.value.submitted });
    }
    complete(result: PauseReviewOutcome): void {
        if (this.value.state !== 'running' && this.value.state !== 'reviewed') return;
        if (result.state === 'cancelled') { this.cancelled(); return; }
        const base = { ...this.value, state: 'settled' as const, incomplete: this.value.incomplete || this.value.state !== 'running' };
        if (result.state === 'committed' || result.state === 'unknown') {
            this.publish({ ...base, result: result.state, acknowledgement: base.acknowledgement === 'accepted' ? 'accepted' : result.acknowledgement,
                observation: base.observation === 'committed' || result.state === 'committed' ? 'committed' : result.observation,
                sourceCurrentAtObservation: result.current, incomplete: base.incomplete || !base.submitted });
        } else if (result.state === 'reconciled') this.publish({ ...base, result: result.state, observation: 'adopted', sourceCurrentAtObservation: result.current });
        else if (pauseResultIssue(result.state)) this.publish({ ...base, result: result.state, incomplete: base.incomplete || base.acknowledgement !== 'not-observed' });
    }
}
