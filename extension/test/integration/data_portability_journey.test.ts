// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';
import { FEATURE_DEFAULTS } from '../../src/domain/feature_defaults.ts';
import { flushSync } from 'svelte';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { readCenterImport } from '../../src/infrastructure/center_files.ts';
import { namedSessionsFixture, CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { button, ready, render } from '../fixtures/center_app_dom.ts';

it('bexh3-center-C28/C46 the actual Data page exports a safe Blob that round-trips preferences while its real synthetic protected vault remains private and unchanged', async () => {
    const native = namedSessionsFixture();
    await native.connections.change({ ...CONNECTION_INPUT, name: 'Private connection label' }, 0, native.current);
    expect(native.values.get(SESSION_KEY)).toMatchObject({ secret: CONNECTION_INPUT.secret, viewerLogin: 'octo', repository: 'octo/example' });
    expect(native.values.get(NAMED_SESSIONS_KEY)).toMatchObject({ entries: [{ name: 'Private connection label' }] });
    const current = { ...DEFAULT_SETTINGS, revision: 4, theme: 'dark' as const,
        repositories: { '7': { connected: true, paused: true, savedViews: ['is:pr label:chosen'] } },
        center: { ...DEFAULT_SETTINGS.center,
            profiles: [{ id: 'personal', name: 'Personal display label', scope: { kind: 'global' as const }, preferences: { density: 'compact' as const } }],
            selected: ['personal'], workspaces: [{ id: 'work', name: 'Authored workspace', members: ['session-1'] }], selectedWorkspace: 'work' } };
    const envelope = { current, previous: { ...DEFAULT_SETTINGS, revision: 3 } };
    const app = await render('data', false, envelope, true, centerClientFixture(native.center), 'en-US');
    await ready(() => document.querySelector('#center-import') !== null);
    expect(document.documentElement.lang).toBe('en');
    const preferencesBefore = JSON.stringify([...app.native.values]); const privateBefore = JSON.stringify([...native.values]);
    const preferenceWrites = vi.mocked(app.native.port.set).mock.calls.length; const privateWrites = vi.mocked(native.port.set).mock.calls.length;
    const providerReads = vi.mocked(native.reader.read).mock.calls.length;
    let captured: Blob | undefined;
    // Only the download boundary is controlled. Actual foreground, gateway, vault, Blob and FileReader run.
    class BackupURL extends URL {
        static createObjectURL = vi.fn((blob: Blob) => { captured = blob; return 'blob:copilot-local-backup'; });
        static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', BackupURL);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('copilot-preferences.json'); expect(this.hidden).toBe(true); expect(this.href).toBe('blob:copilot-local-backup');
    });
    button(centerCopy('en').messages.export).click(); await ready(() => captured !== undefined);
    expect(captured!.type).toBe('application/json;charset=utf-8'); expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(captured!);
    });
    const expected = { ...current, repositories: { '7': { paused: true, savedViews: ['is:pr label:chosen'] } } };
    expect(JSON.parse(text)).toEqual(expected);
    for (const privateValue of [CONNECTION_INPUT.secret, CONNECTION_INPUT.repository, 'octo', 'Private connection label', SESSION_KEY, NAMED_SESSIONS_KEY]) {
        expect(text).not.toContain(privateValue);
    }
    const bytes = new TextEncoder().encode(text); expect(bytes.byteLength).toBe(captured!.size);
    const input = document.querySelector<HTMLInputElement>('#center-import')!;
    Object.defineProperty(input, 'files', { value: [{ size: captured!.size, arrayBuffer: async () => bytes.buffer }] });
    expect(await readCenterImport(document)).toEqual(expected); expect(input.value).toBe('');
    await ready(() => BackupURL.revokeObjectURL.mock.calls.length === 1);
    expect(BackupURL.createObjectURL).toHaveBeenCalledOnce(); expect(BackupURL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:copilot-local-backup');
    expect(JSON.stringify([...app.native.values])).toBe(preferencesBefore); expect(JSON.stringify([...native.values])).toBe(privateBefore);
    expect(app.native.values.get(SETTINGS_KEY)).toEqual(envelope); expect(native.service.status().state).toBe('connected');
    expect(app.native.port.set).toHaveBeenCalledTimes(preferenceWrites); expect(native.port.set).toHaveBeenCalledTimes(privateWrites);
    expect(native.reader.read).toHaveBeenCalledTimes(providerReads);
});

