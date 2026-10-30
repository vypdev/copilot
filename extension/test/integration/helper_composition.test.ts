import { expect, it, vi } from 'vitest';
import { helperCompositionFixture as fixture } from '../fixtures/helper_composition.ts';
import { RuntimeHealth } from '../../src/domain/runtime_health.ts';
import { deferred } from '../fixtures/runtime.ts';
import { record } from '../../src/domain/value.ts';
import { helperCopy } from '../../src/domain/helper_copy.ts';

it('the actual page shortcut carries a healthy pre-open snapshot through the native created-tab result', async () => {
    const f = await fixture(); f.key(); await vi.waitFor(() => expect(f.api.tabs.create).toHaveBeenCalledOnce());
    expect(await f.read()).toMatchObject({ state: 'sample', health: { blocked: [], events: [] }, retention: [] }); expect(f.provider).not.toHaveBeenCalled(); expect(f.api.permissions.request).not.toHaveBeenCalled();
});
it('a real runtime-panel mount failure leaves shortcuts alive and transports only its closed reason', async () => {
    const f = await fixture(true); f.key(); await vi.waitFor(() => expect(f.api.tabs.create).toHaveBeenCalledOnce());
    const sample = await f.read(); expect(sample).toMatchObject({ state: 'sample', health: { blocked: ['runtime-health'], events: [{ featureId: 'runtime-health', code: 'mount-failed', scope: 'active-at-observation' }] }, retention: [{ retention: 'untracked' }] });
    expect(JSON.stringify(sample)).not.toMatch(/private_helper_fault_marker|github.com|octo|repositoryId|viewer|generation|settingsRevision|credentialEpoch/); expect(f.provider).not.toHaveBeenCalled();
});
it('opening the native tab may hide and retire the source without undoing its already captured historical observation', async () => {
    const f = await fixture(true); vi.mocked(f.api.tabs.create).mockImplementationOnce(async () => {
        Object.defineProperty(f.document, 'visibilityState', { configurable: true, value: 'hidden' }); f.document.dispatchEvent(new f.dom.window.Event('visibilitychange'));
        for (const listener of f.onActivated.listeners) listener({ tabId: 2, windowId: 1 }); return { id: 2 };
    });
    f.key(); await vi.waitFor(() => expect(f.api.tabs.create).toHaveBeenCalledOnce()); expect(await f.read()).toMatchObject({ state: 'sample', health: { blocked: ['runtime-health'] } });
});
it('the actual panel open capability uses the same capture path without a shortcut command or arbitrary destination', async () => {
    const f = await fixture(); await f.panel.mock.calls.at(-1)![8]!(); expect(f.api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'chrome-extension://test/runtime.html', windowId: 1 });
    expect(await f.read()).toMatchObject({ state: 'sample', health: { events: [] } });
});
it('a queued panel open cannot query hidden page metadata or substitute an empty healthy sample', async () => {
    const f = await fixture(); Object.defineProperty(f.document, 'visibilityState', { configurable: true, value: 'hidden' });
    const query = vi.spyOn(f.document, 'querySelector'); query.mockClear(); await f.panel.mock.calls.at(-1)![8]!(); expect(query).not.toHaveBeenCalled(); expect(await f.read()).toMatchObject({ state: 'unavailable' });
});
it('a page route change before the admitted open callback makes its sample unavailable without a forged page identity', async () => {
    const f = await fixture(); f.dom.window.history.replaceState(null, '', 'https://github.com/login'); await f.panel.mock.calls.at(-1)![8]!(); expect(await f.read()).toMatchObject({ state: 'unavailable' });
});
it('a broken source snapshot cannot fail the primary open or leak an exception', async () => {
    const f = await fixture(); vi.spyOn(RuntimeHealth.prototype, 'snapshot').mockImplementationOnce(() => { throw new Error('private_source_error'); }); f.key();
    await vi.waitFor(() => expect(f.api.tabs.create).toHaveBeenCalledOnce()); const value = await f.read(); expect(value).toMatchObject({ state: 'unavailable' }); expect(JSON.stringify(value)).not.toContain('private_source_error');
});
it('a missing created-tab identity preserves the opening result without inventing a source-window binding', async () => {
    const f = await fixture(); vi.mocked(f.api.tabs.create).mockResolvedValueOnce(undefined); await f.panel.mock.calls.at(-1)![8]!(); expect(f.api.tabs.create).toHaveBeenCalledOnce(); expect(await f.read()).toMatchObject({ state: 'empty' });
});
it.each([-1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('invalid native created-tab identity %s cannot bind the sample', async id => {
    const f = await fixture(); vi.mocked(f.api.tabs.create).mockResolvedValueOnce({ id }); await f.panel.mock.calls.at(-1)![8]!(); expect(await f.read()).toMatchObject({ state: 'empty' });
});
it('native removal clears the own-tab sample without recreating it during metadata refresh', async () => {
    const f = await fixture(); await f.panel.mock.calls.at(-1)![8]!(); expect(await f.read()).toMatchObject({ state: 'sample' });
    for (const listener of f.onRemoved.listeners) listener(2); expect(await f.read()).toMatchObject({ state: 'empty' }); expect(f.api.tabs.create).toHaveBeenCalledOnce();
});
it('a failed center-only notification cannot undo the captured native sample or repeat opening', async () => {
    const f = await fixture(); const send = vi.mocked(f.api.runtime.sendMessage).getMockImplementation()!;
    vi.mocked(f.api.runtime.sendMessage).mockImplementation(message => record(message) && message.method === 'center.health.invalidated' ? Promise.reject(new Error('private_notify')) : send(message));
    await f.panel.mock.calls.at(-1)![8]!(); expect(await f.read()).toMatchObject({ state: 'sample' }); expect(f.api.tabs.create).toHaveBeenCalledOnce();
});
it('an actual content disposal retires its queued key handler before it can send another open or capture', async () => {
    const f = await fixture(); f.contentStop(); f.key(); await Promise.resolve(); expect(f.api.tabs.create).not.toHaveBeenCalled();
});
it('shutdown during an accepted native create does not attach the retired source receipt after a late result', async () => {
    const f = await fixture(); const gate = deferred<unknown>(); const entered = deferred<void>(); vi.mocked(f.api.tabs.create).mockImplementationOnce(() => { entered.resolve(); return gate.promise; });
    const opening = f.panel.mock.calls.at(-1)![8]!(); await entered.promise; f.stop(); gate.resolve({ id: 2 }); await opening; expect(await f.read()).toMatchObject({ state: 'rejected' });
});
it('all compiled locales are complete immutable resource bundles with an atomic English fallback', () => {
    const en = helperCopy('en'); expect(helperCopy('__proto__')).toBe(en); expect(helperCopy('unknown')).toBe(en);
    for (const locale of ['en', 'es', 'fr', 'pt']) { const copy = helperCopy(locale); expect(Object.keys(copy)).toEqual(Object.keys(en)); expect(Object.isFrozen(copy.helpers)).toBe(true); expect(Object.isFrozen(copy.scopes)).toBe(true); }
});
it('an invalid source-ring producer becomes explicit unavailable evidence instead of a fabricated zero-fault or legacy sample', async () => {
    const f = await fixture(); vi.spyOn(RuntimeHealth.prototype, 'snapshot').mockReturnValueOnce({ blocked: ['private'], events: [] }); f.key();
    await vi.waitFor(() => expect(f.api.tabs.create).toHaveBeenCalledOnce()); expect(await f.read()).toMatchObject({ state: 'unavailable' });
});
it('an admitted options surface without native tab identity cannot borrow an existing tab sample', async () => {
    const f = await fixture(); await f.panel.mock.calls.at(-1)![8]!(); const sender = { id: 'test', frameId: 0, documentId: 'non-tab-options', url: 'chrome-extension://test/runtime.html#/help' };
    const owner = await f.call({ version: 1, method: 'center.open' }, sender); expect(await f.call({ version: 1, method: 'center.health.read', clientId: owner.clientId }, sender)).toMatchObject({ state: 'empty' }); expect(await f.read()).toMatchObject({ state: 'sample' });
});
