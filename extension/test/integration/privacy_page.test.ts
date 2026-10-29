// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { ready, render, button, navigate } from '../fixtures/center_app_dom.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { scopedCenterFixture } from '../fixtures/scoped_center.ts';
import { namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { startCenter } from '../../src/infrastructure/center_app.ts';
import { deferred } from '../fixtures/runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { privacyCopy } from '../../src/domain/privacy_copy.ts';
import { BROWSER_CAPABILITIES, permissionQuery } from '../../src/domain/permission_inspection.ts';

const copy = privacyCopy('en');
const identity = () => document.querySelector('[data-privacy-identity]')?.textContent ?? '';
const grant = (scope: string) => document.querySelector(`[data-browser-capability="${scope}"] [data-permission-grant]`)?.textContent;
const observed = () => ready(() => document.querySelector('[data-permission-status]')?.textContent === copy.complete);
const open = () => render('privacy', false, undefined, true, centerClientFixture(), 'en');
it('bexp-CENTER06-C01 entering privacy reads exactly three declared native scopes without a GitHub read, grant or preference write', async () => {
    const h = await open(); await observed();
    expect(vi.mocked(h.browser.api.permissions.contains).mock.calls.map(([query]) => query)).toEqual(BROWSER_CAPABILITIES.map(permissionQuery));
    expect(h.port.send.mock.calls.map(([message]) => message.method)).toEqual(['center.open', 'center.read']);
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled(); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(document.querySelector('[data-permission-status]')?.getAttribute('aria-live')).toBe('polite');
    expect(document.querySelectorAll('[data-browser-capability] dl')).toHaveLength(3);
    button(copy.read).focus(); expect(document.activeElement).toBe(button(copy.read));
});
it('distinguishes a native denial from a failed query and an unsupported API without displaying provider errors', async () => {
    const h = await render('privacy', false, undefined, true, centerClientFixture(), 'en', browser => {
        vi.mocked(browser.api.permissions.contains).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('private-native-path')).mockResolvedValueOnce(true);
    }); await observed();
    expect(grant('local-storage')).toBe(copy.statuses['not-granted']); expect(grant('github-pages')).toBe(copy.statuses.unknown);
    expect(grant('github-api')).toBe(copy.statuses.granted); expect(document.body.textContent).toContain(copy.partial);
    expect(document.body.textContent).not.toContain('private-native-path');
    Object.defineProperty(h.browser.api.permissions, 'contains', { value: undefined }); button(copy.read).click(); await observed();
    expect(BROWSER_CAPABILITIES.map(grant)).toEqual(Array(3).fill(copy.statuses.unsupported));
});
it.each([{ ...DEFAULT_SETTINGS, schemaVersion: 999 }, { malformed: true }])('native permission inspection remains useful for unreadable preference document %j', async initial => {
    const h = await render('privacy', false, initial, false, centerClientFixture(), 'en'); await observed();
    expect(document.querySelectorAll('[data-browser-capability]')).toHaveLength(3); expect(document.querySelector('form')).toBeNull();
    expect(grant('github-api')).toBe(copy.statuses.granted); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('unavailable native configuration does not prevent permission inspection or invent a GitHub identity', async () => {
    const native = centerClientFixture(); native.port.send.mockResolvedValueOnce(null);
    await render('privacy', false, undefined, false, native, 'en'); await observed();
    expect(button(copy.connectionRead).disabled).toBe(true); expect(identity()).toBe(copy.unknownIdentity);
    expect(grant('github-api')).toBe(copy.statuses.granted); expect(document.body.textContent).toContain(copy.connectionUnavailable);
});
it('an observer can inspect access and explicitly read the selected identity without taking control or revealing a local vault label', async () => {
    const h = await scopedCenterFixture(); const app = await render('privacy', true, undefined, true, h.application, 'en'); await observed();
    expect(identity()).toBe(copy.unknownIdentity); const reads = vi.mocked(h.reader.read).mock.calls.length;
    button(copy.connectionRead).click(); await ready(() => identity().includes('company/example'));
    expect(identity()).toContain('octo'); expect(identity()).not.toContain('Work'); expect(identity()).not.toContain('session-1');
    expect(app.port.send.mock.calls.some(([message]) => message.method === 'center.claim')).toBe(false);
    expect(vi.mocked(h.reader.read).mock.calls.length).toBeGreaterThanOrEqual(reads); expect(app.native.port.set).not.toHaveBeenCalled();
});
it('explicit disconnected state remains separate from browser grants and future CLI or GitHub write capabilities', async () => {
    const h = await render('privacy', false, undefined, true, centerClientFixture(namedSessionsFixture().center), 'en');
    await observed(); button(copy.connectionRead).click(); await ready(() => identity() === copy.disconnected);
    expect(grant('github-api')).toBe(copy.statuses.granted); expect(document.body.textContent).toContain(copy.cliState);
    expect(document.body.textContent).toContain(copy.writes); expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('a suspended configuration opening cannot block the independent native inspector or enable an identity read', async () => {
    const native = browserFixture(); const wait = deferred<unknown>();
    native.api.runtime.getURL = path => `https://extension.test/${path}`;
    vi.mocked(native.api.runtime.sendMessage).mockImplementation(() => wait.promise);
    window.history.replaceState(null, '', 'https://extension.test/runtime.html#/privacy');
    const stop = startCenter(native.api, document, 'en');
    try {
        await observed(); expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
        expect(button(copy.connectionRead).disabled).toBe(true); expect(grant('github-api')).toBe(copy.statuses.granted);
    } finally { stop(); wait.resolve(null); await tick(); }
});
it('a stalled native batch reports its deadline honestly, keeps refresh bounded and never promotes late grants', async () => {
    const h = await open(); await observed(); const wait = deferred<boolean>();
    vi.mocked(h.browser.api.permissions.contains).mockImplementation(() => wait.promise);
    let deadline: (() => void) | undefined; const schedule = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation((handler, timeout, ...args) => {
        if (timeout === 5000) deadline = handler as () => void;
        return schedule(handler, timeout, ...args) as unknown as ReturnType<typeof window.setTimeout>;
    });
    button(copy.read).click(); flushSync(); expect(button(copy.read).disabled).toBe(true);
    expect(deadline).toBeTypeOf('function'); deadline!(); flushSync();
    expect(document.querySelector('[data-permission-status]')?.textContent).toBe(copy.timedOut);
    wait.resolve(true); await ready(() => !button(copy.read).disabled);
    expect(grant('github-api')).toBe(copy.statuses.unknown); expect(h.browser.api.permissions.contains).toHaveBeenCalledTimes(6);
});
it('permission removal retires identity before an await and ignores a delayed connection result from the previous native observation', async () => {
    const h = await scopedCenterFixture(); const app = await render('privacy', false, undefined, true, h.application, 'en'); await observed();
    const wait = deferred<void>(); const begun = deferred<void>(); const send = app.port.send.getMockImplementation()!;
    app.port.send.mockImplementation(async message => {
        const value = await send(message);
        if (message.method === 'center.connections.read') { begun.resolve(); await wait.promise; }
        return value;
    });
    button(copy.connectionRead).click(); await begun.promise;
    for (const listener of app.browser.permissionRemoved.listeners) listener({ origins: ['https://api.github.com/*'] });
    flushSync(); expect(identity()).toBe(copy.unknownIdentity); wait.resolve(); await observed();
    await ready(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false');
    expect(identity()).toBe(copy.unknownIdentity);
    button(copy.connectionRead).click(); await ready(() => identity().includes('company/example'));
});
it('blur hides private identity immediately and only foreground observations plus an explicit identity read can restore it', async () => {
    const h = await scopedCenterFixture(); await render('privacy', false, undefined, true, h.application, 'en'); await observed();
    button(copy.connectionRead).click(); await ready(() => identity().includes('company/example'));
    window.dispatchEvent(new Event('blur')); flushSync(); expect(identity()).toBe(copy.unknownIdentity);
    expect(grant('github-api')).toBe(copy.statuses.unknown); window.dispatchEvent(new Event('focus')); await observed();
    expect(identity()).toBe(copy.unknownIdentity); button(copy.connectionRead).click(); await ready(() => identity().includes('company/example'));
});
it('navigation also retires a previously verified identity rather than redisplaying it from retained connection state', async () => {
    const h = await scopedCenterFixture(); await render('privacy', false, undefined, true, h.application, 'en'); await observed();
    button(copy.connectionRead).click(); await ready(() => identity().includes('company/example'));
    await navigate('appearance'); await ready(() => !!document.querySelector('#center-theme')); await navigate('privacy'); await observed();
    expect(identity()).toBe(copy.unknownIdentity); button(copy.connectionRead).click(); await ready(() => identity().includes('company/example'));
});
it('a hidden page retires pending native probes, ignores their late grants and starts one fresh batch when visible', async () => {
    const wait = deferred<boolean>(); const h = await render('privacy', false, undefined, true, centerClientFixture(), 'en', browser => {
        vi.mocked(browser.api.permissions.contains).mockImplementation(() => wait.promise);
    });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange')); flushSync(); expect(grant('github-api')).toBe(copy.statuses.unknown);
    expect(document.querySelector('[data-permission-status]')?.textContent).toBe(copy.waiting);
    wait.resolve(true); await ready(() => !button(copy.read).disabled); expect(grant('github-api')).toBe(copy.statuses.unknown);
    expect(h.browser.api.permissions.contains).toHaveBeenCalledTimes(3);
    visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')); await observed();
    expect(h.browser.api.permissions.contains).toHaveBeenCalledTimes(6);
});
it('navigation retires the prior permission batch before another page loads and returning starts a current observation', async () => {
    const h = await open(); await observed(); const wait = deferred<boolean>(); vi.mocked(h.browser.api.permissions.contains).mockImplementation(() => wait.promise);
    button(copy.read).click(); await navigate('appearance'); await ready(() => !!document.querySelector('#center-theme'));
    wait.resolve(false); await tick(); flushSync(); expect(document.querySelector('[data-permission-status]')).toBeNull();
    vi.mocked(h.browser.api.permissions.contains).mockResolvedValue(true); await navigate('privacy'); await observed();
    expect(grant('github-api')).toBe(copy.statuses.granted); expect(h.browser.api.permissions.contains).toHaveBeenCalledTimes(9);
});
it('disposing a pending inspection removes native subscriptions and ignores all later probe results', async () => {
    const wait = deferred<boolean>(); const h = await render('privacy', false, undefined, true, centerClientFixture(), 'en', browser => {
        vi.mocked(browser.api.permissions.contains).mockImplementation(() => wait.promise);
    });
    expect(h.browser.permissionRemoved.listeners.size).toBe(1); h.stop(); h.stop(); wait.resolve(true); await tick(); flushSync();
    expect(h.browser.permissionRemoved.listeners.size).toBe(0); expect(document.body.textContent).toBe('');
    expect(h.browser.api.permissions.contains).toHaveBeenCalledTimes(3);
});
it.each(['en', 'es', 'fr', 'pt'] as const)('privacy has complete %s packaged content, fixed help links and independent retention controls', async locale => {
    const local = privacyCopy(locale); await render('privacy', false, { ...DEFAULT_SETTINGS, locale }, true, centerClientFixture(), locale);
    await ready(() => document.querySelector('[data-permission-status]')?.textContent === local.complete);
    expect(document.body.textContent).toContain(local.nativeTitle); expect(document.body.textContent).toContain(local.guides.safari);
    expect(document.querySelector('a[href="https://docs.page/vypdev/copilot/browser-extension/permissions"]')?.textContent).toBe(local.guide);
    expect(document.querySelector('main a[href="#/data"]')?.textContent).toBe(local.data);
    expect(document.querySelector('main a[href="#/recovery"]')?.textContent).toBe(local.recovery);
    expect(document.querySelector('script,iframe,img,input[type=password]')).toBeNull();
});
