import { vi } from 'vitest';
import { ReadScheduler } from '../../src/application/read_scheduler.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { memoryStore } from './runtime.ts';
import type { GitHubReadPort } from '../../src/application/read_ports.ts';
export const CACHE_ACTIVITY = { visible: true, active: true, online: true, manual: true, pending: true };
export const CACHE_SUCCESS = { state: 'ok', data: { id: '1', login: 'synthetic-viewer' }, etag: 'synthetic-etag', bytes: 10 } as const;
export function cacheSchedulerFixture() {
    const store = memoryStore(); let now = 100000;
    const reader: GitHubReadPort = { read: vi.fn(async () => CACHE_SUCCESS) };
    const scheduler = new ReadScheduler(store.port, reader, () => now, () => 0);
    const run = (key = 'response', manual = true) => scheduler.run(key, '7', { type: 'viewer' }, 'synthetic_credential', new BrowserCancellation(), { ...CACHE_ACTIVITY, manual });
    return { ...store, reader, scheduler, run, advance: (ms: number) => { now += ms; } };
}
