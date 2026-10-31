// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { apiCachePageFixture } from '../fixtures/api_cache_page.ts';
import { render, ready, button } from '../fixtures/center_app_dom.ts';
import { apiCacheCopy } from '../../src/domain/api_cache_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { deferred } from '../fixtures/runtime.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';

const copy = apiCacheCopy('en');
const status = () => document.querySelector('[data-api-cache-status]')?.textContent;
const preview = async () => { await ready(() => document.querySelector<HTMLButtonElement>('#api-cache-review-button')?.disabled === false); button(copy.review).click(); await ready(() => status() === copy.states.reviewed && !button(copy.confirm).disabled); };
it('actual Privacy review, cancel, clear and retained-result inspection use the production gateway without changing preferences or making HTTP requests', async () => {
    const h = apiCachePageFixture(); await render('privacy', false, undefined, true, h, 'en');
    await preview(); await ready(() => document.activeElement?.id === 'api-cache-review-heading');
    expect(document.querySelector('[data-api-cache]')?.textContent).toContain(copy.scope); expect(document.querySelector('[data-api-cache]')?.textContent).toContain(copy.preserved);
    button(copy.cancel).click(); await ready(() => status() === copy.outcomes.cancelled); expect(h.cache.clear).not.toHaveBeenCalled();
    button(copy.close).click(); await ready(() => !document.querySelector('#api-cache-review-heading')); await ready(() => document.activeElement?.id === 'api-cache-review-button');
    await preview(); button(copy.confirm).click(); await ready(() => status() === copy.outcomes.cleared); expect(h.cache.clear).toHaveBeenCalledOnce();
    button(copy.inspect).click(); await ready(() => status() === copy.outcomes.cleared && !button(copy.inspect).disabled); expect(h.cache.clear).toHaveBeenCalledOnce();
    expect(h.native.values.has(SETTINGS_KEY)).toBe(false); expect(h.reads.reader.read).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('operationId'); expect(document.querySelector('[data-api-cache] input')).toBeNull();
});
it('a lost acknowledgement leaves read-only result recovery, keeps its selector across closing and never sends another clear', async () => {
    const h = apiCachePageFixture(); await render('privacy', false, undefined, true, h, 'en'); await preview();
    const send = h.port.send.getMockImplementation()!; h.port.send.mockImplementation(async message => {
        const reply = await send(message); return message.method === 'center.cache.confirm' ? null : reply;
    });
    button(copy.confirm).click(); await ready(() => status() === copy.outcomes.unknown); expect(h.cache.clear).toHaveBeenCalledOnce();
    expect(document.querySelector('#api-cache-review-heading')?.parentElement?.textContent).toContain(copy.unknownHelp);
    expect([...document.querySelectorAll('button')].some(node => node.textContent === copy.confirm)).toBe(false);
    button(copy.close).click(); await ready(() => !document.querySelector('#api-cache-review-heading')); button(copy.inspect).click();
    await ready(() => status() === copy.outcomes.cleared); expect(h.cache.clear).toHaveBeenCalledOnce();
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.cache.confirm')).toHaveLength(1);
});
it('navigation is guarded during clearing and leaving an unsubmitted review explicitly keeps the cache', async () => {
    const h = apiCachePageFixture(); await render('privacy', false, undefined, true, h, 'en'); await preview();
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('[role=alert]')); expect(window.location.hash).toBe('#/privacy');
    const leave = document.querySelector<HTMLButtonElement>('[role=alert] button:last-child')!; expect(leave.textContent).toBe(copy.close); leave.click();
    await ready(() => !!document.querySelector('#center-theme')); expect(h.cache.clear).not.toHaveBeenCalled();
    window.location.hash = '#/privacy'; await ready(() => !!document.querySelector('#api-cache-review-button')); await preview();
    const wait = deferred<unknown>(); const send = h.port.send.getMockImplementation()!;
    h.port.send.mockImplementation(message => message.method === 'center.cache.confirm' ? wait.promise : send(message)); button(copy.confirm).click(); flushSync();
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('[role=alert]'));
    expect(document.querySelector<HTMLButtonElement>('[role=alert] button:last-child')?.disabled).toBe(true);
    expect(button(copy.inspect).disabled).toBe(true); expect(button(copy.cancel).disabled).toBe(true); wait.resolve(null); await ready(() => status() === copy.outcomes.unknown);
});
it('corrupt and future preferences leave cache review independently usable without migration or replacement', async () => {
    for (const raw of [{ damaged: true }, { ...DEFAULT_SETTINGS, schemaVersion: 999 }]) {
        const h = apiCachePageFixture(); const app = await render('privacy', false, raw, false, h, 'en'); await preview();
        button(copy.confirm).click(); await ready(() => status() === copy.outcomes.cleared); expect(h.native.values.get(SETTINGS_KEY)).toEqual(raw);
        expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.reads.reader.read).not.toHaveBeenCalled(); app.stop(); await ready(() => !document.querySelector('main'));
    }
});
it('every packaged locale provides the actual cache scope, explicit review/confirmation and observed result without fallback labels', async () => {
    for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
        const local = apiCacheCopy(locale); const h = apiCachePageFixture();
        const app = await render('privacy', false, { ...DEFAULT_SETTINGS, locale }, true, h, locale);
        await ready(() => document.querySelector<HTMLButtonElement>('#api-cache-review-button')?.disabled === false); button(local.review).click();
        await ready(() => document.querySelector('[data-api-cache-status]')?.textContent === local.states.reviewed);
        expect(document.querySelector('#api-cache-review-heading')?.textContent).toBe(local.question); expect(document.querySelector('[data-api-cache]')?.textContent).toContain(local.scope);
        expect(button(local.cancel).disabled).toBe(false); button(local.confirm).click(); await ready(() => status() === local.outcomes.cleared);
        expect(h.cache.clear).toHaveBeenCalledOnce(); expect(button(local.inspect).disabled).toBe(false); expect(button(local.close).disabled).toBe(false);
        app.stop(); await ready(() => !document.querySelector('main'));
    }
});
it('an observer sees the closed scope but cannot review or clear until a separate explicit native editing claim', async () => {
    const h = apiCachePageFixture(); await h.gateway.handle({ version: 1, method: 'center.open' }, { ...CENTER_SENDER, documentId: 'other-editor', tab: { id: 2, incognito: false } });
    await render('privacy', false, undefined, true, h, 'en'); await ready(() => !!document.querySelector('#api-cache-review-button'));
    expect(button(copy.review).disabled).toBe(true); expect(h.cache.clear).not.toHaveBeenCalled(); expect(h.reads.reader.read).not.toHaveBeenCalled();
    button(centerCopy('en').messages.takeControl).click(); await preview(); expect(h.cache.clear).not.toHaveBeenCalled();
    button(copy.cancel).click(); await ready(() => status() === copy.outcomes.cancelled);
});
