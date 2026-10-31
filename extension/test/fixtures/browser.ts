import { vi } from 'vitest';
import type { BrowserApi, BrowserStorageArea } from '../../src/adapters/browser/api.ts';
import { nativePortPair } from './native_port.ts';
import { CENTER_SENDER } from './center.ts';
import { event } from './browser_event.ts';
export { event } from './browser_event.ts';

function storageFixture() {
    const values = new Map<string, unknown>();
    const area: BrowserStorageArea = { get: vi.fn(async key => ({ [key]: values.get(key) })),
        set: vi.fn(async object => { for (const [key, value] of Object.entries(object)) values.set(key, value); }),
        remove: vi.fn(async key => { values.delete(key); }), setAccessLevel: vi.fn(async () => undefined) };
    return { area, values };
}
export function browserFixture(copies?: Readonly<{ request: 1 | 2; reply: 1 | 2 }>) {
    const local = storageFixture(); const session = storageFixture();
    const onMessage = event<Parameters<BrowserApi['runtime']['onMessage']['addListener']>[0]>();
    const onUpdated = event<Parameters<BrowserApi['tabs']['onUpdated']['addListener']>[0]>();
    const onRemoved = event<(id: number) => void>();
    const onActivated = event<(active: { tabId: number; windowId: number }) => void>();
    const permissionRemoved = event<(value: { origins?: string[] }) => void>();
    const changed = event<(value: Record<string, unknown>, area: string) => void>();
    const clicked = event<() => void>();
    const onConnect = event<Parameters<BrowserApi['runtime']['onConnect']['addListener']>[0]>();
    const ports: ReturnType<typeof nativePortPair>[] = [];
    const connect: BrowserApi['runtime']['connect'] = options => {
        const pair = nativePortPair(options.name, CENTER_SENDER, copies); ports.push(pair);
        queueMicrotask(() => { if (!onConnect.listeners.size) pair.server.disconnect(); else for (const listener of onConnect.listeners) listener(pair.server); });
        return pair.client;
    };
    const api: BrowserApi = { runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`,
        sendMessage: vi.fn(async () => ({ state: 'disconnected' })), onMessage, onConnect, connect: vi.fn(connect) },
    storage: { local: local.area, session: session.area, onChanged: changed },
    permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true), onRemoved: permissionRemoved },
    tabs: { get: vi.fn(async () => ({ url: 'https://github.com/octo/example/issues/42', active: true, incognito: false, windowId: 1 })),
        query: vi.fn(async () => []), sendMessage: vi.fn(async () => undefined), create: vi.fn(async () => undefined), onUpdated, onRemoved, onActivated },
    action: { onClicked: clicked }, extension: { inIncognitoContext: false } };
    return { api, localArea: local.area, localValues: local.values, sessionArea: session.area, sessionValues: session.values, onMessage, onConnect, ports, onUpdated, onRemoved, onActivated, permissionRemoved, changed, clicked };
}
