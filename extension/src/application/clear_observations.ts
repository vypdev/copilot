import { initialClearFact, mergeClearFact, type ClearFact } from '../domain/clear_fact.ts';
import { clearIssue } from '../domain/clear_operation.ts';
import type { JournalClearOutcome } from '../domain/journal_clear.ts';
import type { ClearOperationTrace } from './clear_observation_ports.ts';

/** One closed observed operation; no generation selector, raw result or private target is retained. */
export class ClearObservations implements ClearOperationTrace {
    private value: ClearFact;
    constructor(kind: ClearFact['collection'], private readonly changed: (value: ClearFact) => void) { this.value = initialClearFact(kind); }
    get fact(): ClearFact { return this.value; }
    private publish(value: ClearFact): void {
        const next = mergeClearFact(this.value, value); if (!next || next === this.value) return;
        this.value = next; try { this.changed(next); } catch { /* The native operation and immutable facts survive a failed sink. */ }
    }
    confirming(): void { if (this.value.state === 'reviewed') this.publish({ ...this.value, state: 'running' }); }
    cancelled(): void { if (this.value.state === 'reviewed') this.publish({ ...this.value, state: 'cancelled', result: 'cancelled' }); }
    blocked(): void { if (this.value.state === 'reviewed') this.publish({ ...this.value, state: 'blocked', result: 'blocked' }); }
    submitted(): void {
        if (this.value.state === 'running' && !this.value.submitted) this.publish({ ...this.value, submitted: true,
            acknowledgement: this.value.acknowledgement === 'not-observed' ? 'unknown' : this.value.acknowledgement });
    }
    acknowledged(acknowledgement: 'accepted' | 'unknown' | 'not-applied'): void {
        if (this.value.state === 'running' && ['accepted', 'unknown', 'not-applied'].includes(acknowledgement))
            this.publish({ ...this.value, acknowledgement, incomplete: this.value.incomplete || !this.value.submitted });
    }
    complete(result: JournalClearOutcome): void {
        if (this.value.state !== 'running') return;
        const base = { ...this.value, state: 'settled' as const };
        if (result.state === 'observed-cleared' || result.state === 'unknown') {
            this.publish({ ...base, result: result.state, acknowledgement: base.acknowledgement === 'accepted' ? 'accepted' : result.acknowledgement,
                observation: result.state === 'observed-cleared' ? 'cleared' : result.observation,
                sourceCurrentAtObservation: result.sourceCurrentAtObservation, incomplete: base.incomplete || !base.submitted });
        } else if (result.state === 'not-applied') {
            this.publish({ ...base, result: result.state, acknowledgement: 'not-applied', observation: 'not-applied', notAppliedReason: result.reason,
                incomplete: base.incomplete || !base.submitted });
        } else if (clearIssue(result.state)) this.publish({ ...base, result: result.state,
            observation: base.acknowledgement === 'not-observed' ? 'not-observed' : 'unavailable' });
    }
}
