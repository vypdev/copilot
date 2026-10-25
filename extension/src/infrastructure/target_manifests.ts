import { TARGET_POLICY, type BrowserTarget } from '../domain/target.ts';

export const DEVELOPMENT_VERSION = '0.1.0';

/** Typed vendor differences; never transform another vendor's JSON by replacement. */
export function targetManifest(target: BrowserTarget) {
    const base = {
        manifest_version: 3,
        name: 'Copilot Browser — Development Foundation',
        description: 'Private engineering foundation. No GitHub features are activated.',
        version: DEVELOPMENT_VERSION,
        permissions: ['storage'],
        incognito: 'not_allowed',
        content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" },
        content_scripts: [{ matches: ['https://github.com/*'], js: ['content.js'],
            all_frames: false, match_about_blank: false, run_at: 'document_idle' }],
    };
    const floor = TARGET_POLICY[target].floor;
    if (target === 'chrome') return { ...base, minimum_chrome_version: floor,
        background: { service_worker: 'background.js', type: 'module' } };
    const background = { scripts: ['background.js'], persistent: false };
    if (target === 'firefox') return { ...base, background, browser_specific_settings: {
        gecko: { id: 'copilot-foundation-dev@extensions.invalid', strict_min_version: floor,
            data_collection_permissions: { required: ['none'] } },
    } };
    return { ...base, background, browser_specific_settings: { safari: { strict_min_version: floor } } };
}
