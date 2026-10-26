import { vi } from 'vitest';
import type { StoragePort, RuntimeContext } from '../../src/application/runtime_ports.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { pageIdentity } from '../../src/domain/page.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { ReadScheduler } from '../../src/application/read_scheduler.ts';
import { ProtectedSessionService } from '../../src/application/protected_session.ts';
import type { GitHubReadPort, ReadResult } from '../../src/application/read_ports.ts';

import type { ReadRequest } from '../../src/domain/read.ts';

export function memoryStore() {
    const values = new Map<string, unknown>();
    const port: StoragePort = {
        get: vi.fn(async key => values.has(key) ? structuredClone(values.get(key)) : undefined),
        set: vi.fn(async (key, value) => { values.set(key, structuredClone(value)); }),
        remove: vi.fn(async key => { values.delete(key); }),
    };
    return { values, port };
}
export function context(route = 'https://github.com/octo/example/issues/42'): RuntimeContext {
    return { page: pageIdentity(route)!, epochs: { route: 1, object: 1, settings: 0, credential: 0 },
        settings: DEFAULT_SETTINGS, paused: false, repositoryId: '7' };
}
export function deferred<T>() {
    let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
export const CONNECTED = { schemaVersion: 1, secret: 'synthetic_not_a_real_credential', viewerId: '1', viewerLogin: 'octo', repositoryId: '7', repository: 'octo/example' };
export const PAGE = { version: 1, method: 'page.snapshot', route: 'https://github.com/octo/example/issues/42', generation: 1,
    repositoryId: '7', viewer: 'octo', visible: true, manual: true } as const;
export function sessionHarness() {
    const store = memoryStore(); let now = 100000;
    const reader: GitHubReadPort = { read: vi.fn(async (request): Promise<ReadResult> => ({ state: 'ok', etag: 'etag', bytes: 12,
        data: request.type === 'viewer' ? { id: '1', login: 'octo' } : request.type === 'repository' ? { id: '7', name: 'octo/example' }
            : { kind: request.kind, number: request.number, title: 'Original public fixture', state: 'open', url: PAGE.route } })) };
    const scheduler = new ReadScheduler(store.port, reader, () => now, () => 0);
    const ports = { cancellation: () => new BrowserCancellation(), permitted: vi.fn(async () => true), protected: vi.fn(async () => true) };
    const service = new ProtectedSessionService(store.port, scheduler, ports);
    return { ...store, service, scheduler, ports, reader, advance: (ms: number) => { now += ms; } };
}
export function requestResult(request: ReadRequest): Extract<ReadResult, { state: 'ok' }> {
    return { state: 'ok', etag: '', bytes: 10, data: request.type === 'viewer' ? { id: '1', login: 'octo' } : { id: '7', name: 'octo/example' } };
}
