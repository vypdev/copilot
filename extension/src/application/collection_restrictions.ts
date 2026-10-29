import { loadCollectionPolicy, validCollectionPolicy, type CollectionPolicyLoad, type CollectionPolicyResult } from '../domain/collection_policy.ts';
import type { JournalKind } from '../domain/journal_facts.ts';
import { settingsOperationId } from '../domain/settings_operation.ts';
import { deepFreeze } from '../domain/value.ts';
import type { CollectionPolicyStore } from './collection_policy_ports.ts';

export type CollectionObservation = CollectionPolicyLoad | { readonly state: 'unavailable' };
export interface CollectionRestrictionFact {
    readonly acknowledgement: 'not-attempted' | 'not-applied' | 'accepted' | 'unknown';
    readonly observation: 'paused' | 'active' | 'unavailable';
    readonly policyRevision: number | null;
    readonly sourceCurrentAtObservation: boolean;
}
export interface CollectionRestrictionResult {
    readonly observed: CollectionObservation; readonly fact: CollectionRestrictionFact;
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
    identifier: () => string, current: () => boolean): Promise<CollectionRestrictionResult> {
    let observed = await readCollectionPolicy(store, kind);
    let operationId: string | null = null;
    let acknowledgement: CollectionRestrictionFact['acknowledgement'] = 'not-attempted';
    if (observed.state === 'ready' && observed.policy.mode === 'active' && collectionCurrent(current)) {
        let id: string | null;
        try { id = identifier(); } catch { id = null; }
        if (settingsOperationId(id)) {
            operationId = id;
            let result: CollectionPolicyResult;
            try { result = await store.execute(kind, { type: 'set', mode: 'paused', expectedRevision: observed.policy.revision,
                settingsRevision, operationId: id }, current); }
            catch { result = { state: 'unavailable', effect: 'unknown' }; }
            acknowledgement = result.state === 'written' || result.state === 'replayed' ? 'accepted'
                : result.state === 'unavailable' && result.effect === 'unknown' ? 'unknown' : 'not-applied';
            observed = await readCollectionPolicy(store, kind);
        }
    }
    return deepFreeze({ observed, operationId, fact: { acknowledgement, observation: observed.state === 'ready' ? observed.policy.mode : 'unavailable',
        policyRevision: observed.state === 'ready' ? observed.policy.revision : null, sourceCurrentAtObservation: collectionCurrent(current) } });
}
