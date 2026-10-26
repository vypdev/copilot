import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), listenFailure: false, closeFailure: false }));
vi.mock('node:child_process', async original => ({ ...await original<object>(), spawn: mocks.spawn }));
vi.mock('node:net', () => ({ createServer: () => {
    let error: (value: Error) => void;
    return { once: (_name: string, listener: typeof error) => { error = listener; },
        listen: (_port: number, _host: string, ready: () => void) => { if (mocks.listenFailure) error(new Error('listen-failed')); else ready(); },
        address: () => ({ port: 31337 }), close: (done: (error?: Error) => void) => done(mocks.closeFailure ? new Error('close-failed') : undefined) };
} }));
import { NativeDriver, freePort, pauseDriver } from '../../tooling/webdriver.mts';

const artifacts = '/isolated/artifacts';
afterEach(() => { mocks.listenFailure = false; mocks.closeFailure = false; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function transport(target: 'chrome' | 'firefox' | 'firefox-esr' | 'safari' = 'chrome') {
    const child = { exitCode: null as number | null, on: vi.fn(), kill: vi.fn() }; mocks.spawn.mockReturnValue(child);
    const send = vi.fn(async (url: string, options: RequestInit) => {
        const value = url.endsWith('/window/new') ? { handle: 'owned-tab' } : url.endsWith('/webextension') ? { extension: 'owned-extension-id' } : url.endsWith('/session') && options.method === 'POST' ? { sessionId: 'owned-test-session', capabilities: { browserName: target } }
            : url.endsWith('/execute/sync') ? 'sync-result' : url.endsWith('/execute/async') ? 'async-result' : {};
        return new Response(JSON.stringify({ value }), { headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', send);
    const driver = new NativeDriver({ target, binary: '/isolated/browser', driver: '/isolated/driver', artifact: artifacts }, async () => undefined);
    return { child, send, driver };
}
it('allocates only a loopback port and reports listen/close failure instead of proceeding', async () => {
    expect(await freePort()).toBe(31337); mocks.listenFailure = true; await expect(freePort()).rejects.toThrow('listen-failed');
    mocks.listenFailure = false; mocks.closeFailure = true; await expect(freePort()).rejects.toThrow('close-failed');
});
it('native WebDriver protocol uses a bounded owned profile, correct Chrome flags, typed commands and idempotent cleanup', async () => {
    const h = transport(); await h.driver.start(); expect(mocks.spawn).toHaveBeenLastCalledWith('/isolated/driver', ['--port=31337'], { stdio: 'ignore' });
    expect(h.driver.capabilities).toEqual({ browserName: 'chrome' });
    await h.driver.navigate('https://github.com/vypdev/copilot/issues/703');
    expect(await h.driver.evaluate('return 1;')).toBe('sync-result'); expect(await h.driver.evaluateAsync('arguments[0]()', [1])).toBe('async-result');
    const start = JSON.parse(String(h.send.mock.calls.find(([url]) => url.endsWith('/session'))![1].body));
    expect(start.capabilities.alwaysMatch['goog:chromeOptions'].args).toContain(`--load-extension=${artifacts}`);
    await h.driver.close(); await h.driver.close(); expect(h.child.kill).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls.some(([url, options]) => url.endsWith('/owned-test-session') && options.method === 'DELETE')).toBe(true);
});
it('Firefox stable/ESR install the exact temporary artifact and Safari uses its native driver without Chrome switches', async () => {
    for (const target of ['firefox', 'firefox-esr', 'safari'] as const) {
        const h = transport(target); await h.driver.start();
        if (target === 'safari') expect(mocks.spawn).toHaveBeenLastCalledWith('/isolated/driver', ['-p', '31337'], { stdio: 'ignore' });
        else {
            expect(mocks.spawn).toHaveBeenLastCalledWith('/isolated/driver', ['--port', '31337', '--allow-system-access', '--profile-root', expect.stringContaining('copilot-h2-browser-')], { stdio: 'ignore' });
            expect(h.send.mock.calls.some(([url, options]) => url.endsWith('/moz/addon/install') && String(options.body).includes(artifacts))).toBe(true);
        }
        await h.driver.close();
    }
});
it('driver command failures are sanitized, identify the failed phase, and always release the owned process/profile', async () => {
    const h = transport(); await h.driver.start();
    h.send.mockResolvedValueOnce(new Response(JSON.stringify({ value: { error: 'unsupported operation', message: 'raw-secret' } }), { status: 500 }));
    await expect(h.driver.navigate('moz-extension://test/runtime.html')).rejects.toThrow('packaged-options');
    h.send.mockResolvedValueOnce(new Response(JSON.stringify({ value: { error: 'forbidden', message: 'raw-secret' } })));
    await expect(h.driver.navigate('https://github.com/octo/example')).rejects.toThrow('public-bootstrap');
    h.send.mockResolvedValueOnce(new Response(JSON.stringify({ value: {} }), { status: 500 }));
    await expect(h.driver.evaluate('return 1')).rejects.toThrow('request-failed');
    h.send.mockResolvedValueOnce(new Response(JSON.stringify({ value: { error: 'failed' } }), { status: 500 }));
    await expect(h.driver.close()).rejects.toThrow('webdriver'); expect(h.child.kill).toHaveBeenCalledTimes(1);
});
it('driver readiness retries are bounded, premature exit/missing driver fail explicitly, and failed session creation cleans up', async () => {
    const h = transport(); h.send.mockRejectedValueOnce(new Error('not-ready'));
    await h.driver.start();
    expect(h.send.mock.calls.filter(([url]) => url.endsWith('/status'))).toHaveLength(2); await h.driver.close();
    const failed = transport(); failed.child.exitCode = 1; const error = failed.driver.start();
    await expect(error).rejects.toThrow('prerequisite:webdriver-unavailable'); expect(failed.child.kill).toHaveBeenCalledTimes(1);
    const missing = transport(); missing.send.mockRejectedValue(new Error('missing'));
    const pending = expect(missing.driver.start()).rejects.toThrow('prerequisite:webdriver-unavailable');
    await pending;
    const spawnError = missing.child.on.mock.calls[0][1] as (error: Error) => void; expect(() => spawnError(new Error('missing'))).not.toThrow();
    const session = transport(); session.send.mockImplementation(async (url: string, options: RequestInit) => new Response(JSON.stringify({ value:
        url.endsWith('/session') && options.method === 'POST' ? { error: 'session not created' } : {} }), { status: url.endsWith('/session') ? 500 : 200 }));
    await expect(session.driver.start()).rejects.toThrow('session not created'); expect(session.child.kill).toHaveBeenCalledTimes(1);
});

it('driver pause is bounded and independently clock-testable', async () => {
    vi.useFakeTimers(); const wait = pauseDriver(50); await vi.advanceTimersByTimeAsync(50); await wait;
});
