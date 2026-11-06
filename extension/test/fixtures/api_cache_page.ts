import { vi } from 'vitest';
import { createCenter } from '../../src/infrastructure/center_runtime.ts';
import { centerFixture } from './center.ts';
import { centerClientFixture } from './center_client.ts';
import { browserFixture } from './browser.ts';
import { cacheSchedulerFixture } from './cache_scheduler.ts';
import { sessionHarness } from './runtime.ts';

/** Production control-center composition with a real scheduler, deterministic browser/provider ports. */
export function apiCachePageFixture() {
    const native = centerFixture(); const runtime = browserFixture(); const reads = cacheSchedulerFixture(); const session = sessionHarness();
    const cache = { capture: () => reads.scheduler.captureApiCache(), current: (w: Readonly<object>) => reads.scheduler.apiCacheCurrent(w),
        clear: vi.fn((w: Readonly<object>, current: () => boolean) => reads.scheduler.clearApiCache(w, current)) };
    const gateway = createCenter(runtime.api, native.repository, session.service, vi.fn(), undefined, undefined, undefined, undefined, undefined, cache);
    return { ...centerClientFixture({ ...native, gateway }), reads, cache, gateway };
}