it('bexh3-center-C06 an actual bulk import renders every bounded before/after row without private vault data or a persistence side effect', async () => {
    const native = namedSessionsFixture(); await native.connections.change({ ...CONNECTION_INPUT, name: 'Private import connection' }, 0, native.current);
    const current = { ...DEFAULT_SETTINGS, revision: 8, repositories: { '7': { connected: true, paused: true } } };
    const app = await render('data', false, { current }, true, centerClientFixture(native.center), 'en-US');
    const settingsBefore = JSON.stringify([...app.native.values]); const vaultBefore = JSON.stringify([...native.values]);
    const privateWrites = vi.mocked(native.port.set).mock.calls.length;
    const ids = Object.keys(FEATURE_DEFAULTS); expect(ids).toHaveLength(150);
    const incoming = { ...DEFAULT_SETTINGS, theme: 'dark', features: Object.fromEntries(ids.map(id => [id, false])) };
    const bytes = new TextEncoder().encode(JSON.stringify(incoming)); expect(bytes.byteLength).toBeLessThanOrEqual(65536);
    const input = document.querySelector<HTMLInputElement>('#center-import')!;
    Object.defineProperty(input, 'files', { value: [{ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }] });
    input.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const copy = reviewCopy('en'); const m = centerCopy('en');
    await ready(() => document.querySelector('section[aria-labelledby=settings-review-heading] [role=status]')?.textContent === copy.states.preview);
    const review = document.querySelector('section[aria-labelledby=settings-review-heading]')!;
    const rows = [...review.querySelectorAll('.change')]; expect(rows).toHaveLength(151);
    const values = Object.fromEntries(rows.map(row => [row.querySelector('dt')!.textContent,
        [...row.querySelectorAll('dd p')].map(node => node.textContent)]));
    expect(values).toEqual({ ...Object.fromEntries(ids.map(id => [`${m.routes.features} › ${id}`, [m.messages.unset, m.messages.no]])),
        [m.messages.theme]: [m.messages.github, m.messages.dark] });
    const index = app.port.send.mock.calls.findIndex(([message]) => message.method === 'center.preview'); expect(index).toBeGreaterThanOrEqual(0);
    const reply = await app.port.send.mock.results[index].value; const serialized = JSON.stringify(reply);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(132 * 1024);
    for (const privateValue of [CONNECTION_INPUT.secret, CONNECTION_INPUT.repository, 'Private import connection']) {
        expect(serialized).not.toContain(privateValue); expect(review.textContent).not.toContain(privateValue);
    }
    expect(app.native.port.set).not.toHaveBeenCalled(); expect(JSON.stringify([...app.native.values])).toBe(settingsBefore);
    button(copy.cancel).click(); await ready(() => review.querySelector('[role=status]')?.textContent === copy.states.cancelled);
    expect(JSON.stringify([...native.values])).toBe(vaultBefore); expect(native.port.set).toHaveBeenCalledTimes(privateWrites);
    expect(app.native.port.set).not.toHaveBeenCalled(); expect(JSON.stringify([...app.native.values])).toBe(settingsBefore);
});

it.each(['malformed', 'oversized', 'unknown-field'] as const)('bexh3-center-C29 the actual Data page rejects a %s file without previewing, writing or exposing its body', async kind => {
    const current = { ...DEFAULT_SETTINGS, theme: 'dark' as const }; const app = await render('data', false, { current }, true, undefined, 'en-US');
    const before = JSON.stringify([...app.native.values]);
    const text = kind === 'malformed' ? '{synthetic_private_import' : JSON.stringify({ ...DEFAULT_SETTINGS, secret: 'synthetic_private_import' });
    const bytes = new TextEncoder().encode(text); const read = vi.fn(async () => bytes.buffer);
    const input = document.querySelector<HTMLInputElement>('#center-import')!;
    Object.defineProperty(input, 'files', { value: [{ size: kind === 'oversized' ? 65537 : bytes.byteLength, arrayBuffer: read }] });
    input.dispatchEvent(new Event('change', { bubbles: true })); flushSync(); input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await ready(() => document.querySelector('form [role=alert]')?.textContent === centerCopy('en').messages.invalidFile);
    expect(read).toHaveBeenCalledTimes(kind === 'oversized' ? 0 : 1); expect(input.value).toBe('');
    expect(document.body.textContent).not.toContain('synthetic_private_import'); expect(document.querySelector('#settings-review-heading')).toBeNull();
    expect(app.port.send.mock.calls.filter(([message]) => message.method === 'center.preview')).toHaveLength(0);
    expect(app.native.port.set).not.toHaveBeenCalled(); expect(JSON.stringify([...app.native.values])).toBe(before);
});
