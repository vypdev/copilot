// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { ready, render, button, navigate, save } from '../fixtures/center_app_dom.ts';
import { flushSync, tick } from 'svelte';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { welcomeCopy } from '../../src/domain/welcome_copy.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

const c = welcomeCopy('es');
const stage = () => document.querySelector('[data-welcome-step]')?.getAttribute('data-welcome-step');
const saved = () => document.querySelector('[data-welcome-saved]')?.getAttribute('data-welcome-saved');
const observed = () => ready(() => !!document.querySelector('[data-welcome-step]'));
it('saves each next step only after a complete localized preview and confirmation, retaining every unrelated preference', async () => {
    const initial = { ...DEFAULT_SETTINGS, paused: true, theme: 'dark', repositories: { '8': { connected: true } } };
    const h = await render('welcome', false, initial); await observed();
    for (const [before, after, label] of [['welcome', 'profile', c.advance], ['profile', 'permissions', c.advance], ['permissions', 'complete', c.finish]]) {
        expect(stage()).toBe(before); const writes = vi.mocked(h.native.port.set).mock.calls.length; button(label).click();
        await ready(() => !!document.querySelector('#settings-review-heading')); expect(h.native.port.set).toHaveBeenCalledTimes(writes);
        expect(document.querySelectorAll('dt')).toHaveLength(1); expect(document.querySelector('dt')?.textContent).toBe(`center › ${c.progress}`);
        await save(); await ready(() => stage() === after); expect(saved()).toBe(after);
    }
    const value = (await h.native.repository.read()).settings; expect(value).toEqual({ ...initial, revision: 3, center: { ...initial.center, onboarding: 'complete' } });
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled(); expect(h.port.send.mock.calls.some(([m]) => m.method.startsWith('center.connections'))).toBe(false);
});
it('canceling a progress change preserves its original revision and the displayed saved step', async () => {
    const h = await render('welcome'); await observed(); button(c.advance).click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    button('Cancelar cambio').click(); await ready(() => document.querySelector('section [role=status]')?.textContent === reviewCopy('es').states.cancelled);
    button('Cerrar revisión').click(); await ready(() => !document.querySelector('#settings-review-heading'));
    expect(stage()).toBe('welcome'); expect(saved()).toBe('welcome'); expect(h.native.port.set).not.toHaveBeenCalled(); expect((await h.native.repository.read()).settings.revision).toBe(0);
});
it('revisiting steps is transient, exposes no save control for the wrong stage and returns to the committed step', async () => {
    const initial = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, onboarding: 'profile' } };
    const h = await render('welcome', false, initial); await observed();
    button(c.steps.complete).click(); flushSync(); expect(stage()).toBe('complete'); expect(saved()).toBe('profile');
    expect(document.querySelector('#welcome-step')?.textContent).toBe(c.steps.complete); expect(document.body.textContent).toContain(c.guidance.complete);
    expect([...document.querySelectorAll('button')].some(node => node.textContent === c.restart)).toBe(false);
    button(c.resume).click(); flushSync(); expect(stage()).toBe('profile'); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(h.port.send.mock.calls.some(([m]) => m.method === 'center.preview')).toBe(false);
});
it('closing after a confirmed step resumes exactly its committed value in a new native page', async () => {
    const native = centerClientFixture(); const first = await render('welcome', false, undefined, true, native); await observed();
    button(c.advance).click(); await save(); first.stop(); await ready(() => document.body.textContent === '');
    const next = await render('welcome', false, undefined, true, native); await observed(); expect(stage()).toBe('profile'); expect(saved()).toBe('profile');
    expect((await next.native.repository.read()).settings.revision).toBe(1);
});
it('shows only safely escaped selected local profile names without treating them as a current credential or selecting another profile', async () => {
    const profiles = [{ id: 'work', name: '<img src=x>', scope: { kind: 'global' }, preferences: {} }, { id: 'other', name: 'Not selected', scope: { kind: 'host', host: 'github.com' }, preferences: {} }];
    const initial = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, onboarding: 'profile', profiles, selected: ['work'] } };
    const h = await render('welcome', false, initial); await observed();
    expect(document.querySelector('[data-welcome-profiles]')?.textContent).toBe('<img src=x>'); expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).toContain(c.profileMeaning); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(h.port.send.mock.calls.map(([m]) => m.method)).toEqual(['center.open', 'center.read']);
    expect(h.native.values.get(SETTINGS_KEY)).toEqual(initial);
});
it('requires neither a selected profile nor a connection to advance and offers the native privacy inspector as a separate route', async () => {
    const initial = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, onboarding: 'profile' } };
    const h = await render('welcome', false, initial); await observed(); expect(document.body.textContent).toContain(c.empty);
    button(c.advance).click(); await save(); expect(stage()).toBe('permissions');
    expect(document.querySelector('#welcome-step + p + a')?.getAttribute('href')).toBe('#/privacy');
    expect(h.browser.api.permissions.contains).not.toHaveBeenCalled(); expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('a reviewed restart resets only progress, with cancel retaining completion and confirmation preserving profiles and grants', async () => {
    const initial = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, onboarding: 'complete', profiles: [{ id: 'work', name: 'Work', scope: { kind: 'global' }, preferences: {} }], selected: ['work'] } };
    const h = await render('welcome', false, initial); await observed(); button(c.restart).click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    button('Cancelar cambio').click(); await ready(() => document.querySelector('section [role=status]')?.textContent === reviewCopy('es').states.cancelled);
    button('Cerrar revisión').click(); await ready(() => !document.querySelector('#settings-review-heading')); expect(saved()).toBe('complete');
    button(c.restart).click(); await save(); await ready(() => stage() === 'welcome');
    expect((await h.native.repository.read()).settings).toEqual({ ...initial, revision: 1, center: { ...initial.center, onboarding: 'welcome' } });
});
it('an observer can explore and resume but must explicitly take control to preview a saved progress change', async () => {
    const h = await render('welcome', true); await observed(); expect(button(c.advance).disabled).toBe(true);
    button(c.steps.permissions).click(); flushSync(); expect(stage()).toBe('permissions'); button(c.resume).click(); flushSync(); expect(stage()).toBe('welcome');
    expect(h.port.send.mock.calls.some(([m]) => m.method === 'center.claim')).toBe(false); button('Tomar el control de la edición').click();
    await ready(() => !button(c.advance).disabled); button(c.advance).click(); await save(); expect(saved()).toBe('profile');
});
it('a changed revision between preview and confirmation rejects progress without losing the newer stored preferences', async () => {
    const h = await render('welcome'); await observed(); button(c.advance).click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    await h.native.repository.update(settings => ({ ...settings, theme: 'dark' })); button('Confirmar cambio').click();
    await ready(() => document.querySelector('section [role=status]')?.textContent === reviewCopy('es').states.conflict);
    expect((await h.native.repository.read()).settings).toMatchObject({ revision: 1, theme: 'dark', center: { onboarding: 'welcome' } });
    expect(h.native.port.set).toHaveBeenCalledOnce(); expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.confirm')).toHaveLength(1);
});
it('native ownership takeover between preview and confirmation retires the old progress intent without a write', async () => {
    const h = await render('welcome'); await observed(); button(c.advance).click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    const binding = { documentId: 'new-window', tabId: 2 }; const owner = h.native.open(binding);
    expect(h.native.controller.claim(owner.clientId, binding, owner.controllerEpoch).state).toBe('ready'); button('Confirmar cambio').click();
    await ready(() => document.querySelector('section [role=status]')?.textContent === reviewCopy('es').states.stale);
    expect(h.native.port.set).not.toHaveBeenCalled(); expect((await h.native.repository.read()).settings.center.onboarding).toBe('welcome');
});
it.each([{ schemaVersion: 99 }, { schemaVersion: 2, broken: true }])('unreadable saved progress offers recovery without replacing it or inventing an editable welcome', async initial => {
    const h = await render('welcome', false, initial, false); await ready(() => !!document.querySelector('main a[href="#/recovery"]'));
    expect(stage()).toBeUndefined(); expect(document.querySelector('main button:not(.toolbar button)')).toBeNull();
    expect(h.native.values.get(SETTINGS_KEY)).toEqual(initial); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a failed fresh read cannot redisplay retained profile selections as current welcome facts', async () => {
    const h = await render('welcome'); await observed(); h.port.send.mockResolvedValueOnce(null);
    button('Consultar configuración actual').click(); await ready(() => !!document.querySelector('main a[href="#/recovery"]'));
    expect(document.querySelector('[data-welcome-step]')).toBeNull(); expect(document.querySelector('[data-welcome-profiles]')).toBeNull();
    expect(h.native.port.set).not.toHaveBeenCalled();
});
it('migration blocked by native storage leaves welcome inert and preserves the legacy record for safe recovery', async () => {
    const native = centerClientFixture(); const { center: _center, ...legacy } = DEFAULT_SETTINGS; const initial = { ...legacy, schemaVersion: 1 };
    vi.mocked(native.native.port.set).mockRejectedValue(new Error('private-migration-error'));
    await render('welcome', false, initial, false, native); await ready(() => document.querySelector('main .notice')?.textContent === centerCopy('es').messages.migration);
    expect(stage()).toBeUndefined(); expect(document.querySelector('main a[href="#/recovery"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('private-migration-error'); expect(native.native.values.get(SETTINGS_KEY)).toEqual(initial);
});
it('overview advertises the saved step and welcome remains discoverable without rewriting progress on navigation', async () => {
    const h = await render('overview'); expect(document.body.textContent).toContain(c.progress);
    await navigate('welcome'); await observed(); await navigate('overview'); await ready(() => !!document.querySelector('main a[href="#/welcome"]'));
    expect(h.native.port.set).not.toHaveBeenCalled(); expect((await h.native.repository.read()).settings.center.onboarding).toBe('welcome');
});
it('exploring focuses current content after rendering, while disposal retires a scheduled focus before it can affect another view', async () => {
    const h = await render('welcome'); await observed(); button(c.steps.profile).click(); await tick();
    expect(document.activeElement?.id).toBe('center-main'); expect(stage()).toBe('profile');
    const focused = vi.spyOn(HTMLElement.prototype, 'focus'); button(c.resume).click(); h.stop(); await tick();
    expect(focused).not.toHaveBeenCalled(); expect(document.body.textContent).toBe('');
});
it.each(['en', 'es', 'fr', 'pt'] as const)('welcome renders all %s step guidance, semantic navigation and exact links without mixed-language fallback', async locale => {
    const local = welcomeCopy(locale); await render('welcome', false, { ...DEFAULT_SETTINGS, locale }, true, centerClientFixture(), locale); await observed();
    expect(document.querySelector('nav[aria-label="' + local.navigation + '"]')).not.toBeNull();
    for (const step of ['welcome', 'profile', 'permissions', 'complete'] as const) {
        button(local.steps[step]).click(); flushSync(); expect(stage()).toBe(step);
        expect(document.querySelector('button[aria-current=step]')?.textContent).toBe(local.steps[step]); expect(document.body.textContent).toContain(local.guidance[step]);
    }
    expect(document.body.textContent).toContain(local.boundary); expect(document.body.textContent).toContain(local.previewHint);
    expect(document.querySelector('main a[href="https://docs.page/vypdev/copilot/browser-extension/onboarding"]')?.textContent).toBe(local.guide);
});
