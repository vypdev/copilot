// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { flushSync, tick } from 'svelte';
import { apiCachePageFixture } from '../fixtures/api_cache_page.ts';
import { render, ready, button } from '../fixtures/center_app_dom.ts';
import { apiCacheCopy } from '../../src/domain/api_cache_copy.ts';
import { privacyCopy } from '../../src/domain/privacy_copy.ts';
import { deferred } from '../fixtures/runtime.ts';

it('a late cache result cannot move focus back from another native control after blur, while its proved result remains readable', async () => {
    const h = apiCachePageFixture(); const copy = apiCacheCopy('en'); await render('privacy', false, undefined, true, h, 'en');
    await ready(() => document.querySelector<HTMLButtonElement>('#api-cache-review-button')?.disabled === false);
    button(copy.review).click(); await ready(() => document.activeElement?.id === 'api-cache-review-heading');
    const send = h.port.send.getMockImplementation()!; const wait = deferred<void>(); const entered = deferred<void>();
    h.port.send.mockImplementation(async message => { const result = await send(message); if (message.method === 'center.cache.confirm') { entered.resolve(); await wait.promise; } return result; });
    button(copy.confirm).click(); await entered.promise; const other = button(privacyCopy('en').read); other.focus();
    window.dispatchEvent(new Event('blur')); wait.resolve(); await ready(() => document.querySelector('[data-api-cache-status]')?.textContent === copy.outcomes.cleared);
    await tick(); flushSync(); expect(document.activeElement).toBe(other); expect(h.cache.clear).toHaveBeenCalledOnce();
});
it('a foreground cache result respects focus moved to another control while waiting', async () => {
    const h = apiCachePageFixture(); const copy = apiCacheCopy('en'); await render('privacy', false, undefined, true, h, 'en');
    await ready(() => document.querySelector<HTMLButtonElement>('#api-cache-review-button')?.disabled === false);
    button(copy.review).click(); await ready(() => document.activeElement?.id === 'api-cache-review-heading');
    const send = h.port.send.getMockImplementation()!; const wait = deferred<void>(); const entered = deferred<void>();
    h.port.send.mockImplementation(async message => { const result = await send(message); if (message.method === 'center.cache.confirm') { entered.resolve(); await wait.promise; } return result; });
    button(copy.confirm).click(); await entered.promise; const other = button(privacyCopy('en').read); other.focus(); wait.resolve();
    await ready(() => document.querySelector('[data-api-cache-status]')?.textContent === copy.outcomes.cleared); await tick(); flushSync(); expect(document.activeElement).toBe(other);
});
