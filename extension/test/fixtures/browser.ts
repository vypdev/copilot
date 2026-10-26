import { vi } from 'vitest';
import type { BrowserApi, BrowserEvent, BrowserStorageArea } from '../../src/adapters/browser/api.ts';

export function event<T>(): BrowserEvent<T> & { listeners: Set<T> } {
    const listeners = new Set<T>();
    return { listeners, addListener: vi.fn(listener => { listeners.add(listener); }), removeListener: vi.fn(listener => { listeners.delete(listener); }) };
}
function storageFixture() {
    const values = new Map<string, unknown>();
    const area: BrowserStorageArea = { get: vi.fn(async key => ({ [key]: values.get(key) })),
        set: vi.fn(async object => { for (const [key, value] of Object.entries(object)) values.set(key, value); }),
        remove: vi.fn(async key => { values.delete(key); }), setAccessLevel: vi.fn(async () => undefined) };
    return { area, values };
}
export function browserFixture() {
    const local = storageFixture(); const session = storageFixture();
    const onMessage = event<Parameters<BrowserApi['runtime']['onMessage']['addListener']>[0]>();
    const onUpdated = event<Parameters<BrowserApi['tabs']['onUpdated']['addListener']>[0]>();
    const onRemoved = event<(id: number) => void>();
    const permissionRemoved = event<(value: { origins?: string[] }) => void>();
    const changed = event<(value: Record<string, unknown>, area: string) => void>();
    const clicked = event<() => void>();
    const api: BrowserApi = { runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`,
        sendMessage: vi.fn(async () => ({ state: 'disconnected' })), onMessage },
    storage: { local: local.area, session: session.area, onChanged: changed },
    permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true), onRemoved: permissionRemoved },
    tabs: { get: vi.fn(async () => ({ url: 'https://github.com/octo/example/issues/42', active: true, incognito: false, windowId: 1 })),
        query: vi.fn(async () => []), sendMessage: vi.fn(async () => undefined), create: vi.fn(async () => undefined), onUpdated, onRemoved },
    action: { onClicked: clicked }, extension: { inIncognitoContext: false } };
    return { api, localArea: local.area, localValues: local.values, sessionArea: session.area, sessionValues: session.values, onMessage, onUpdated, onRemoved, permissionRemoved, changed, clicked };
}
