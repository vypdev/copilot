// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { ready, render, change, button } from '../fixtures/center_app_dom.ts';

it('the native profile identifier constraint rejects invalid characters and keeps hyphenated names usable before any preview', async () => {
    const h = await render('profiles'); await ready(() => !!document.querySelector('#profile-id'));
    change('profile-name', 'Work'); change('profile-id', 'work profile');
    const input = document.querySelector<HTMLInputElement>('#profile-id')!;
    expect(input.validity.patternMismatch).toBe(true); expect(input.checkValidity()).toBe(false);
    button('Revisar cambio').click(); expect(h.port.send.mock.calls.some(([message]) => message.method === 'center.preview')).toBe(false);
    change('profile-id', 'work-profile9'); expect(input.validity.patternMismatch).toBe(false); expect(input.checkValidity()).toBe(true);
    expect(() => new RegExp(input.pattern, 'v')).not.toThrow();
});
