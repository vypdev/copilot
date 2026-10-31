import { vi } from 'vitest';
import { ApiCacheClient } from '../../src/application/api_cache_client.ts';
import { apiCacheReviewsFixture, CACHE_OWNER } from './api_cache_reviews.ts';
import type { ApiCacheRequest } from '../../src/domain/api_cache_request.ts';

export function apiCacheClientFixture() {
    const native = apiCacheReviewsFixture(); let canReview = true; let canInspect = true;
    const ports = { now: vi.fn(() => native.ports.now()), canReview: () => canReview, canInspect: () => canInspect, changed: vi.fn(),
        request: vi.fn<(input: ApiCacheRequest) => Promise<unknown>>(async input => {
            if (input.method === 'center.cache.preview') return native.reviews.preview(CACHE_OWNER);
            if (input.method === 'center.cache.confirm') return native.reviews.confirm(input.operationId, CACHE_OWNER);
            if (input.method === 'center.cache.cancel') return native.reviews.cancel(input.operationId, CACHE_OWNER);
            return native.reviews.inspect(input.operationId, CACHE_OWNER);
        }) };
    return { ...native, client: new ApiCacheClient(ports), clientPorts: ports,
        allow: (review: boolean, inspect = review) => { canReview = review; canInspect = inspect; } };
}
