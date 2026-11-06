import { initialCollectionFact, freezeCollectionFact, mergeCollectionFact, collectionPolicyObservation, sameCollectionPolicy, type CollectionFact } from '../domain/collection_fact.ts';
import type { CollectionAction, CollectionSettled, CollectionPolicyFact } from '../domain/collection_review.ts';
import { settingsCompletion } from '../domain/settings_observation.ts';
import type { SettingsCommit } from '../domain/settings_result.ts';
import type { CollectionOperationTrace } from './collection_observation_ports.ts';
import type { CollectionPolicyTrace } from './collection_policy_observation_ports.ts';

/** Fixed independent phase slots. No identifiers, retained plans or provider operands. */
export class CollectionObservations implements CollectionOperationTrace {
    private value: CollectionFact;
    constructor(kind: CollectionFact['collection'], action: CollectionAction, preferenceRequired: boolean, private readonly changed: (fact: CollectionFact) => void) {
        this.value = initialCollectionFact(kind, action, preferenceRequired);
    }
    get fact(): CollectionFact { return this.value; }
    private publish(value: CollectionFact): boolean {
        const next = mergeCollectionFact(this.value, value); if (!next) return false; if (next === this.value) return true;
        this.value = next; try { this.changed(next); } catch { /* The primary effect and these immutable facts survive. */ } return true;
    }
    confirming(): void { if (this.value.state === 'reviewed') this.publish({ ...this.value, state: 'running' }); }
    cancelled(): void { if (this.value.state === 'reviewed') this.publish({ ...this.value, state: 'cancelled', result: 'cancelled' }); }
    blocked(): void { if (this.value.state === 'reviewed') this.publish({ ...this.value, state: 'blocked', result: 'blocked' }); }
    preferenceSubmitted(): void {
        if (this.value.state === 'running' && this.value.preference.phase === 'not-observed')
            this.publish({ ...this.value, incomplete: this.value.incomplete || !this.value.preferenceRequired,
                preference: { phase: 'submitted', acknowledgement: 'unknown', observation: 'not-observed' } });
    }
    preference(result: SettingsCommit): void {
        if (this.value.state !== 'running') return;
        const value = settingsCompletion('center-preferences', this.value.preference.phase === 'submitted', result).fact;
        if (value) this.publish({ ...this.value, preference: { phase: value.phase,
            acknowledgement: value.acknowledgement, observation: value.observation } });
    }
    policy(phase: 'pause' | 'activation'): CollectionPolicyTrace | null {
        if (this.value.state !== 'running' || !['pause', 'activation'].includes(phase) || this.value.action === 'stop' && phase === 'activation') return null;
        let submitted = false; let observed = false;
        return Object.freeze({
            submitted: () => {
                if (this.value.state !== 'running' || submitted) return;
                submitted = true;
                if (this.value[phase].phase !== 'not-observed') { this.publish({ ...this.value, incomplete: true }); return; }
                this.publish({ ...this.value, [phase]: { phase: 'submitted', acknowledgement: 'unknown', observation: 'unavailable', revision: null, attributed: false } });
            },
            observed: (fact: CollectionPolicyFact) => {
                if (this.value.state !== 'running' || observed) return;
                const value = { phase: 'observed' as const, acknowledgement: fact.acknowledgement, observation: fact.observation, revision: fact.revision, attributed: fact.attributed };
                if (collectionPolicyObservation(value)) observed = this.publish({ ...this.value, [phase]: value });
            },
        });
    }
    complete(result: CollectionSettled): void {
        if (this.value.state !== 'running' || result.action !== this.value.action || result.kind !== this.value.collection) return;
        const expectedPolicy = result.policy.acknowledgement !== 'not-attempted' || result.policy.observation !== 'unavailable';
        const matchingPolicy = [this.value.pause, this.value.activation].some(value => sameCollectionPolicy(value, { ...result.policy, phase: 'observed' }));
        const missingPreference = result.preference.state !== 'already' && result.preference.state !== 'not-attempted' && this.value.preference.phase === 'not-observed';
        const incomplete = this.value.incomplete || missingPreference || expectedPolicy && !matchingPolicy
            || this.value.preference.phase === 'submitted' || this.value.pause.phase === 'submitted' || this.value.activation.phase === 'submitted';
        // Only the primary's explicit historical verification booleans are projected, never its raw result object.
        const next = freezeCollectionFact({ ...this.value, state: 'settled', result: result.reason, incomplete,
            preferenceVerifiedAtObservation: result.preferenceVerifiedAtObservation, admittedAtObservation: result.admittedAtObservation,
            sourceCurrentAtObservation: result.sourceCurrentAtObservation });
        this.publish(next);
    }
}
