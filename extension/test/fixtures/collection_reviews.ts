import { vi } from 'vitest';
import { CollectionReviews } from '../../src/application/collection_reviews.ts';
import type { CollectionAction, CollectionSettled } from '../../src/domain/collection_review.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings.ts';
import { collectionFixture } from './collection_coordinator.ts';

export const COLLECTION_OWNER = 'c'.repeat(32);
export function collectionReviewsFixture(initial: Settings = DEFAULT_SETTINGS) {
    const f = collectionFixture(initial); let now = 1000; let id = 1000;
    const ports = { now: vi.fn(() => now), identifier: vi.fn(() => (++id).toString(16).padStart(32, '0')),
        fence: vi.fn((owner: string) => owner === COLLECTION_OWNER ? { controllerEpoch: 1, credentialEpoch: 1 } : null) };
    const reviews = new CollectionReviews(f.repository, f.coordinator, f.policies, ports);
    return { ...f, ports: { ...f.ports, review: ports }, reviews, advance: (value: number) => { now += value; } };
}
export async function collectionPreview(f: ReturnType<typeof collectionReviewsFixture>, action: CollectionAction = 'start', kind: JournalKind = 'diagnostics') {
    const result = await f.reviews.preview(kind, action, COLLECTION_OWNER);
    if (result.state !== 'preview') throw new Error(`Expected collection preview, received ${result.state}`);
    return result;
}
export async function collectionConfirm(f: ReturnType<typeof collectionReviewsFixture>, id: string): Promise<CollectionSettled> {
    const result = await f.reviews.confirm(id, COLLECTION_OWNER);
    if (result.state !== 'settled') throw new Error(`Expected collection facts, received ${result.state}`);
    return result;
}
