// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { nativeCenterDom } from '../fixtures/native_center_dom.ts';
import { button, change, ready } from '../fixtures/center_app_dom.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';

it('moves a retired editor control to explicit described recovery without reconnecting or losing its unsaved draft', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const h = await nativeCenterDom(); const copy = centerCopy('en');
    await ready(() => !!document.querySelector('#center-theme'), 'the real appearance editor is mounted');
    await ready(() => document.querySelector('#center-theme')?.matches(':enabled') === true, 'the native editor is actually editable');
    change('center-theme', 'dark');
    const theme = document.querySelector<HTMLSelectElement>('#center-theme')!;
    theme.focus(); expect(document.hasFocus()).toBe(true); expect(document.activeElement).toBe(theme);
    await ready(() => theme.matches(':enabled') && document.querySelector('main')?.getAttribute('aria-busy') === 'false', 'the foreground native read has settled before disconnecting');
    const before = structuredClone(h.background.localValues.get(SETTINGS_KEY));
    const connections = vi.mocked(h.foreground.api.runtime.connect).mock.calls.length;
    h.restart();
    await ready(() => document.querySelector('.toolbar [role=status]')?.textContent === copy.routes.recovery, 'native background retirement exposes Recovery');
    const read = button(copy.messages.refresh);
    await ready(() => document.activeElement === read, 'the disconnected focused editor moves to explicit recovery');
    expect(theme.matches(':disabled')).toBe(true); expect(theme.value).toBe('dark');
    expect(read.getAttribute('aria-describedby')).toBe('center-runtime-issue');
    expect(document.getElementById('center-runtime-issue')?.textContent).toBe(copy.issues.unavailable);
    expect(h.background.localValues.get(SETTINGS_KEY)).toEqual(before);
    expect(h.foreground.api.runtime.connect).toHaveBeenCalledTimes(connections);
    read.click();
    await ready(() => document.querySelector('.toolbar [role=status]')?.textContent === copy.messages.editor);
    expect((document.querySelector('#center-theme') as HTMLSelectElement).value).toBe('dark');
    expect(h.background.localValues.get(SETTINGS_KEY)).toEqual(before);
    expect(h.foreground.api.runtime.connect).toHaveBeenCalledTimes(connections + 1);
});

it('does not steal navigation focus when the real background disconnects', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const h = await nativeCenterDom(); const copy = centerCopy('en');
    await ready(() => document.querySelector('#center-theme')?.matches(':enabled') === true, 'the native editor is ready for the navigation case');
    const link = document.querySelector<HTMLAnchorElement>('nav a[href="#/help"]')!; link.focus();
    const before = structuredClone(h.background.localValues.get(SETTINGS_KEY));
    h.restart(); await ready(() => document.querySelector('.toolbar [role=status]')?.textContent === copy.routes.recovery); await tick();
    expect(document.activeElement).toBe(link); expect(h.background.localValues.get(SETTINGS_KEY)).toEqual(before);
});

it('hands off a retired confirmation without confirming, cancelling or repeating its native write', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const h = await nativeCenterDom(); const copy = centerCopy('en');
    await ready(() => document.querySelector('#center-theme')?.matches(':enabled') === true, 'the native editor is ready for the confirmation case');
    change('center-theme', 'dark'); button(copy.messages.preview).click();
    await ready(() => !!document.querySelector('#settings-review-heading') && document.querySelector('main')?.getAttribute('aria-busy') === 'false', 'the native preference review is ready');
    await ready(() => document.activeElement === document.querySelector('#settings-review-heading'), 'the initial review heading receives its one intended focus');
    const confirm = button('Confirm change'); confirm.focus(); expect(document.activeElement).toBe(confirm);
    await ready(() => confirm.matches(':enabled') && document.querySelector('main')?.getAttribute('aria-busy') === 'false', 'the focused confirmation has a settled native context');
    const before = structuredClone(h.background.localValues.get(SETTINGS_KEY));
    const connections = vi.mocked(h.foreground.api.runtime.connect).mock.calls.length;
    h.restart(); await ready(() => document.querySelector('.toolbar [role=status]')?.textContent === copy.routes.recovery, 'retired confirmation reports native recovery');
    await ready(() => document.activeElement === button(copy.messages.refresh), 'retired confirmation hands focus to explicit recovery');
    expect(!confirm.isConnected || confirm.disabled).toBe(true);
    expect(h.background.localValues.get(SETTINGS_KEY)).toEqual(before);
    expect(h.foreground.api.runtime.connect).toHaveBeenCalledTimes(connections);
});

it('keeps a confirmation focused when native invalidation refreshes the same valid review', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const h = await nativeCenterDom(); const copy = centerCopy('en');
    await ready(() => document.querySelector('#center-theme')?.matches(':enabled') === true);
    change('center-theme', 'dark'); button(copy.messages.preview).click();
    await ready(() => document.activeElement === document.querySelector('#settings-review-heading'));
    const confirm = button('Confirm change'); confirm.focus();
    await ready(() => confirm.matches(':enabled') && document.querySelector('main')?.getAttribute('aria-busy') === 'false');
    const before = structuredClone(h.background.localValues.get(SETTINGS_KEY));
    for (const listener of h.foreground.onMessage.listeners) listener({ version: 1, method: 'center.invalidated' }, { id: 'test' }, () => undefined);
    await ready(() => confirm.matches(':enabled') && document.querySelector('main')?.getAttribute('aria-busy') === 'false'); await tick();
    expect(document.activeElement).toBe(confirm); expect(h.background.localValues.get(SETTINGS_KEY)).toEqual(before);
});
