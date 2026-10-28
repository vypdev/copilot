// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readCenterImport, downloadCenterSettings } from '../../src/infrastructure/center_files.ts';
import { portableSettings } from '../../src/domain/portable_settings.ts';
import { profileDraft, draftProfile } from '../../src/domain/profile_draft.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function file(bytes: Uint8Array, size = bytes.byteLength): void {
    document.body.innerHTML = '<input id="center-import" type="file">';
    Object.defineProperty(document.querySelector('input'), 'files', { value: [{ size, arrayBuffer: vi.fn(async () => bytes.buffer) }] });
}
it('exports only closed portable preferences and never includes native connection grants', () => {
    const current = { ...DEFAULT_SETTINGS, repositories: { '42': { connected: true, paused: true, savedViews: ['is:pr'] }, '43': { connected: false } } };
    expect(portableSettings(null)).toBeNull(); expect(portableSettings({ ...current, schemaVersion: 99 })).toBeNull();
    const exported = portableSettings(current)!; expect(exported.repositories).toEqual({ '42': { paused: true, savedViews: ['is:pr'] }, '43': {} });
    expect(current.repositories['42'].connected).toBe(true); expect(Object.isFrozen(exported.repositories['42'])).toBe(true);
    expect(portableSettings({ ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, favorites: new Array(1) } })).toBeNull();
    expect(portableSettings({ ...DEFAULT_SETTINGS, repositories: { '42': { savedViews: new Array(1) } } })).toBeNull();
});
it('accepts current and supported legacy files, preserves a defensive copy and clears the native file input', async () => {
    for (const incoming of [DEFAULT_SETTINGS, { schemaVersion: 0, compact: true }]) {
        file(new TextEncoder().encode(JSON.stringify(incoming))); const result = await readCenterImport(document);
        expect(result?.schemaVersion).toBe(2); expect(result?.density).toBe(incoming === DEFAULT_SETTINGS ? 'comfortable' : 'compact');
        expect(document.querySelector('input')?.value).toBe('');
    }
});
it('rejects absent, empty, oversized, truncated, malformed UTF-8, malformed JSON and future-schema imports without defaulting them', async () => {
    expect(await readCenterImport(document)).toBeNull();
    for (const [bytes, size] of [[new Uint8Array(), 0], [new Uint8Array([1]), 65537], [new TextEncoder().encode('{}'), 5],
        [new Uint8Array([0xc3, 0x28]), 2], [new TextEncoder().encode('{'), 1], [new TextEncoder().encode('{"schemaVersion":99}'), 20]] as const) {
        file(bytes, size); expect(await readCenterImport(document)).toBeNull();
    }
    file(new TextEncoder().encode('{"schemaVersion":99}')); expect(await readCenterImport(document)).toBeNull();
    file(new TextEncoder().encode('{}')); expect(await readCenterImport(document)).toBeNull();
});
it('creates a short-lived local download with a fixed filename and no connection grant in the actual Blob', async () => {
    let captured: Blob | undefined;
    const create = vi.fn((blob: Blob) => { captured = blob; return 'blob:local-preferences'; }); const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('copilot-preferences.json'); expect(this.hidden).toBe(true); expect(this.href).toBe('blob:local-preferences');
    });
    expect(downloadCenterSettings(document, { ...DEFAULT_SETTINGS, repositories: { '42': { connected: true } } })).toBe(true);
    expect(captured?.type).toBe('application/json;charset=utf-8'); expect(click).toHaveBeenCalledOnce(); expect(document.querySelector('a')).toBeNull();
    const body = await new Promise<string>((resolve, reject) => { const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(captured!); });
    expect(JSON.parse(body).repositories).toEqual({ '42': {} });
    await vi.waitFor(() => { expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:local-preferences'); });
    expect(downloadCenterSettings(document, null)).toBe(false); create.mockImplementation(() => { throw new Error('download unavailable'); });
    expect(downloadCenterSettings(document, DEFAULT_SETTINGS)).toBe(false);
});
it('keeps a profile draft scoped to numeric identities and preserves feature overrides across edits', () => {
    const blank = profileDraft(); expect(blank.kind).toBe('global'); expect(draftProfile(blank)).toBeNull();
    for (const kind of ['global', 'host', 'account', 'organization', 'repository'] as const) {
        const draft = { ...blank, id: 'work', name: 'Work', kind, accountId: '7', organizationId: '8', repositoryId: '9', density: 'compact' as const, paused: 'yes' as const, shortcuts: 'no' as const };
        const profile = draftProfile(draft)!; expect(profile.scope.kind).toBe(kind); expect(profile.preferences).toEqual({ density: 'compact', paused: true, shortcuts: false });
        expect(profileDraft(profile)).toEqual({ ...draft, accountId: ['account', 'organization', 'repository'].includes(kind) ? '7' : '',
            organizationId: kind === 'organization' ? '8' : '', repositoryId: kind === 'repository' ? '9' : '' });
        const inherited = draftProfile({ ...draft, density: 'inherit', paused: 'inherit', shortcuts: 'inherit' }, { ...profile, preferences: { features: { 'BEX-NAV-01': true } } });
        expect(inherited?.preferences).toEqual({ features: { 'BEX-NAV-01': true } });
    }
    expect(draftProfile({ ...blank, id: 'work', name: 'Work', kind: 'account', accountId: 'login-name' })).toBeNull();
    expect(profileDraft({ id: 'flags', name: 'Flags', scope: { kind: 'global' }, preferences: { paused: false, shortcuts: true } }))
        .toMatchObject({ paused: 'no', shortcuts: 'yes' });
});
