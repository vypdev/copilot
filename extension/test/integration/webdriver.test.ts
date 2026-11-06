import { afterEach, expect, it, vi } from 'vitest';
import { artifacts, mocks, transport, settingsTransport } from '../fixtures/native_driver_transport.ts';
import { freePort, pauseDriver } from '../../tooling/webdriver.mts';

afterEach(() => { mocks.listenFailure = false; mocks.closeFailure = false; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
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
    expect(start.capabilities.alwaysMatch['goog:chromeOptions'].enableExtensionTargets).toBe(true);
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

it('native Safari extension replies accept only the bounded documented identifier shapes and fail closed on malformed provider data', async () => {
    for (const result of ['owned%20identifier', 42, null, { unexpected: 'raw-private' }, '', 'x'.repeat(257)]) {
        const h = transport('safari'); const send = h.send.getMockImplementation()!;
        h.send.mockImplementation(async (url: string, options: RequestInit) => url.endsWith('/webextension')
            ? new Response(JSON.stringify({ value: result })) : send(url, options));
        if (result === 'owned%20identifier') { await h.driver.start(); await h.driver.close(); }
        else await expect(h.driver.start()).rejects.toThrow('prerequisite:safari-extension-installation');
        expect(h.child.kill).toHaveBeenCalledTimes(1);
    }
});

it('a real settings click follows only its newly added native context after bounded event delivery and load', async () => {
    const h = settingsTransport(); await h.driver.start(); h.state.handles = ['fixture', 'settings']; h.state.handlesDelay = 1; h.state.loadsDelay = 1;
    expect(await h.driver.openRuntimeOptions()).toBe('chrome-extension://test/runtime.html');
    const click = h.send.mock.calls.find(([url]) => url.endsWith('/click'))!;
    expect(click[0]).toContain('/element/settings%2Fbutton/click');
    expect(h.send.mock.calls.some(([url, options]) => url.endsWith('/window') && options.body === JSON.stringify({ handle: 'settings' }))).toBe(true);
    await h.driver.close();
});
it.each([1, 2])('an ESR settings button replaced %i times before activation is located afresh and opens exactly one native context', async staleClicks => {
    const h = settingsTransport('firefox-esr'); await h.driver.start(); h.state.staleClicks = staleClicks; h.state.handles = ['fixture', 'settings'];
    expect(await h.driver.openRuntimeOptions()).toContain('/runtime.html');
    expect(h.state.clicked).toBe(true); expect(h.state.references).toBe(staleClicks + 1);
    expect(h.send.mock.calls.filter(([url]) => url.endsWith('/click')).at(-1)?.[0]).toContain(`/replacement%2F${staleClicks}/click`);
    expect(h.send.mock.calls.filter(([url, options]) => url.endsWith('/window') && options.body === JSON.stringify({ handle: 'settings' }))).toHaveLength(1);
    await h.driver.close();
});
it('repeated native button retirement exhausts the bounded retry without inventing an activation or opening a context', async () => {
    const h = settingsTransport('firefox-esr'); await h.driver.start(); h.state.staleClicks = 3;
    await expect(h.driver.openRuntimeOptions()).rejects.toThrow(':404:stale element reference');
    expect(h.state.clicked).toBe(false); expect(h.state.references).toBe(3); await h.driver.close();
});
it.each([[500, 'stale element reference'], [404, 'element click intercepted'], [404, 'stale element reference:other']] as const)('native click error %i %s is never replayed as element retirement', async (status, error) => {
    const h = settingsTransport('firefox-esr'); await h.driver.start(); h.state.clickStatus = status; h.state.clickError = error;
    await expect(h.driver.openRuntimeOptions()).rejects.toThrow(`:${status}:${error}`);
    expect(h.send.mock.calls.filter(([url]) => url.endsWith('/click'))).toHaveLength(1); await h.driver.close();
});
it('a retired button followed by a malformed new reference fails before activating either control', async () => {
    const h = settingsTransport('firefox-esr'); await h.driver.start(); h.state.staleClicks = 1; const send = h.send.getMockImplementation()!;
    h.send.mockImplementation(async (url, options) => url.endsWith('/element') && h.state.references === 1
        ? new Response(JSON.stringify({ value: {} })) : send(url, options));
    await expect(h.driver.openRuntimeOptions()).rejects.toThrow('runtime-options-element');
    expect(h.state.clicked).toBe(false); expect(h.send.mock.calls.filter(([url]) => url.endsWith('/click'))).toHaveLength(1); await h.driver.close();
});
it('an untyped response decoder failure cannot be mistaken for a safe rejected click or retried', async () => {
    const h = settingsTransport('firefox-esr'); await h.driver.start(); const send = h.send.getMockImplementation()!;
    h.send.mockImplementation(async (url, options) => url.endsWith('/click')
        ? { json: async () => { throw 'unknown-native-outcome'; } } as unknown as Response : send(url, options));
    await expect(h.driver.openRuntimeOptions()).rejects.toBe('unknown-native-outcome');
    expect(h.send.mock.calls.filter(([url]) => url.endsWith('/click'))).toHaveLength(1); await h.driver.close();
});
it('Safari recovers a replaced source context only when exactly one new native view exists and cleans up from its owned blank view', async () => {
    const h = settingsTransport('safari'); await h.driver.start();
    h.state.handles = ['settings']; h.state.clickStatus = 404; h.state.clickError = 'no such window';
    expect(await h.driver.openRuntimeOptions()).toContain('/runtime.html'); await h.driver.close();
    const uninstall = h.send.mock.calls.findIndex(([url, options]) => url.includes('/webextension/') && options.method === 'DELETE');
    expect(JSON.parse(String(h.send.mock.calls[uninstall - 1][1].body))).toEqual({ handle: 'owned-tab-1' });
    expect(h.send.mock.calls.some(([url, options]) => url.endsWith('/window') && options.body === JSON.stringify({ handle: 'owned-tab-2' }))).toBe(true);
});
it.each([['chrome', 404, 'no such window'], ['safari', 500, 'no such window'], ['safari', 404, 'stale element reference']] as const)('native %s click failure %i %s is not accepted as a successful context transition', async (target, status, error) => {
    const h = settingsTransport(target); await h.driver.start(); h.state.clickStatus = status; h.state.clickError = error;
    await expect(h.driver.openRuntimeOptions()).rejects.toThrow(`:${status}:${error}`); await h.driver.close();
});
it.each([['chrome', '', 200, 'runtime-options-context-missing'], ['safari', 'no such window', 404, ':404:no such window']] as const)('a %s click never substitutes the original view when its new context is absent', async (target, error, status, expected) => {
    const h = settingsTransport(target); await h.driver.start(); h.state.clickStatus = status; h.state.clickError = error;
    await expect(h.driver.openRuntimeOptions()).rejects.toThrow(expected); await h.driver.close();
});
it('ambiguous settings contexts are rejected instead of inspecting an unrelated tab', async () => {
    const h = settingsTransport(); await h.driver.start(); h.state.handles = ['fixture', 'settings', 'unrelated'];
    await expect(h.driver.openRuntimeOptions()).rejects.toThrow('runtime-options-context-ambiguous'); await h.driver.close();
});
it.each([undefined, '', 42, 'x'.repeat(513)])('malformed native element reference %j is rejected before any click', async element => {
    const h = settingsTransport(); await h.driver.start(); h.state.element = element as string;
    await expect(h.driver.openRuntimeOptions()).rejects.toThrow('runtime-options-element'); expect(h.state.clicked).toBe(false); await h.driver.close();
});
it.each([['', 'complete'], ['about:blank', 'complete'], ['chrome-extension://test/runtime.html', 'interactive']])('a settings page %s in state %s must finish loading within the bounded native wait', async (url, ready) => {
    const h = settingsTransport(); await h.driver.start(); Object.assign(h.state, { handles: ['fixture', 'settings'], url, ready });
    await expect(h.driver.openRuntimeOptions()).rejects.toThrow('runtime-options-load-incomplete'); await h.driver.close();
});
it('a failed Safari uninstall still deletes its native session and owned process/profile', async () => {
    const h = transport('safari'); await h.driver.start(); const base = h.send.getMockImplementation()!;
    h.send.mockImplementation(async (url: string, options: RequestInit) => url.includes('/webextension/')
        ? new Response(JSON.stringify({ value: { error: 'uninstall-failed' } }), { status: 500 }) : base(url, options));
    await expect(h.driver.close()).rejects.toThrow('uninstall-failed'); expect(h.child.kill).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls.some(([url, options]) => url.endsWith('/owned-test-session') && options.method === 'DELETE')).toBe(true);
    await h.driver.close(); expect(h.child.kill).toHaveBeenCalledTimes(1);
});

it('native fixture focus clicks only the authored inert heading before inspecting extension visibility', async () => {
    const h = settingsTransport('safari'); await h.driver.start(); await h.driver.focusFixture();
    const find = h.send.mock.calls.find(([url]) => url.endsWith('/element'))!;
    expect(JSON.parse(String(find[1].body))).toEqual({ using: 'css selector', value: 'main > h1' });
    expect(h.state.clicked).toBe(true); await h.driver.close();
});

it('public native page controls bind to the owned current session and cannot issue commands before start or after cleanup', async () => {
    const h = transport(); await expect(h.driver.page.click('#owned')).rejects.toThrow('session-not-started');
    expect(h.send).not.toHaveBeenCalled(); await h.driver.start(); const base = h.send.getMockImplementation()!;
    h.send.mockImplementation(async (url: string, options: RequestInit) => url.endsWith('/element')
        ? new Response(JSON.stringify({ value: { 'element-6066-11e4-a52e-4f735466cecf': 'owned/element' } })) : base(url, options));
    await h.driver.page.click('#owned');
    expect(h.send.mock.calls.some(([url]) => url.endsWith('/session/owned-test-session/element/owned%2Felement/click'))).toBe(true);
    await h.driver.close(); const calls = h.send.mock.calls.length;
    await expect(h.driver.page.click('#owned')).rejects.toThrow('session-not-started'); expect(h.send).toHaveBeenCalledTimes(calls);
});
it('explicit visible Chrome and Firefox sessions retain their isolated artifacts while omitting only headless switches', async () => {
    for (const target of ['chrome', 'firefox'] as const) {
        const h = transport(target, true); await h.driver.start();
        const start = JSON.parse(String(h.send.mock.calls.find(([url]) => url.endsWith('/session'))![1].body));
        const capabilities = start.capabilities.alwaysMatch;
        const options = capabilities[target === 'chrome' ? 'goog:chromeOptions' : 'moz:firefoxOptions'];
        expect(options.binary).toBe('/isolated/browser'); expect(options.args.some((value: string) => value.includes('headless'))).toBe(false);
        if (target === 'chrome') expect(options.args).toContain(`--load-extension=${artifacts}`);
        else expect(h.send.mock.calls.some(([url]) => url.endsWith('/moz/addon/install'))).toBe(true);
        await h.driver.close(); expect(h.child.kill).toHaveBeenCalledOnce();
    }
});
