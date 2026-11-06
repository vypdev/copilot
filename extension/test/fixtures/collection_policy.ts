import { decideCollectionPolicy, type CollectionMode, type CollectionPolicyCommand } from '../../src/domain/collection_policy.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';

export const COLLECTION_ID = 'a'.repeat(32);
export const collectionChange = (mode: CollectionMode = 'active', revision = 0, id = COLLECTION_ID): Extract<CollectionPolicyCommand, { type: 'set' }> =>
    ({ type: 'set', expectedRevision: revision, mode, operationId: id, settingsRevision: 1 });
export function activeCollectionPolicy(kind: JournalKind = 'diagnostics') {
    const decision = decideCollectionPolicy(kind, undefined, collectionChange());
    if (!decision.write) throw new Error('invalid-policy-fixture');
    return decision.write;
}
