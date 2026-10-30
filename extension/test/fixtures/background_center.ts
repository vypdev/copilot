import { vi } from 'vitest';
import { browserFixture } from './browser.ts';
import { startBackground } from '../../src/infrastructure/background_runtime.ts';
import { CenterClient } from '../../src/application/center_client.ts';
import type { Sender } from '../../src/domain/protocol.ts';

/** Actual composition and wire protocol, deterministic browser/provider ports; not loaded-browser evidence. */
export function backgroundCenterFixture(configure: (browser: ReturnType<typeof browserFixture>) => void = () => undefined) {
    const h = browserFixture(); configure(h);
    const provider = vi.fn(async (url: string) => {
        const data = url.endsWith('/user') ? { id: 1, login: 'octo' }
            : url.endsWith('/repos/octo/other') ? { id: 8, full_name: 'octo/other' } : { id: 7, full_name: 'octo/example' };
        const response = new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
        Object.defineProperty(response, 'url', { value: url }); return response;
    });
    vi.stubGlobal('fetch', provider);
    const stop = startBackground(h.api); const listener = [...h.onMessage.listeners][0];
    const sender: Sender = { id: 'test', url: 'chrome-extension://test/runtime.html#/connections', documentId: 'current-center', tab: { id: 1, incognito: false } };
    const clients: CenterClient[] = [];
    const call = (value: unknown, source = sender) => new Promise<Record<string, unknown>>(resolve => listener(value, source, value => resolve(value as Record<string, unknown>)));
    return { ...h, provider, sender, call, client: async (source = sender) => {
        const client = new CenterClient({ sourceTree: 'unbundled', send: message => call(message, source) }); clients.push(client);
        await client.start(); await client.connections(); return client;
    }, stop: () => { for (const client of clients) client.stop(); stop(); } };
}
export async function connectReadThroughCenter(call: (value: unknown) => Promise<unknown>, secret: string, repository: string): Promise<unknown> {
    const client = new CenterClient({ sourceTree: 'unbundled', send: call });
    try {
        await client.start(); await client.connections();
        const view = client.view.connections;
        if (view?.state !== 'ready') throw new Error('fixture-session-view-unavailable');
        await client.connections({ type: 'connect', name: 'Test read session', secret, repository }, view.revision);
        return await call({ version: 1, method: 'session.status' });
    } finally { client.stop(); }
}
