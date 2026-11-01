import { vi } from 'vitest';
const nativeMocks = vi.hoisted(() => ({ spawn: vi.fn(), listenFailure: false, closeFailure: false }));
vi.mock('node:child_process', async original => ({ ...await original<object>(), spawn: nativeMocks.spawn }));
vi.mock('node:net', () => ({ createServer: () => {
    let error: (value: Error) => void;
    return { once: (_name: string, listener: typeof error) => { error = listener; },
        listen: (_port: number, _host: string, ready: () => void) => { if (nativeMocks.listenFailure) error(new Error('listen-failed')); else ready(); },
        address: () => ({ port: 31337 }), close: (done: (error?: Error) => void) => done(nativeMocks.closeFailure ? new Error('close-failed') : undefined) };
} }));
import { NativeDriver } from '../../tooling/webdriver.mts';
export const mocks = nativeMocks;
export const artifacts = '/isolated/artifacts';
export function transport(target: 'chrome' | 'firefox' | 'firefox-esr' | 'safari' = 'chrome', visible?: true) {
    const child = { exitCode: null as number | null, on: vi.fn(), kill: vi.fn() }; nativeMocks.spawn.mockReturnValue(child);
    let windows = 0;
    const send = vi.fn(async (url: string, options: RequestInit) => {
        const value = url.endsWith('/window') && options.method === 'GET' ? 'initial-blank' : url.endsWith('/window/new') ? { handle: `owned-tab-${++windows}` } : url.endsWith('/webextension') ? { extension: 'owned-extension-id' } : url.endsWith('/session') && options.method === 'POST' ? { sessionId: 'owned-test-session', capabilities: { browserName: target } }
            : url.endsWith('/execute/sync') ? 'sync-result' : url.endsWith('/execute/async') ? 'async-result' : {};
        return new Response(JSON.stringify({ value }), { headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', send);
    const driver = new NativeDriver({ target, binary: '/isolated/browser', driver: '/isolated/driver', artifact: artifacts, ...(visible ? { visible } : {}) }, async () => undefined);
    return { child, send, driver };
}

export function settingsTransport(target: 'chrome' | 'firefox-esr' | 'safari' = 'chrome') {
    const h = transport(target); const base = h.send.getMockImplementation()!;
    const state = { clicked: false, element: 'settings/button', handles: ['fixture'], url: 'chrome-extension://test/runtime.html', ready: 'complete',
        clickError: '', clickStatus: 200, handlesDelay: 0, loadsDelay: 0, staleClicks: 0, references: 0 };
    h.send.mockImplementation(async (url: string, options: RequestInit) => {
        let value: unknown;
        if (url.endsWith('/window/handles')) value = state.clicked && state.handlesDelay-- <= 0 ? state.handles : ['fixture'];
        else if (url.endsWith('/element')) { state.references++; value = { 'element-6066-11e4-a52e-4f735466cecf': state.element }; }
        else if (url.endsWith('/click')) {
            if (state.staleClicks-- > 0) {
                state.element = `replacement/${state.references}`;
                return new Response(JSON.stringify({ value: { error: 'stale element reference' } }), { status: 404 });
            }
            state.clicked = true;
            return new Response(JSON.stringify({ value: state.clickError ? { error: state.clickError, message: 'private-provider-output' } : null }), { status: state.clickStatus });
        } else if (url.endsWith('/url') && options.method === 'GET') value = state.loadsDelay-- > 0 ? 'about:blank' : state.url;
        else if (url.endsWith('/execute/sync')) value = state.ready;
        else return base(url, options);
        return new Response(JSON.stringify({ value }));
    });
    return { ...h, state };
}
