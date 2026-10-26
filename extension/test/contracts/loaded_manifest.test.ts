import { expect, it } from 'vitest';
import { targetManifest } from '../../src/infrastructure/target_manifests.ts';
import { loadedManifestMatches } from '../../tooling/loaded_manifest.mts';

interface NativeManifest extends Record<string, unknown> {
    permissions: string[]; browser_specific_settings: { gecko: { data_collection_permissions: Record<string, unknown>; [key: string]: unknown }; [key: string]: unknown };
    content_security_policy: Record<string, unknown>; action: Record<string, unknown>; options_ui: Record<string, unknown>;
    background: Record<string, unknown>; content_scripts: Record<string, unknown>[];
}

const origin = 'moz-extension://00000000-0000-4000-8000-000000000703/';
function expanded() {
    const value = structuredClone(targetManifest('firefox')) as unknown as NativeManifest;
    const gecko = value.browser_specific_settings.gecko;
    Object.assign(gecko, { admin_install_only: null, strict_max_version: null, update_url: null });
    Object.assign(gecko.data_collection_permissions, { has_previous_consent: false, optional: [] });
    value.browser_specific_settings.gecko_android = null; value.applications = structuredClone(value.browser_specific_settings);
    value.author = null; value.icons = null; value.web_accessible_resources = null;
    value.hidden = false; value.granted_host_permissions = false; value.optional_permissions = [];
    value.content_security_policy.sandbox = null;
    Object.assign(value.action, { browser_style: false, default_area: null, default_icon: null, default_popup: null, theme_icons: null });
    Object.assign(value.options_ui, { browser_style: false, page: `${origin}runtime.html` });
    Object.assign(value.background, { page: null, preferred_environment: null, scripts: [`${origin}background.js`], service_worker: null, type: null });
    delete value.background.persistent;
    Object.assign(value.content_scripts[0], { css: null, css_origin: 'author', exclude_globs: null, exclude_matches: null, include_globs: null,
        js: [`${origin}content.js`], match_origin_as_fallback: null, world: 'ISOLATED' });
    return value;
}
it('accepts exact Chrome/Safari and semantically unchanged Firefox provider defaults/absolute packaged URLs', () => {
    for (const target of ['chrome', 'firefox', 'safari'] as const) expect(loadedManifestMatches(target, targetManifest(target), origin)).toBe(true);
    expect(loadedManifestMatches('firefox', expanded(), origin)).toBe(true);
    const native = expanded(); expect(loadedManifestMatches('firefox', native, origin)).toBe(true); expect(native.applications).toBeTruthy();
});
it('never normalizes new permissions, foreign extension paths, aliases, remote resources or non-default browser capabilities', () => {
    const mutations = [
        (value: NativeManifest) => { value.permissions.push('cookies'); },
        (value: NativeManifest) => { value.hidden = true; },
        (value: NativeManifest) => { value.web_accessible_resources = [{ resources: ['runtime.html'], matches: ['<all_urls>'] }]; },
        (value: NativeManifest) => { value.granted_host_permissions = true; },
        (value: NativeManifest) => { value.optional_permissions = ['alarms']; },
        (value: NativeManifest) => { value.applications = {}; },
        (value: NativeManifest) => { delete value.applications; value.browser_specific_settings.gecko_android = {}; },
        (value: NativeManifest) => { delete value.applications; value.browser_specific_settings.gecko.update_url = 'https://evil.invalid'; },
        (value: NativeManifest) => { delete value.applications; value.browser_specific_settings.gecko.data_collection_permissions.optional = ['technicalAndInteraction']; },
        (value: NativeManifest) => { value.content_security_policy.sandbox = 'unsafe'; },
        (value: NativeManifest) => { value.action.browser_style = true; },
        (value: NativeManifest) => { value.action.default_popup = 'remote.html'; },
        (value: NativeManifest) => { value.options_ui.browser_style = true; },
        (value: NativeManifest) => { value.background.page = 'remote.html'; },
        (value: NativeManifest) => { value.options_ui.page = 'moz-extension://foreign/runtime.html'; },
        (value: NativeManifest) => { value.background.scripts = 'remote'; },
        (value: NativeManifest) => { value.background.scripts = ['https://evil.invalid/background.js']; },
        (value: NativeManifest) => { value.content_scripts[0].css = ['remote.css']; },
        (value: NativeManifest) => { value.content_scripts[0].css_origin = 'user'; },
        (value: NativeManifest) => { value.content_scripts[0].world = 'MAIN'; },
        (value: NativeManifest) => { value.content_scripts[0].js = 'remote'; },
        (value: NativeManifest) => { value.content_scripts[0].js = ['moz-extension://foreign/content.js']; },
        (value: NativeManifest) => { value.extra = true; },
    ];
    for (const mutate of mutations) { const value = expanded(); mutate(value); expect(loadedManifestMatches('firefox', value, origin)).toBe(false); }
});
it('refuses malformed native manifest containers without throwing or treating missing proof as a match', () => {
    for (const value of [null, [], false]) expect(loadedManifestMatches('firefox', value, origin)).toBe(false);
    for (const key of ['browser_specific_settings', 'content_security_policy', 'action', 'options_ui', 'background', 'content_scripts']) {
        const value = expanded(); delete value.applications; value[key] = null; expect(loadedManifestMatches('firefox', value, origin)).toBe(false);
    }
    for (const patch of [{ gecko: null }, { gecko: { data_collection_permissions: null } }]) {
        const value = expanded(); delete value.applications; (value as Record<string, unknown>).browser_specific_settings = patch; expect(loadedManifestMatches('firefox', value, origin)).toBe(false);
    }
    const value = expanded(); (value as Record<string, unknown>).content_scripts = [null]; expect(loadedManifestMatches('firefox', value, origin)).toBe(false);
});
