import type { CollectionPolicyCommand, CollectionPolicyResult } from '../domain/collection_policy.ts';
import type { JournalKind } from '../domain/journal_facts.ts';

/** Fixed background policy operations; a renderer never supplies the private native guard. */
export interface CollectionPolicyStore {
    execute(kind: JournalKind, command: CollectionPolicyCommand, eligible?: () => boolean): Promise<CollectionPolicyResult>;
}
