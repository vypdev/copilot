// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { nativeCenterDom } from '../fixtures/native_center_dom.ts';
import { button, change, navigate, ready } from '../fixtures/center_app_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { CenterClient } from '../../src/application/center_client.ts';
import { CenterChannelClient } from '../../src/adapters/browser/center_channel_client.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';

const editable = () => !!document.querySelector('#center-theme') && !document.querySelector('#center-theme')!.matches(':disabled');
const reviewState = () => document.querySelector('section[aria-labelledby=settings-review-heading] [role=status]')?.textContent;
it('composed native hash-loading keeps the current editor and an unsaved appearance draft', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark'); h.loading(); flushSync();
    expect(editable()).toBe(true); expect((document.getElementById('center-theme') as HTMLSelectElement).value).toBe('dark');
    expect(h.background.localArea.set).not.toHaveBeenCalled(); expect(h.background.ports).toHaveLength(1);
});
it('composed native loading preserves the unsaved-navigation guard and its keep-editing action', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark'); h.loading(); window.location.hash = '#/profiles';
    await ready(() => !!document.querySelector('[role=alert] button')); button('Keep editing').click();
    await ready(() => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === '#/appearance');
    expect(editable()).toBe(true); expect((document.getElementById('center-theme') as HTMLSelectElement).value).toBe('dark');
});
it('composed native route loading leaves the same retained preview usable only through explicit confirmation', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark'); button('Review change').click();
    await ready(() => !!document.querySelector('#settings-review-heading')); h.loading();
    expect(h.background.localArea.set).not.toHaveBeenCalled(); expect(button('Confirm change').disabled).toBe(false);
    button('Confirm change').click(); await ready(() => reviewState() === 'The change is saved.'); expect(h.background.localArea.set).toHaveBeenCalledOnce();
});
it('composed worker loss disables idle editing immediately and keeps local draft fields', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark'); h.restart();
    await ready(() => document.body.textContent?.includes(centerCopy('en').issues.unavailable) === true);
    expect(editable()).toBe(false); expect((document.getElementById('center-theme') as HTMLSelectElement).value).toBe('dark'); expect(h.background.localArea.set).not.toHaveBeenCalled();
});
it('composed background notifications and focus do not reconnect a retired document until an explicit read', async () => {
    const h = await nativeCenterDom(); h.restart();
    await ready(() => document.body.textContent?.includes(centerCopy('en').issues.unavailable) === true);
    await h.background.api.runtime.sendMessage({ version: 1, method: 'center.invalidated' });
    window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); await Promise.resolve(); await Promise.resolve();
    expect(h.background.ports).toHaveLength(1); expect(editable()).toBe(false);
    button('Read current settings').click(); await ready(editable); expect(h.background.ports).toHaveLength(2);
});
it('composed explicit read after worker replacement reacquires a source without replaying or clearing the draft', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark'); h.restart();
    await ready(() => !editable()); button('Read current settings').click(); await ready(editable);
    expect((document.getElementById('center-theme') as HTMLSelectElement).value).toBe('dark');
    expect(h.background.ports).toHaveLength(2); expect(h.background.localArea.set).not.toHaveBeenCalled();
});
it('composed disconnection retires an unsubmitted review and never offers its old confirmation again', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark'); button('Review change').click();
    await ready(() => !!document.querySelector('#settings-review-heading')); h.restart();
    await ready(() => reviewState() === reviewCopy('en').states.stale); expect([...document.querySelectorAll('button')].some(node => node.textContent === 'Confirm change')).toBe(false);
    expect(h.background.localArea.set).not.toHaveBeenCalled();
});
it('composed lost confirmation acknowledgement retains uncertainty then reconciles only the exact saved receipt without another write', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark'); button('Review change').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    const wait = deferred<void>(); const save = vi.mocked(h.background.localArea.set).getMockImplementation()!;
    vi.mocked(h.background.localArea.set).mockImplementationOnce(async value => { await save(value); await wait.promise; });
    button('Confirm change').click(); await ready(() => vi.mocked(h.background.localArea.set).mock.calls.length === 1); h.restart();
    await ready(() => reviewState() === reviewCopy('en').states.unknown); wait.resolve();
    button('Read current settings').click(); await ready(() => reviewState() === reviewCopy('en').states.saved);
    expect(h.background.localArea.set).toHaveBeenCalledOnce(); expect(h.settings().current?.revision).toBe(1);
});
it('composed second source remains an observer until explicit takeover, which retires editing without discarding the first draft', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark');
    const transport = new CenterChannelClient(h.background.api.runtime, () => other.disconnected());
    const other = new CenterClient({ sourceTree: 'unbundled', send: message => transport.send(message) });
    try {
        await other.start(); expect(other.view.role).toBe('observer'); expect(editable()).toBe(true);
        await other.takeControl(); await ready(() => !editable());
        expect((document.getElementById('center-theme') as HTMLSelectElement).value).toBe('dark'); expect(h.background.localArea.set).not.toHaveBeenCalled();
    } finally { other.stop(); transport.stop(); }
});
it('composed idle native invalidation never reconnects an already disposed options page', async () => {
    const h = await nativeCenterDom(); h.stopCenter(); const connections = h.background.ports.length;
    h.restart(); await Promise.resolve(); await Promise.resolve();
    expect(h.background.ports).toHaveLength(connections); expect(h.foreground.onMessage.listeners.size).toBe(0); expect(h.background.localArea.set).not.toHaveBeenCalled();
});
it('composed replacement-source read preserves an already observed saved result', async () => {
    const h = await nativeCenterDom(); change('center-theme', 'dark'); button('Review change').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    button('Confirm change').click(); await ready(() => reviewState() === 'The change is saved.'); h.restart();
    await ready(() => document.body.textContent?.includes(centerCopy('en').issues.unavailable) === true);
    button('Read current settings').click(); await ready(() => document.body.textContent?.includes(centerCopy('en').issues.unavailable) === false);
    expect(reviewState()).toBe('The change is saved.'); expect(h.background.localArea.set).toHaveBeenCalledOnce();
    button('Close review').click(); await ready(editable);
});
it('composed native source mismatch disables editing instead of treating a new transport as build compatibility', async () => {
    const h = await nativeCenterDom(); vi.stubGlobal('__COPILOT_SOURCE_TREE__', 'f'.repeat(64));
    button('Read current settings').click(); await ready(() => document.body.textContent?.includes(centerCopy('en').issues.incompatible) === true);
    expect(editable()).toBe(false); expect(h.background.localArea.set).not.toHaveBeenCalled();
    h.restart(); await Promise.resolve(); await Promise.resolve();
    expect(document.body.textContent).toContain(centerCopy('en').issues.incompatible);
});
it('composed recovery and native navigation preserve non-default locale resources', async () => {
    const h = await nativeCenterDom('appearance', 'fr'); h.loading(); await navigate('language'); await ready(() => !!document.getElementById('center-locale'));
    expect(document.documentElement.lang).toBe('fr'); h.restart(); await ready(() => document.body.textContent?.includes(centerCopy('fr').issues.unavailable) === true);
    button(centerCopy('fr').messages.refresh).click(); await ready(() => !document.getElementById('center-locale')?.matches(':disabled'));
    expect(document.documentElement.lang).toBe('fr'); expect(h.background.localArea.set).not.toHaveBeenCalled();
});
