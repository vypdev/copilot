import { vi } from 'vitest';
import { ApiCacheReviews } from '../../src/application/api_cache_reviews.ts';
import type { ApiCacheFactState } from '../../src/domain/api_cache.ts';
import type { SettingsOwnerFence } from '../../src/domain/settings_result.ts';
import { cacheSchedulerFixture } from './cache_scheduler.ts';

export const CACHE_OWNER = 'a'.repeat(32);
export function apiCacheReviewsFixture() {
    const native = cacheSchedulerFixture(); let now = 1000; let next = 1;
    let fence: SettingsOwnerFence | null = { controllerEpoch: 1, credentialEpoch: 2 };
    const observed: ApiCacheFactState[] = [];
    const cache = { capture: vi.fn(() => native.scheduler.captureApiCache()), current: vi.fn((witness: Readonly<object>) => native.scheduler.apiCacheCurrent(witness)),
        clear: vi.fn((witness: Readonly<object>, current: () => boolean) => native.scheduler.clearApiCache(witness, current)) };
    const ports = { now: vi.fn(() => now), identifier: vi.fn(() => (next++).toString(16).padStart(32, '0')),
        fence: vi.fn((_owner: string) => fence), observe: vi.fn((_owner: string, _current: () => boolean) => (state: ApiCacheFactState) => { observed.push(state); }) };
    const reviews = new ApiCacheReviews(cache, ports);
    const preview = () => { const reply = reviews.preview(CACHE_OWNER); if (reply.state !== 'preview') throw new Error(reply.state); return reply; };
    return { ...native, cache, ports, observed, reviews, preview, advanceReview: (ms: number) => { now += ms; }, clock: (value: number) => { now = value; },
        source: (value: SettingsOwnerFence | null) => { fence = value; } };
}
