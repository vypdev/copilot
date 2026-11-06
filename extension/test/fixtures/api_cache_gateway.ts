import { vi } from 'vitest';
import { ApiCacheReviews } from '../../src/application/api_cache_reviews.ts';
import { CenterGateway } from '../../src/application/center_gateway.ts';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { centerFixture, CENTER_SENDER } from './center.ts';
import { cacheSchedulerFixture } from './cache_scheduler.ts';
import { sessionHarness } from './runtime.ts';
export function apiCacheGatewayFixture(enabled = true) {
    const center = centerFixture(); const native = cacheSchedulerFixture(); const session = sessionHarness();
    const cache = { capture: vi.fn(() => native.scheduler.captureApiCache()), current: (w: Readonly<object>) => native.scheduler.apiCacheCurrent(w),
        clear: vi.fn((w: Readonly<object>, current: () => boolean) => native.scheduler.clearApiCache(w, current)) };
    const reviews = new ApiCacheReviews(cache, { now: center.ports.now, identifier: center.ports.identifier, fence: id => center.controller.fence(id) });
    center.ports.changed.mockImplementation(() => { center.operations.invalidate(); reviews.invalidate(); });
    const gateway = new CenterGateway(center.controller, center.operations, center.repository, undefined, undefined, undefined, undefined, undefined, undefined, enabled ? reviews : undefined);
    const main = new MessageGateway('test', 'chrome-extension://test/', center.repository, session.service,
        { currentTab: vi.fn(), openSettings: vi.fn(), cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() }, gateway);
    const call = (value: unknown, sender = CENTER_SENDER) => main.handle({ version: 1, ...value as object }, sender);
    return { center, native, session, cache, reviews, gateway, main, call };
}
