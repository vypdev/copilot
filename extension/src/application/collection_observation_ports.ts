import type { CollectionAction, CollectionSettled } from '../domain/collection_review.ts';
import type { CollectionFact } from '../domain/collection_fact.ts';
import type { SettingsCommit } from '../domain/settings_result.ts';
import type { CollectionPolicyTrace } from './collection_policy_observation_ports.ts';

export interface CollectionOperationTrace {
    confirming(): void; cancelled(): void; blocked(): void;
    preferenceSubmitted(): void; preference(result: SettingsCommit): void;
    policy(phase: 'pause' | 'activation'): CollectionPolicyTrace | null;
    complete(result: CollectionSettled): void;
}
export type ObserveCollectionOperation = (owner: string, kind: CollectionFact['collection'], action: CollectionAction,
    preferenceRequired: boolean, current: () => boolean) => CollectionOperationTrace | null;
export function reportCollection(trace: CollectionOperationTrace | null | undefined,
    event: 'confirming' | 'cancelled' | 'blocked' | 'preferenceSubmitted'): void {
    try { trace?.[event](); } catch { /* A secondary observer cannot control the retained plan. */ }
}
export function collectionPolicyTrace(trace: CollectionOperationTrace | null | undefined, phase: 'pause' | 'activation'): CollectionPolicyTrace | null {
    try { return trace?.policy(phase) ?? null; } catch { return null; }
}
export function reportCollectionPreference(trace: CollectionOperationTrace | null | undefined, result: SettingsCommit): void {
    try { trace?.preference(Object.freeze({ ...result })); } catch { /* Primary preference facts survive. */ }
}
export function completeCollection(trace: CollectionOperationTrace | null | undefined, result: CollectionSettled): void {
    try { trace?.complete(Object.freeze({ ...result, preference: Object.freeze({ ...result.preference }),
        policy: Object.freeze({ ...result.policy }), observedPreference: result.observedPreference && Object.freeze({ ...result.observedPreference }) })); }
    catch { /* Primary replay remains independent from observer and renderer availability. */ }
}
