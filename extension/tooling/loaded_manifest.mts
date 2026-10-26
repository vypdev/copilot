import { record } from '../src/domain/value.ts';
import { isDeepStrictEqual } from 'node:util';
import { targetManifest } from '../src/infrastructure/target_manifests.ts';
import type { BrowserTarget } from '../src/domain/target.ts';

/** Firefox expands paths/defaults in getManifest(); packaged JSON remains exact and closed. */
export function loadedManifestMatches(target: BrowserTarget, native: unknown, origin: string): boolean {
    const expected = targetManifest(target);
    if (target !== 'firefox') return isDeepStrictEqual(native, expected);
    if (!native || typeof native !== 'object' || Array.isArray(native)) return false;
    const value = structuredClone(native) as Record<string, unknown>;
    const removeDefault = (object: Record<string, unknown>, key: string, allowed: unknown): boolean => {
        if (!Object.hasOwn(object, key)) return true;
        if (!isDeepStrictEqual(object[key], allowed)) return false;
        delete object[key]; return true;
    };
    const emptyDefaults = ['author', 'chrome_settings_overrides', 'chrome_url_overrides', 'commands', 'declarative_net_request',
        'default_locale', 'developer', 'devtools_page', 'experiment_apis', 'homepage_url', 'icons', 'install_origins', 'l10n_resources',
        'minimum_chrome_version', 'minimum_opera_version', 'omnibox', 'options_page', 'page_action', 'protocol_handlers', 'sandbox',
        'short_name', 'sidebar_action', 'theme_experiment', 'web_accessible_resources'];
    if (!emptyDefaults.every(key => removeDefault(value, key, null))) return false;
    if (!removeDefault(value, 'hidden', false) || !removeDefault(value, 'granted_host_permissions', false)
        || !removeDefault(value, 'optional_permissions', [])) return false;
    if (value.applications !== undefined) {
        if (!isDeepStrictEqual(value.applications, value.browser_specific_settings)) return false;
        delete value.applications;
    }
    const specific = value.browser_specific_settings as Record<string, unknown>;
    const gecko = specific?.gecko as Record<string, unknown>;
    const collection = gecko?.data_collection_permissions as Record<string, unknown>;
    if (!record(specific) || !record(gecko) || !record(collection) || !removeDefault(specific, 'gecko_android', null)
        || !['admin_install_only', 'strict_max_version', 'update_url'].every(key => removeDefault(gecko, key, null))
        || !removeDefault(collection, 'has_previous_consent', false) || !removeDefault(collection, 'optional', [])) return false;
    const csp = value.content_security_policy as Record<string, unknown>;
    const action = value.action as Record<string, unknown>; const options = value.options_ui as Record<string, unknown>;
    const background = value.background as Record<string, unknown>;
    if (!record(csp) || !record(action) || !record(options) || !record(background) || !removeDefault(csp, 'sandbox', null)
        || !removeDefault(action, 'browser_style', false)
        || !['default_area', 'default_icon', 'default_popup', 'theme_icons'].every(key => removeDefault(action, key, null))
        || !removeDefault(options, 'browser_style', false)
        || !['page', 'preferred_environment', 'service_worker', 'type'].every(key => removeDefault(background, key, null))) return false;
    const local = (value: unknown, asset: string) => value === `${origin}${asset}` ? asset : value;
    options.page = local(options.page, 'runtime.html');
    if (Array.isArray(background.scripts)) background.scripts = background.scripts.map(script => local(script, 'background.js'));
    if (!Object.hasOwn(background, 'persistent')) background.persistent = false;
    if (!Array.isArray(value.content_scripts)) return false;
    for (const script of value.content_scripts as Record<string, unknown>[]) {
        if (!record(script)) return false;
        if (!['css', 'exclude_globs', 'exclude_matches', 'include_globs', 'match_origin_as_fallback'].every(key => removeDefault(script, key, null))
            || !removeDefault(script, 'css_origin', 'author') || !removeDefault(script, 'world', 'ISOLATED')) return false;
        if (Array.isArray(script.js)) script.js = script.js.map(file => local(file, 'content.js'));
    }
    return isDeepStrictEqual(value, expected);
}
