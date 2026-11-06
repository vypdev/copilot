// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { nativeCenterDom } from '../fixtures/native_center_dom.ts';
import { button, change, ready } from '../fixtures/center_app_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';

const copies = { request: 2, reply: 2 } as const;
const editable = () => !!document.querySelector('#center-theme') && !document.querySelector('#center-theme')!.matches(':disabled');
const state = () => document.querySelector('section[aria-labelledby=settings-review-heading] [role=status]')?.textContent;
it('duplicated native requests and replies preserve one reviewed save and its single complete revision', async () => {
    const h = await nativeCenterDom('appearance', 'en', copies); expect(editable()).toBe(true);
    change('center-theme', 'dark'); button('Review change').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    expect(h.background.localArea.set).not.toHaveBeenCalled(); button('Confirm change').click();
    await ready(() => state() === 'The change is saved.'); expect(h.background.localArea.set).toHaveBeenCalledOnce();
    expect(h.settings()).toMatchObject({ current: { theme: 'dark', revision: 1 } }); button('Close review').click(); await ready(editable);
    const pair = h.background.ports[0];
    expect(vi.mocked(pair.client.postMessage).mock.calls.filter(([frame]) => (frame as { message: { method: string } }).message.method === 'center.confirm')).toHaveLength(1);
});
it('duplicated cancel deliveries leave original settings intact and do not turn cancellation into confirmation', async () => {
    const h = await nativeCenterDom('appearance', 'en', copies); change('center-theme', 'dark'); button('Review change').click();
    await ready(() => !!document.querySelector('#settings-review-heading')); button('Cancel change').click();
    await ready(() => state() === reviewCopy('en').states.cancelled);
    expect(h.background.localArea.set).not.toHaveBeenCalled(); expect(h.settings()).toMatchObject({ theme: DEFAULT_SETTINGS.theme, revision: 0 });
    button('Close review').click(); await ready(editable);
});
it('worker loss still retires duplicated in-flight confirmation and exact readback never repeats its completed write', async () => {
    const h = await nativeCenterDom('appearance', 'en', copies); change('center-theme', 'dark'); button('Review change').click();
    await ready(() => !!document.querySelector('#settings-review-heading'));
    const wait = deferred<void>(); const save = vi.mocked(h.background.localArea.set).getMockImplementation()!;
    vi.mocked(h.background.localArea.set).mockImplementationOnce(async value => { await save(value); await wait.promise; });
    button('Confirm change').click(); await ready(() => vi.mocked(h.background.localArea.set).mock.calls.length === 1); h.restart();
    await ready(() => state() === reviewCopy('en').states.unknown); expect(editable()).toBe(false); wait.resolve();
    button('Read current settings').click(); await ready(() => state() === 'The change is saved.');
    button('Close review').click(); await ready(editable); expect(h.background.localArea.set).toHaveBeenCalledOnce();
    expect(h.settings()).toMatchObject({ current: { revision: 1, theme: 'dark' } });
});
it('native route loading keeps one private source and the current draft under duplicated delivery', async () => {
    const h = await nativeCenterDom('appearance', 'en', copies); change('center-theme', 'dark'); h.loading();
    await ready(editable); expect((document.querySelector('#center-theme') as HTMLSelectElement).value).toBe('dark');
    expect(h.background.ports).toHaveLength(1); expect(h.background.localArea.set).not.toHaveBeenCalled();
});
