import { vi } from 'vitest';
import { JournalReviews } from '../../src/application/journal_reviews.ts';
import { ClearObservations } from '../../src/application/clear_observations.ts';
import type { ObserveClearOperation } from '../../src/application/clear_observation_ports.ts';
import type { ClearFact } from '../../src/domain/clear_fact.ts';
import { journalReviewsFixture } from './journal_reviews.ts';

/** Actual retained clear plans and effects; deterministic native store, no browser evidence. */
export function clearObserverFixture() {
    const f = journalReviewsFixture(); const snapshots: ClearFact[] = [];
    const captures: { engine: ClearObservations; current(): boolean }[] = [];
    const observe = vi.fn<ObserveClearOperation>((_owner, kind, current) => {
        const engine = new ClearObservations(kind, value => snapshots.push(value)); captures.push({ engine, current }); return engine;
    });
    const reviews = new JournalReviews(f.store, f.settings, { ...f.ports, observe });
    return { ...f, reviews, snapshots, captures, observe, last: () => captures.at(-1)! };
}
