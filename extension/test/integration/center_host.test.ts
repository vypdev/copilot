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
import { loadInventoryPage, loadPrivacyPage } from '../../src/infrastructure/center_pages.ts';

const mounts: Record<string, unknown>[] = []; const clients: ReturnType<typeof centerClientFixture>[] = [];
afterEach(async () => { for (const host of mounts.splice(0)) await unmount(host); clients.splice(0).forEach(h => h.client.stop()); document.body.replaceChildren(); vi.restoreAllMocks(); });
async function ready(predicate: () => boolean): Promise<void> { await vi.waitFor(() => { flushSync(); expect(predicate()).toBe(true); }); }
async function client() { const h = centerClientFixture(); clients.push(h); await h.client.start(); return h; }
function render(view: CenterClientView, load: CenterSurface['load'] = async () => InformationPage, loadInventory: CenterSurface['loadInventory'] = loadInventoryPage, loadPrivacy: CenterSurface['loadPrivacy'] = loadPrivacyPage) {
    const listeners = new Set<(frame: CenterFrame) => void>(); let frame = centerFrame(view, { route: 'help' }, null, 'en');
    const actions: CenterActions = { connections: { connect: vi.fn(), change: vi.fn(), refresh: vi.fn(), dirty: vi.fn() }, preview: vi.fn(), dirty: vi.fn(), takeControl: vi.fn(), stay: vi.fn(), leave: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), dismiss: vi.fn(),
        reload: vi.fn(), focusContent: vi.fn(), browseInventory: vi.fn(), inspectPermissions: vi.fn(), inspectConnection: vi.fn(), exportSettings: vi.fn(async () => false), importSettings: vi.fn(async () => false) };
    const unsubscribe = vi.fn(); const surface: CenterSurface = { initial: frame, actions, load, loadInventory, loadPrivacy,
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
    const view = render(h.client.view, route => route === 'help' ? wait.promise : Promise.resolve(AppearancePage));
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
