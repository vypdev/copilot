// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { migratedCenterFixture } from '../fixtures/migrated_center.ts';
import { render, ready, navigate } from '../fixtures/center_app_dom.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { inventoryCopy } from '../../src/domain/inventory_copy.ts';

it('migrates one complete nested center revision and keeps actual feature, profile, appearance, language and shortcut views useful without rewriting its vault', async () => {
    const f = await migratedCenterFixture(); const vault = structuredClone([...f.values]);
    const app = await render('features/BEX-NAV-01', false, f.original, true, f.application);
    await ready(() => document.querySelector('[data-feature-source] a')?.textContent === 'Private work');
    expect(app.native.values.get(SETTINGS_KEY)).toEqual({ current: f.expected, previous: f.original });
    expect(app.native.port.set).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-feature-setting]')?.textContent).toBe(inventoryCopy('es').disabled);
    expect(document.querySelector('[data-feature-source] a')?.getAttribute('href')).toBe('#/profiles/work');
    await navigate('profiles'); await ready(() => document.querySelector('[data-preference=density]')?.textContent?.includes('Private work') === true);
    expect(document.querySelector('[data-preference=density]')?.textContent).toContain('Compacta');
    expect(document.querySelector('[data-preference=density]')?.textContent).toContain('Private work');
    await navigate('appearance'); await ready(() => !!document.querySelector('#center-theme'));
    for (const [id, value] of [['center-theme', 'dark'], ['center-text', 'large'], ['center-motion', 'reduced'], ['center-contrast', 'high']]) {
        expect(document.querySelector<HTMLSelectElement>(`#${id}`)?.value).toBe(value);
    }
    await navigate('language'); await ready(() => !!document.querySelector('#center-locale'));
    expect(document.querySelector<HTMLSelectElement>('#center-locale')?.value).toBe('es');
    await navigate('shortcuts'); await ready(() => !!document.querySelector('#shortcut-open-help'));
    expect(document.querySelector<HTMLInputElement>('#shortcuts-enabled')?.checked).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#shortcut-open-help')?.value).toBe('Alt+Shift+H');
    await navigate('work'); await ready(() => !!document.querySelector('[data-work-favorite]'));
    expect(document.querySelector('[data-work-favorite]')?.getAttribute('data-work-favorite')).toBe('BEX-NAV-01');
    await navigate('attention'); await ready(() => !!document.querySelector('[data-attention-kind=onboarding]'));
    expect(document.querySelector('[data-attention-kind=onboarding] a')?.getAttribute('href')).toBe('#/welcome');
    expect(app.native.port.set).toHaveBeenCalledTimes(1);
    expect(app.native.values.get(SETTINGS_KEY)).toEqual({ current: f.expected, previous: f.original });
    expect([...f.values]).toEqual(vault); expect(app.browser.api.permissions.request).not.toHaveBeenCalled();
});

it('after migration retires repository and account provenance on actual verified connection changes while retaining intentional personal preferences', async () => {
    const f = await migratedCenterFixture();
    const app = await render('features/BEX-NAV-01', false, f.original, true, f.application);
    await ready(() => document.querySelector('[data-feature-source] a')?.textContent === 'Private work');
    const settings = structuredClone(app.native.values.get(SETTINGS_KEY));
    async function connect(account: string, repository: string, id: string, revision: number) {
        vi.mocked(f.reader.read).mockImplementation(async request => ({ state: 'ok', etag: '', bytes: 12,
            data: request.type === 'viewer' ? { id: account, login: `viewer${account}` } : { id, name: repository, organizationId: null } }));
        expect(await f.connections.change({ ...CONNECTION_INPUT, name: `Selection ${revision}`, repository,
            secret: `synthetic_isolated_${revision}` }, revision, f.current)).toMatchObject({ state: 'ready', connected: true });
        for (const listener of app.browser.onMessage.listeners) listener({ version: 1, method: 'center.invalidated' }, { id: 'test' }, () => undefined);
        flushSync(); expect(document.querySelector('[data-feature-source] a')).toBeNull();
        await ready(() => document.querySelector('[data-feature-detail] section')?.textContent?.includes(repository) === true);
        expect(document.querySelector('[data-feature-setting]')?.textContent).toBe(inventoryCopy('es').enabled);
        expect(document.querySelector('[data-feature-source] a')).toBeNull();
        expect(document.querySelector('[data-feature-source]')?.textContent).not.toContain('Private work');
    }
    // Same account, different verified repository: the repository-scoped override cannot follow it.
    await connect('1', 'company/other', '8', 1);
    // Same repository ID, different verified account: saved account scope remains binding.
    await connect('2', 'company/example', '7', 2);
    await navigate('appearance'); await ready(() => !!document.querySelector('#center-theme'));
    expect(document.querySelector<HTMLSelectElement>('#center-theme')?.value).toBe('dark');
    expect(document.documentElement.lang).toBe('es');
    expect(document.querySelector<HTMLSelectElement>('#center-motion')?.value).toBe('reduced');
    expect(app.native.values.get(SETTINGS_KEY)).toEqual(settings); expect(app.native.port.set).toHaveBeenCalledTimes(1);
    expect(app.browser.api.permissions.request).not.toHaveBeenCalled();
});
