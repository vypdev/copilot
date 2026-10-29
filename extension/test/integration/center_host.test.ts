// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync, tick, type Component } from 'svelte';
import CenterHost from '../../src/presentation/CenterHost.svelte';
import InformationPage from '../../src/presentation/InformationPage.svelte';
import AppearancePage from '../../src/presentation/AppearancePage.svelte';
import FeatureDetailPage from '../../src/presentation/FeatureDetailPage.svelte';
import type { CenterSurface } from '../../src/presentation/center_surface.ts';
import type { CenterActions, CenterRouteProps, InventoryRouteProps } from '../../src/domain/center_ui.ts';
import type { CenterClientView } from '../../src/domain/center_client_view.ts';
import { centerFrame, type CenterFrame } from '../../src/domain/center_frame.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { deferred } from '../fixtures/runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { loadInventoryPage, loadPrivacyPage, loadSupportPage, loadHistoryPage } from '../../src/infrastructure/center_pages.ts';
import { historyActionsFixture } from '../fixtures/history_ui.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';
import { EMPTY_HISTORY_VIEW } from '../../src/domain/history_client_view.ts';
import { supportCopy } from '../../src/domain/support_copy.ts';

const mounts: Record<string, unknown>[] = []; const clients: ReturnType<typeof centerClientFixture>[] = [];
afterEach(async () => { for (const host of mounts.splice(0)) await unmount(host); clients.splice(0).forEach(h => h.client.stop()); document.body.replaceChildren(); vi.restoreAllMocks(); });
async function ready(predicate: () => boolean): Promise<void> { await vi.waitFor(() => { flushSync(); expect(predicate()).toBe(true); }); }
async function client() { const h = centerClientFixture(); clients.push(h); await h.client.start(); return h; }
function render(view: CenterClientView, load: CenterSurface['load'] = async () => InformationPage, loadInventory: CenterSurface['loadInventory'] = loadInventoryPage, loadPrivacy: CenterSurface['loadPrivacy'] = loadPrivacyPage, loadSupport: CenterSurface['loadSupport'] = loadSupportPage, loadHistory: CenterSurface['loadHistory'] = loadHistoryPage) {
    const listeners = new Set<(frame: CenterFrame) => void>(); let frame = centerFrame(view, { route: 'work' }, null, 'en');
    const actions: CenterActions = { history: historyActionsFixture(), connections: { connect: vi.fn(), change: vi.fn(), refresh: vi.fn(), dirty: vi.fn() }, preview: vi.fn(), dirty: vi.fn(), takeControl: vi.fn(), stay: vi.fn(), leave: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), dismiss: vi.fn(),
        reload: vi.fn(), focusContent: vi.fn(), browseInventory: vi.fn(), inspectPermissions: vi.fn(), inspectConnection: vi.fn(), exportSettings: vi.fn(async () => false), importSettings: vi.fn(async () => false) };
    const unsubscribe = vi.fn(); const surface: CenterSurface = { initial: frame, actions, load, loadInventory, loadPrivacy, loadSupport, loadHistory,
        subscribe: listener => { listeners.add(listener); listener(frame); return () => { listeners.delete(listener); unsubscribe(); }; } };
    const host = mount(CenterHost, { target: document.body, props: { surface } }); mounts.push(host); flushSync();
    return { host, actions, unsubscribe, publish: (next: CenterFrame) => { frame = next; listeners.forEach(listener => listener(next)); flushSync(); } };
}
it('failed lazy loading exposes recovery and never renders a provider exception or an editable page', async () => {
    const h = await client(); const view = render(h.client.view, async () => { throw new Error('private-chunk-location'); });
    await ready(() => document.querySelector('main > [role=alert]') !== null);
    expect(document.body.textContent).not.toContain('private-chunk-location'); expect(document.querySelector('form')).toBeNull();
    (document.querySelector('.toolbar button') as HTMLButtonElement).click(); expect(view.actions.reload).toHaveBeenCalledOnce();
});
it.each(['resolved', 'rejected'] as const)('a previous route’s late %s load cannot replace the current page', async outcome => {
    const h = await client(); const wait = deferred<Component<CenterRouteProps>>();
    const view = render(h.client.view, route => route === 'work' ? wait.promise : Promise.resolve(AppearancePage));
    view.publish(centerFrame(h.client.view, { route: 'appearance' }, null, 'en')); await ready(() => !!document.querySelector('#center-theme'));
    if (outcome === 'resolved') wait.resolve(InformationPage); else wait.reject(new Error('old-load-failed'));
    await tick(); flushSync(); expect(document.querySelector('#center-theme')).not.toBeNull(); expect(document.querySelector('main > [role=alert]')).toBeNull();
});
it('disposing a view retires its subscription and ignores an eventual packaged module result', async () => {
    const h = await client(); const wait = deferred<Component<CenterRouteProps>>(); const view = render(h.client.view, () => wait.promise);
    await unmount(view.host); mounts.splice(mounts.indexOf(view.host), 1); wait.resolve(InformationPage); await tick();
    expect(view.unsubscribe).toHaveBeenCalledOnce(); expect(document.body.textContent).toBe('');
});
it('migration blocked by storage failure keeps preferences read-only and preserves the independent native editing role', async () => {
    const h = centerClientFixture(); clients.push(h); const { center: _center, ...legacy } = DEFAULT_SETTINGS;
    h.native.values.set(SETTINGS_KEY, { ...legacy, schemaVersion: 1 });
    vi.mocked(h.native.port.set).mockRejectedValueOnce(new Error('quota')); await h.client.start();
    expect(h.client.view.data?.state).toBe('migration-required'); render(h.client.view);
    await ready(() => document.body.textContent?.includes('need migration') === true);
    expect(document.querySelector('form')).toBeNull(); expect(document.querySelector('.toolbar [role=status]')?.textContent).toBe('Editing in this window');
});
it.each([{ type: 'preferences', values: {} }, { type: 'unsupported' }])('invalid and unchanged drafts can be corrected without pretending a write succeeded', async intent => {
    const h = await client(); await h.client.preview(intent, 0); expect(['invalid', 'unchanged']).toContain(h.client.view.issue);
    render(h.client.view, async () => AppearancePage); await ready(() => !!document.querySelector('fieldset'));
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false); expect(document.querySelector('#settings-review-heading')).toBeNull();
});
it('an unavailable opening result shows recovery after loading finishes and never offers default preference edits', async () => {
    const h = centerClientFixture(); clients.push(h); h.port.send.mockResolvedValueOnce(null); await h.client.start();
    render(h.client.view); await ready(() => document.querySelector('.toolbar [role=status]')?.textContent === 'Recovery');
    expect(document.querySelector('form')).toBeNull(); expect(document.querySelector('.revision')).toBeNull();
});
it('an unavailable metadata detail shows recovery without inventing another feature or editable defaults', async () => {
    const h = await client(); const view = render(h.client.view, async () => FeatureDetailPage);
    view.publish(centerFrame(h.client.view, { route: 'features', detail: 'missing' }, null, 'en'));
    await ready(() => !!document.querySelector('main [role=alert]'));
    expect(document.querySelector('[data-feature-detail]')).toBeNull(); expect(document.querySelector('form')).toBeNull();
});
it('a failed catalog chunk remains a local recovery state even when settings are unavailable', async () => {
    const h = await client(); const view = render({ ...h.client.view, data: null }, undefined, async () => { throw new Error('private-module-location'); });
    view.publish(centerFrame({ ...h.client.view, data: null }, { route: 'features' }, null, 'en'));
    await ready(() => !!document.querySelector('main > [role=alert]'));
    expect(document.body.textContent).not.toContain('private-module-location'); expect(document.querySelector('form')).toBe(null);
});
it.each(['resolved', 'rejected'] as const)('a retired catalog’s late %s chunk cannot replace the current settings page', async outcome => {
    const h = await client(); const wait = deferred<Component<InventoryRouteProps>>();
    const view = render(h.client.view, async () => AppearancePage, () => wait.promise);
    view.publish(centerFrame(h.client.view, { route: 'features', detail: 'BEX-NAV-01' }, null, 'en'));
    view.publish(centerFrame(h.client.view, { route: 'appearance' }, null, 'en'));
    await ready(() => !!document.querySelector('#center-theme'));
    if (outcome === 'resolved') wait.resolve(FeatureDetailPage); else wait.reject(new Error('retired-module-location'));
    await tick(); flushSync(); expect(document.querySelector('#center-theme')).not.toBe(null); expect(document.querySelector('[data-feature-detail]')).toBe(null);
});
it('a failed privacy chunk has a local recovery state even when configuration is unavailable', async () => {
    const h = await client(); const view = render({ ...h.client.view, data: null }, undefined, undefined, async () => { throw new Error('private-privacy-chunk'); });
    view.publish(centerFrame({ ...h.client.view, data: null }, { route: 'privacy' }, null, 'en'));
    await ready(() => !!document.querySelector('main > [role=alert]'));
    expect(document.body.textContent).not.toContain('private-privacy-chunk'); expect(document.querySelector('form')).toBeNull();
});
it.each(['resolved', 'rejected'] as const)('a retired privacy chunk’s late %s outcome cannot replace the current configuration page', async outcome => {
    const h = await client(); const wait = deferred<Awaited<ReturnType<CenterSurface['loadPrivacy']>>>();
    const view = render(h.client.view, async () => AppearancePage, undefined, () => wait.promise);
    view.publish(centerFrame(h.client.view, { route: 'privacy' }, null, 'en')); await tick();
    view.publish(centerFrame(h.client.view, { route: 'appearance' }, null, 'en')); await ready(() => !!document.querySelector('#center-theme'));
    if (outcome === 'resolved') wait.resolve(await loadPrivacyPage()); else wait.reject(new Error('retired-privacy-path'));
    await tick(); flushSync(); expect(document.querySelector('#center-theme')).not.toBeNull(); expect(document.querySelector('[data-permission-status]')).toBeNull();
});
it('a failed independent support chunk preserves a fixed recovery guide without exposing native or chunk exceptions', async () => {
    const h = await client(); const view = render({ ...h.client.view, data: null }, undefined, undefined, undefined, async () => { throw new Error('private-support-chunk'); });
    view.publish(centerFrame({ ...h.client.view, data: null }, { route: 'help' }, null, 'en'));
    await ready(() => !!document.querySelector('main > [role=alert]'));
    expect(document.querySelector('main a')?.getAttribute('href')).toBe('https://docs.page/vypdev/copilot/browser-extension/onboarding');
    expect(document.body.textContent).not.toContain('private-support-chunk'); expect(document.querySelector('form')).toBeNull();
});
it.each(['resolved', 'rejected'] as const)('a retired support chunk’s late %s result cannot render a former route or erase the current form', async outcome => {
    const h = await client(); const wait = deferred<Awaited<ReturnType<CenterSurface['loadSupport']>>>();
    const view = render(h.client.view, async () => AppearancePage, undefined, undefined, () => wait.promise);
    view.publish(centerFrame(h.client.view, { route: 'about' }, null, 'en')); await tick();
    view.publish(centerFrame(h.client.view, { route: 'appearance' }, null, 'en')); await ready(() => !!document.querySelector('#center-theme'));
    if (outcome === 'resolved') wait.resolve(await loadSupportPage()); else wait.reject(new Error('retired-support-location'));
    await tick(); flushSync(); expect(document.querySelector('#center-theme')).not.toBeNull(); expect(document.querySelector('[data-support-status]')).toBeNull();
});
it('retiring the mounted host ignores a pending support module and never invokes a stale action', async () => {
    const h = await client(); const wait = deferred<Awaited<ReturnType<CenterSurface['loadSupport']>>>();
    const view = render(h.client.view, undefined, undefined, undefined, () => wait.promise);
    view.publish(centerFrame(h.client.view, { route: 'help' }, null, 'en')); await tick(); await unmount(view.host); mounts.splice(mounts.indexOf(view.host), 1);
    wait.resolve(await loadSupportPage()); await tick(); expect(document.body.textContent).toBe(''); expect(view.actions.reload).not.toHaveBeenCalled();
});
it('history chunk failure cannot hide the independently packaged browser permission inspector', async () => {
    const h = await client(); const view = render(h.client.view, undefined, undefined, undefined, undefined, async () => { throw new Error('private-history-chunk'); });
    view.publish(centerFrame({ ...h.client.view, data: null }, { route: 'privacy' }, null, 'en'));
    await ready(() => document.querySelectorAll('[data-browser-capability]').length === 3 && !!document.querySelector('main [role=alert]'));
    expect(document.body.textContent).not.toContain('private-history-chunk'); expect(document.querySelector('[data-permission-status]')).not.toBeNull();
});
it.each(['resolved', 'rejected'] as const)('a history route retired before its %s chunk cannot replace the current page', async outcome => {
    const h = await client(); const gate = deferred<Awaited<ReturnType<CenterSurface['loadHistory']>>>();
    const view = render(h.client.view, async () => AppearancePage, undefined, undefined, undefined, () => gate.promise);
    view.publish(centerFrame(h.client.view, { route: 'activity' }, null, 'en')); await tick();
    view.publish(centerFrame(h.client.view, { route: 'appearance' }, null, 'en')); await ready(() => !!document.querySelector('#center-theme'));
    if (outcome === 'resolved') gate.resolve(await loadHistoryPage()); else gate.reject(new Error('private-retired-history'));
    await tick(); flushSync(); expect(document.querySelector('#center-theme')).not.toBeNull(); expect(document.querySelector('.history-page')).toBeNull();
});
it.each(['invalid', 'unchanged'] as const)('a recoverable %s preference draft keeps an independently current history review available', async issue => {
    const h = await client(); const f = await historyWireExamples(); const view = render(h.client.view);
    view.publish({ ...centerFrame({ ...h.client.view, issue }, { route: 'activity' }, null, 'en'), history: { ...EMPTY_HISTORY_VIEW,
        slots: { ...EMPTY_HISTORY_VIEW.slots, diagnostics: { phase: 'ready', current: true, data: f.off } } } });
    await ready(() => !!document.querySelector('[data-history-consent]'));
    const enable = [...document.querySelectorAll<HTMLButtonElement>('[data-history=diagnostics] button')].find(node => node.textContent === 'Review enable')!;
    expect(enable.disabled).toBe(false);
});
it('support presents an actual native-client uncertain save independently of retained settings, then reconciles only through a read', async () => {
    const h = await client(); await h.client.preview({ type: 'center', values: { onboarding: 'profile' } }, 0);
    const send = h.port.send.getMockImplementation()!; h.port.send.mockImplementation(async message => { const value = await send(message); return message.method === 'center.confirm' ? null : value; });
    await h.client.confirm(); expect(h.client.view.review?.state).toBe('unknown');
    const view = render(h.client.view); view.publish(centerFrame(h.client.view, { route: 'recovery' }, null, 'en'));
    await ready(() => !!document.querySelector('[data-support-operation]'));
    expect(document.querySelector('[data-support-operation]')?.textContent).toBe(supportCopy('en').operations.unknown);
    expect(document.querySelector('[data-support-status]')?.textContent).toBe(supportCopy('en').statuses.unavailable);
    await h.client.refresh(); view.publish(centerFrame(h.client.view, { route: 'recovery' }, null, 'en'));
    expect(document.querySelector('[data-support-operation]')?.textContent).toBe(supportCopy('en').operations.saved);
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
});
