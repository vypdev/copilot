import { SESSION_RESULTS, deepFreezeSessionFact, sessionEffectAllowed, type SessionAction, type SessionEffect, type SessionFact, type SessionResult } from '../domain/session_fact.ts';
import type { ProtectedMutationTrace, ProtectedMutationFact } from './protected_mutation.ts';
import type { SessionOperationTrace } from './session_observation_ports.ts';

/** Ordered native effects only. No target, credential, selector or raw service result is retained here. */
export class SessionObservations implements SessionOperationTrace {
    private value: SessionFact;
    constructor(action: SessionAction, private readonly changed: (fact: SessionFact) => void, private readonly advance: (previous: number, next: number) => void) {
        this.value = deepFreezeSessionFact({ kind: 'session-operation', action, state: 'running', result: 'pending', effects: [], incomplete: false });
    }
    get fact(): SessionFact { return this.value; }
    private publish(value: SessionFact): void {
        this.value = deepFreezeSessionFact(value);
        try { this.changed(this.value); } catch { /* Primary service and private facts survive a failed sink. */ }
    }
    credential(previous: number, next: number): void { if (this.value.state !== 'settled') { try { this.advance(previous, next); } catch { /* The source fails closed independently. */ } } }
    step(effect: SessionEffect): ProtectedMutationTrace {
        let ordinal: number | null = null;
        return Object.freeze({
            submitted: () => {
                if (ordinal !== null || this.value.state === 'settled') return;
                if (!sessionEffectAllowed(this.value.action, effect)) { if (!this.value.incomplete) this.publish({ ...this.value, incomplete: true }); return; }
                if (this.value.effects.length >= 16) { if (!this.value.incomplete) this.publish({ ...this.value, incomplete: true }); return; }
                ordinal = this.value.effects.length + 1;
                this.publish({ ...this.value, effects: [...this.value.effects, { ordinal, effect, state: 'submitted', acknowledgement: 'unknown', observation: 'not-observed' }] });
            },
            settled: (fact: ProtectedMutationFact) => {
                if (ordinal === null || this.value.state === 'settled' || this.value.effects[ordinal - 1].state === 'settled') return;
                if (!['accepted', 'unknown'].includes(fact.acknowledgement) || !['committed', 'different', 'unavailable'].includes(fact.observation)) return;
                const effects = this.value.effects.map(value => value.ordinal === ordinal ? { ...value, state: 'settled' as const, acknowledgement: fact.acknowledgement, observation: fact.observation } : value);
                this.publish({ ...this.value, effects });
            },
        });
    }
    complete(result: SessionResult): void {
        if (this.value.state === 'settled' || !SESSION_RESULTS.includes(result)) return;
        this.publish({ ...this.value, state: 'settled', result, incomplete: this.value.incomplete || this.value.effects.some(effect => effect.state === 'submitted') });
    }
}
