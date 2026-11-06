import type { ApiCachePort } from '../application/api_cache_ports.ts';
import type { ReadScheduler } from '../application/read_scheduler.ts';

/** Native-only response authority; secondary lease retirement cannot repeat a completed clear. */
export function createApiCache(scheduler: ReadScheduler, retirePages: () => void, notify: () => void): ApiCachePort {
    return { capture: () => scheduler.captureApiCache(), current: witness => scheduler.apiCacheCurrent(witness),
        clear: (witness, current) => {
            if (!scheduler.clearApiCache(witness, current)) return false;
            try { retirePages(); } catch { /* The scheduler already discarded bodies and cancelled pending reads. */ }
            try { notify(); } catch { /* Publication cannot change the primary result. */ }
            return true;
        } };
}
