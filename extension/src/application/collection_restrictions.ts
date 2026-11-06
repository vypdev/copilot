import { loadCollectionPolicy, validCollectionPolicy, type CollectionPolicyLoad } from '../domain/collection_policy.ts';
import type { JournalKind } from '../domain/journal_facts.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import { deepFreeze } from '../domain/value.ts';
import type { CollectionPolicyStore } from './collection_policy_ports.ts';
import type { CollectionRestrictionFact } from '../domain/history_state.ts';
import { reportPolicyObservation, type CollectionPolicyTrace } from './collection_policy_observation_ports.ts';
import { attemptCollectionPolicy } from './collection_policy_attempt.ts';
export type { CollectionRestrictionFact } from '../domain/history_state.ts';

export type CollectionObservation = CollectionPolicyLoad | { readonly state: 'unavailable' };
export interface CollectionRestrictionResult {
    readonly observed: CollectionObservation; readonly fact: CollectionRestrictionFact;
    readonly attributed: boolean;
    /** The submitted native identity is private; public facts do not contain an unexecuted nonce. */
    readonly operationId: string | null;
}
export function collectionCurrent(current: () => boolean): boolean { try { return current() === true; } catch { return false; } }
export async function readCollectionPolicy(store: CollectionPolicyStore, kind: JournalKind): Promise<CollectionObservation> {
    try {
        const result = await store.execute(kind, { type: 'read' });
        if (result.state === 'future' || result.state === 'corrupt') return { state: result.state };
        return result.state === 'ready' ? validCollectionPolicy(kind, result.policy) ? loadCollectionPolicy(kind, result.policy)
            : { state: 'corrupt' } : { state: 'unavailable' };
    } catch { return { state: 'unavailable' }; }
}

/** Restrict once, then independently read. An observed pause never attributes another owner's write to this call. */
export async function pauseCollectionPolicy(store: CollectionPolicyStore, kind: JournalKind, settingsRevision: number,
    identifier: () => string, current: () => boolean, trace?: CollectionPolicyTrace | null): Promise<CollectionRestrictionResult> {
    let observed = await readCollectionPolicy(store, kind);
    let operationId: string | null = null;
    let acknowledgement: CollectionRestrictionFact['acknowledgement'] = 'not-attempted';
    let expectedRevision: number | null = null;
    if (observed.state === 'ready' && observed.policy.mode === 'active' && collectionCurrent(current)) {
        let id: string | null;
        try { id = identifier(); } catch { id = null; }
        if (settingsOperationId(id)) {
            operationId = id;
            expectedRevision = observed.policy.revision;
            const result = await attemptCollectionPolicy(store, kind, { type: 'set', mode: 'paused', expectedRevision,
                settingsRevision, operationId: id }, current, trace);
            acknowledgement = result.state === 'written' || result.state === 'replayed' ? 'accepted'
                : result.state === 'unavailable' && result.effect === 'unknown' ? 'unknown' : 'not-applied';
            observed = await readCollectionPolicy(store, kind);
        }
    }
    const attributed = operationId !== null && expectedRevision !== null && observed.state === 'ready' && observed.policy.mode === 'paused'
        && observed.policy.revision === expectedRevision + 1 && observed.policy.receipt?.id === operationId
        && observed.policy.receipt.beforeRevision === expectedRevision && observed.policy.receipt.settingsRevision === settingsRevision;
    reportPolicyObservation(trace, { acknowledgement, observation: observed.state === 'ready' ? observed.policy.mode : 'unavailable',
        revision: observed.state === 'ready' ? observed.policy.revision : null, attributed });
    return deepFreeze({ observed, operationId, attributed, fact: { acknowledgement, observation: observed.state === 'ready' ? observed.policy.mode : 'unavailable',
        policyRevision: observed.state === 'ready' ? observed.policy.revision : null, sourceCurrentAtObservation: collectionCurrent(current) } });
}
