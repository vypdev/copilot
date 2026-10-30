// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { ready, render, navigate, button } from '../fixtures/center_app_dom.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { deferred } from '../fixtures/runtime.ts';
import { startCenter } from '../../src/infrastructure/center_app.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { supportCopy } from '../../src/domain/support_copy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

const copy = supportCopy('en');
const seen = () => document.querySelector('[data-support-status]')?.textContent;
const observed = () => ready(() => !!document.querySelector('[data-support-status]'));
it.each(['help', 'about', 'recovery'] as const)('the %s route works even when native settings opening never settles', async route => {
    const h = browserFixture(); const wait = deferred<unknown>();
    h.api.runtime.getURL = path => `https://extension.test/${path}`; vi.mocked(h.api.runtime.sendMessage).mockImplementation(() => wait.promise);
    h.api.runtime.getManifest = vi.fn(() => ({ name: 'Copilot', version: '0.1.0', manifest_version: 3 }));
    window.history.replaceState(null, '', `https://extension.test/runtime.html#/${route}`); const stop = startCenter(h.api, document, 'en');
    try {
        await observed(); expect(seen()).toBe(copy.statuses.checking); expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
        expect(document.querySelector('main a[href="https://docs.page/vypdev/copilot/browser-extension/onboarding"]')?.textContent).toBe(copy.configuration);
        if (route === 'about') expect(document.querySelector('[data-package-version]')?.textContent).toBe('0.1.0');
        if (route === 'recovery') expect([...document.querySelectorAll('main button')].every(node => (node as HTMLButtonElement).disabled)).toBe(true);
        expect(h.api.runtime.getManifest).toHaveBeenCalledOnce(); expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(h.api.permissions.request).not.toHaveBeenCalled(); expect(h.localArea.set).not.toHaveBeenCalled(); expect(h.api.tabs.create).not.toHaveBeenCalled();
    } finally { stop(); wait.resolve(null); await tick(); }
});
it.each([['future', { schemaVersion: 99 }], ['corrupt', { schemaVersion: 2, broken: true }]] as const)('independent recovery explains %s data and preserves it without presenting editable defaults', async (state, initial) => {
    const h = await render('recovery', false, initial, false, centerClientFixture(), 'en'); await ready(() => seen() === copy.statuses[state]); expect(h.native.values.get(SETTINGS_KEY)).toEqual(initial);
    expect(document.querySelector('form')).toBeNull(); expect(document.querySelector('.revision')).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(document.querySelector('main a[href="#/data"]')?.textContent).toBe(copy.data);
});
it('reports migration blocked by storage failure without hiding support or silently resetting a legacy record', async () => {
    const native = centerClientFixture(); const { center: _center, ...legacy } = DEFAULT_SETTINGS;
    vi.mocked(native.native.port.set).mockRejectedValue(new Error('private-quota-detail')); const initial = { ...legacy, schemaVersion: 1 };
    await render('recovery', false, initial, false, native, 'en'); await ready(() => seen() === copy.statuses['migration-required']);
    expect(seen()).toBe(copy.statuses['migration-required']); expect(native.native.values.get(SETTINGS_KEY)).toEqual(initial);
    expect(document.body.textContent).not.toContain('private-quota-detail'); expect(document.querySelector('form')).toBeNull();
});
it('an unavailable current read retires old settings as a current fact but keeps the safe explicit reread path', async () => {
    const h = await render('recovery', false, undefined, true, centerClientFixture(), 'en'); await observed(); expect(seen()).toBe(copy.statuses.ready);
    h.port.send.mockResolvedValueOnce(null); button(copy.read).click(); await ready(() => seen() === copy.statuses.unavailable);
    expect(document.querySelector('.revision')).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
    button(copy.read).click(); await ready(() => seen() === copy.statuses.ready);
});
it('native source mismatch gives compatible-build recovery without promoting retained settings or native metadata into editing authority', async () => {
    const h = await render('recovery', false, undefined, true, centerClientFixture(), 'en'); await observed();
    h.port.send.mockResolvedValueOnce({ sourceTree: 'foreign' }); button(copy.read).click(); await ready(() => seen() === copy.statuses.incompatible);
    expect(document.querySelector('form')).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(document.querySelector('main a[href="https://docs.page/vypdev/copilot/browser-extension/runtime"]')).not.toBeNull();
});
it('an expired native owner has an explicit reconnect path without repeating a save', async () => {
    const h = await render('recovery', false, undefined, true, centerClientFixture(), 'en'); await observed();
    const send = h.port.send.getMockImplementation()!;
    h.port.send.mockImplementation(message => message.method === 'center.read' ? Promise.resolve({ sourceTree: h.port.sourceTree, state: 'stale' }) : send(message));
    button(copy.read).click(); await ready(() => seen() === copy.statuses.stale); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('About presents only escaped observed package facts and a separate source identity, never arbitrary manifest extras', async () => {
    const h = await render('about', false, undefined, true, centerClientFixture(), 'en', browser => {
        browser.api.runtime.getManifest = vi.fn(() => ({ name: '<img src=x>', version: '65535.2.3.4', manifest_version: 3, private_data: 'do-not-display' }));
    }); await observed();
    expect(document.querySelector('[data-package-version]')?.textContent).toBe('65535.2.3.4');
    expect(document.querySelector('[data-package-state] details')?.textContent).toContain('<img src=x>'); expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[data-page-source]')?.textContent).toBe(h.port.sourceTree);
    expect(document.body.textContent).not.toContain('do-not-display'); expect(document.body.textContent).toContain(copy.identityBoundary);
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.health.read')).toHaveLength(0);
    expect(h.browser.api.permissions.contains).not.toHaveBeenCalled(); expect(h.port.send.mock.calls.map(([m]) => m.method).filter(method => !['center.recents.capture', 'center.operation.read', 'center.health.read'].includes(method))).toEqual(['center.open', 'center.read']);
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.recents.capture').length).toBeLessThanOrEqual(2);
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.operation.read')).toHaveLength(1);
});
it.each(['missing', 'throws', 'invalid'] as const)('About handles %s package metadata without guessing version or exposing the native error', async kind => {
    await render('about', false, undefined, true, centerClientFixture(), 'en', browser => {
        if (kind === 'throws') browser.api.runtime.getManifest = () => { throw new Error('private-native-error'); };
        else if (kind === 'invalid') browser.api.runtime.getManifest = () => ({ name: 'Copilot', version: 'private-field', manifest_version: 3 });
    }); await observed();
    expect(document.querySelector('[data-package-version]')).toBeNull(); expect(document.body.textContent).not.toContain('private-');
    expect(document.body.textContent).toContain(kind === 'missing' ? copy.unsupported : copy.unavailable);
});
it('an unbundled page says source unknown independently of native package metadata', async () => {
    const h = browserFixture(); h.api.runtime.getURL = path => `https://extension.test/${path}`; vi.stubGlobal('__COPILOT_SOURCE_TREE__', 'unbundled');
    window.history.replaceState(null, '', 'https://extension.test/runtime.html#/about'); const stop = startCenter(h.api, document, 'en');
    try { await observed(); expect(document.querySelector('[data-page-source]')).toBeNull(); expect(document.body.textContent).toContain(copy.sourceUnknown); }
    finally { stop(); await tick(); }
});
it('readonly observers can use support without taking control, changing sessions or granting access', async () => {
    const h = await render('help', true, undefined, true, centerClientFixture(), 'en'); await observed();
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.health.read')).toHaveLength(1);
    expect(seen()).toBe(copy.statuses.ready); expect(h.port.send.mock.calls.map(([m]) => m.method).filter(method => !['center.recents.capture', 'center.operation.read', 'center.health.read'].includes(method))).toEqual(['center.open', 'center.read']);
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.recents.capture').length).toBeLessThanOrEqual(2);
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.operation.read')).toHaveLength(1);
    expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
    expect(document.querySelector('main a[href="#/connections"]')?.textContent).toBe(copy.connections);
});
it('keeps an acknowledged save fact when the subsequent read fails, and rereads without repeating the mutation', async () => {
    const h = await render('welcome', false, undefined, true, centerClientFixture(), 'en'); await ready(() => !!document.querySelector('main a'));
    button('Review progress to next step').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    const original = h.port.send.getMockImplementation()!;
    h.port.send.mockImplementation(message => message.method === 'center.read' ? Promise.resolve(null) : original(message));
    button('Confirm change').click(); await ready(() => document.querySelector('section [role=status]')?.textContent === 'The change is saved.');
    await navigate('recovery'); await observed(); expect(seen()).toBe(copy.statuses.unavailable);
    expect(document.querySelector('[data-support-operation]')?.textContent).toBe(copy.operations.saved);
    h.port.send.mockImplementation(original); button(copy.read).click(); await ready(() => seen() === copy.statuses.ready);
    expect(document.querySelector('[data-support-operation]')?.textContent).toBe(copy.operations.saved);
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
    expect((await h.native.repository.read()).settings.center.onboarding).toBe('profile');
});
it('keeps a save with a lost acknowledgment uncertain until a settings read reconciles it, never resubmitting confirmation', async () => {
    const h = await render('welcome', false, undefined, true, centerClientFixture(), 'en'); await ready(() => !!document.querySelector('main a'));
    button('Review progress to next step').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    const original = h.port.send.getMockImplementation()!;
    h.port.send.mockImplementation(async message => { const result = await original(message); return message.method === 'center.confirm' ? null : result; });
    button('Confirm change').click(); await ready(() => document.querySelector('section [role=status]')?.textContent?.includes('could not confirm whether') === true);
    window.location.hash = '#/recovery'; await ready(() => !!document.querySelector('section[role=alert]')); button('Discard draft and leave').click(); await observed();
    // Dismissing the review for navigation never resubmits or cancels an already accepted save; a read can reconcile its receipt.
    button(copy.read).click(); await ready(() => seen() === copy.statuses.ready);
    expect(document.querySelector('[data-support-operation]')?.textContent).toBe(copy.operations.saved);
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
    expect((await h.native.repository.read()).settings.center.onboarding).toBe('profile');
});
it.each(['en', 'es', 'fr', 'pt'] as const)('support has complete %s content, meaningful exact links and local actions without automatic provider reads', async locale => {
    const c = supportCopy(locale); const h = await render('help', false, { ...DEFAULT_SETTINGS, locale }, true, centerClientFixture(), locale); await observed();
    expect(document.body.textContent).toContain(c.help); expect(seen()).toBe(c.statuses.ready);
    expect(document.querySelector('main a[href="https://docs.page/vypdev/copilot/browser-extension/onboarding"]')?.textContent).toBe(c.configuration);
    await navigate('about'); await observed(); expect(document.body.textContent).toContain(c.about);
    const release = document.querySelector('main a[href="https://github.com/vypdev/copilot/releases"]'); expect(release?.textContent).toBe(c.history); expect(release?.getAttribute('rel')).toBe('noreferrer');
    expect(document.body.textContent).toContain(c.historyBoundary); expect(document.querySelectorAll('#support-updates + ol li')).toHaveLength(3);
    await navigate('recovery'); await observed(); expect(document.body.textContent).toContain(c.recoverySteps[2]);
    expect(document.querySelector('script,iframe,img,input')).toBeNull(); expect(h.port.send.mock.calls.every(([message]) => ['center.open', 'center.read', 'center.recents.capture', 'center.operation.read', 'center.health.read'].includes(message.method))).toBe(true);
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.health.read')).toHaveLength(1);
    // Three observed routes: initial metadata plus at most one coalesced/startup trailing read.
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.recents.capture').length).toBeLessThanOrEqual(4);
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.operation.read').length).toBeLessThanOrEqual(3);
});
