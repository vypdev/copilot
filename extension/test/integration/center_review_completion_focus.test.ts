// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { nativeCenterDom } from '../fixtures/native_center_dom.ts';
import { button, change, ready } from '../fixtures/center_app_dom.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { deferred } from '../fixtures/runtime.ts';

it('hands a cancelled native review to its described dismissal without saving or erasing the draft', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const h = await nativeCenterDom();
    await ready(() => document.querySelector('#center-theme')?.matches(':enabled') === true);
    const before = structuredClone(h.background.localValues.get(SETTINGS_KEY));
    change('center-theme', 'dark'); button(centerCopy('en').messages.preview).click();
    await ready(() => document.activeElement === document.querySelector('#settings-review-heading'));
    const cancel = button(reviewCopy('en').cancel); cancel.focus(); cancel.click();
    await ready(() => document.querySelector('section [role=status]')?.textContent === reviewCopy('en').states.cancelled
        && document.querySelector('main')?.getAttribute('aria-busy') === 'false');
    const close = button(reviewCopy('en').dismiss);
    expect(document.activeElement).toBe(close);
    expect(close.getAttribute('aria-describedby')).toBe('settings-review-status');
    expect(document.getElementById('settings-review-status')?.textContent).toBe(reviewCopy('en').states.cancelled);
    expect(h.background.localValues.get(SETTINGS_KEY)).toEqual(before);
    expect((document.querySelector('#center-theme') as HTMLSelectElement).value).toBe('dark');
});

it('hands a saved native review to its localized described dismissal without repeating confirmation', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const h = await nativeCenterDom('appearance', 'es');
    await ready(() => document.querySelector('#center-theme')?.matches(':enabled') === true);
    change('center-theme', 'dark'); button(centerCopy('es').messages.preview).click();
    await ready(() => document.activeElement === document.querySelector('#settings-review-heading'));
    const confirm = button(reviewCopy('es').confirm); confirm.focus(); confirm.click();
    await ready(() => document.querySelector('section [role=status]')?.textContent === reviewCopy('es').states.saved
        && document.querySelector('main')?.getAttribute('aria-busy') === 'false');
    const close = button(reviewCopy('es').dismiss);
    expect(document.activeElement).toBe(close);
    expect(close.getAttribute('aria-describedby')).toBe('settings-review-status');
    expect(document.getElementById('settings-review-status')?.textContent).toBe(reviewCopy('es').states.saved);
    expect(h.settings().current?.theme).toBe('dark'); expect(h.settings().current?.revision).toBe(1);
});

it('disposal during an actual pending cancellation reply cannot restore focus or replay the operation', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const h = await nativeCenterDom();
    await ready(() => document.querySelector('#center-theme')?.matches(':enabled') === true);
    const before = structuredClone(h.background.localValues.get(SETTINGS_KEY));
    change('center-theme', 'dark'); button(centerCopy('en').messages.preview).click();
    await ready(() => document.activeElement === document.querySelector('#settings-review-heading'));
    const pair = h.background.ports[0]; const send = vi.mocked(pair.server.postMessage).getMockImplementation()!;
    const entered = deferred<void>(); let deliver: () => void = () => { throw new Error('reply not yet captured'); };
    vi.mocked(pair.server.postMessage).mockImplementation(value => {
        if ((value as { result?: { state?: string } }).result?.state === 'cancelled') {
            deliver = () => send(value); entered.resolve();
        } else send(value);
    });
    const cancel = button(reviewCopy('en').cancel); cancel.focus(); cancel.click(); await entered.promise;
    const connections = vi.mocked(h.foreground.api.runtime.connect).mock.calls.length;
    h.stopCenter(); await ready(() => document.body.textContent === '');
    expect(() => deliver()).toThrow('native-port-disconnected');
    expect(h.background.localValues.get(SETTINGS_KEY)).toEqual(before);
    expect(h.foreground.api.runtime.connect).toHaveBeenCalledTimes(connections);
    expect(document.activeElement).toBe(document.body);
});
