import type { JournalKind } from '../domain/journal_facts.ts';
import type { SettingsOwnerFence } from '../domain/settings_result.ts';
import type { CollectionAction } from '../domain/collection_review.ts';
import type { CollectionPolicyStore } from './collection_policy_ports.ts';
import { CollectionReviews } from './collection_reviews.ts';
import { JournalReviews } from './journal_reviews.ts';
import type { CollectionHistory, CollectionHistoryPorts } from './collection_history.ts';
import type { ObserveCollectionOperation } from './collection_observation_ports.ts';
import type { ObserveClearOperation } from './clear_observation_ports.ts';

/** Retained reviews share the same controller, preference queue, collection reservation and actual writer. */
export class HistoryControls {
    readonly collection: CollectionReviews;
    readonly clear: JournalReviews;
    constructor(private readonly history: CollectionHistory, policies: CollectionPolicyStore,
        ports: Pick<CollectionHistoryPorts, 'now' | 'identifier'> & { fence(owner: string): SettingsOwnerFence | null; observe?: ObserveCollectionOperation; observeClear?: ObserveClearOperation }) {
        const { observe, observeClear, ...native } = ports;
        this.collection = new CollectionReviews(history.settings, history.coordinator, policies, { ...native, observe });
        this.clear = new JournalReviews(history.store, history.settings, { ...native, observe: observeClear,
            idle: kind => history.writer.idle(kind), pausedPolicyRevision: kind => history.coordinator.pausedPolicyRevision(kind),
            reserve: (...args) => history.coordinator.reserve(...args) });
    }
    invalidate(): void { this.collection.invalidate(); this.clear.invalidate(); }
    async previewClear(kind: JournalKind, owner: string) {
        await this.history.coordinator.refresh(); return this.clear.preview(kind, owner);
    }
    previewCollection(kind: JournalKind, action: CollectionAction, owner: string) { return this.collection.preview(kind, action, owner); }
}
