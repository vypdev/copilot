import type { SettingsAction } from './settings_change.ts';
import type { SettingsCommit } from './settings_result.ts';
import type { OperationFact } from './journal_facts.ts';
import type { OperationStage } from './current_operation.ts';

export function settingsObservation<P extends 'reviewed' | 'cancelled' | 'blocked' | 'submitted'>(action: SettingsAction, phase: P): Readonly<OperationFact & { readonly phase: P }> {
    return Object.freeze({ kind: 'operation', action, phase, acknowledgement: phase === 'submitted' ? 'unknown' : 'not-submitted', observation: 'not-observed' });
}
/** Observe actual service facts; confirmation alone is not evidence of a store submission. */
export function settingsCompletion(action: SettingsAction, submitted: boolean, outcome: SettingsCommit): {
    readonly stage: OperationStage; readonly fact: (OperationFact & { readonly phase: 'blocked' | 'settled' }) | null;
} {
    if (outcome.state === 'committed' || outcome.state === 'replayed') return { stage: 'settled', fact: Object.freeze({ kind: 'operation', action,
        phase: 'settled', acknowledgement: outcome.state === 'committed' ? outcome.acknowledgement : 'unknown', observation: 'committed' }) };
    if (outcome.state === 'unknown') return { stage: 'unknown', fact: !submitted && outcome.acknowledgement === 'unknown' && outcome.observation === 'unavailable' ? null
        : Object.freeze({ kind: 'operation', action, phase: 'settled', acknowledgement: outcome.acknowledgement, observation: outcome.observation }) };
    return { stage: submitted ? 'unknown' : 'blocked', fact: submitted ? null : settingsObservation(action, 'blocked') };
}
