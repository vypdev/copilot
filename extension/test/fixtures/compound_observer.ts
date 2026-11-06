import { vi } from 'vitest';
import { CollectionReviews } from '../../src/application/collection_reviews.ts';
import { CollectionObservations } from '../../src/application/collection_observations.ts';
import type { ObserveCollectionOperation } from '../../src/application/collection_observation_ports.ts';
import type { CollectionFact } from '../../src/domain/collection_fact.ts';
import type { Settings } from '../../src/domain/settings.ts';
import { collectionReviewsFixture } from './collection_reviews.ts';

/** Actual retained plans and native effects over deterministic stores; no renderer or browser claim. */
export function compoundObserverFixture(initial?: Settings) {
    const f = collectionReviewsFixture(initial); const snapshots: CollectionFact[] = [];
    const captures: { engine: CollectionObservations; current(): boolean }[] = [];
    const observe = vi.fn<ObserveCollectionOperation>((_owner, kind, action, preferenceRequired, current) => {
        const engine = new CollectionObservations(kind, action, preferenceRequired, value => snapshots.push(value));
        captures.push({ engine, current }); return engine;
    });
    const reviews = new CollectionReviews(f.repository, f.coordinator, f.policies, { ...f.ports.review, observe });
    return { ...f, reviews, snapshots, captures, observe, last: () => captures.at(-1)! };
}
