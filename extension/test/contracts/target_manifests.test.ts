import { expect, it } from 'vitest';
import { TARGETS, isBrowserTarget } from '../../src/domain/target.ts';
import { targetManifest } from '../../src/infrastructure/target_manifests.ts';

it('bexh1-foundation-C13 generates the Chrome floor and MV3 module worker', () => {
    expect(targetManifest('chrome')).toMatchObject({ manifest_version: 3, minimum_chrome_version: '140',
        background: { service_worker: 'background.js', type: 'module' } });
});
it('bexh1-foundation-C14 generates Firefox event scripts and a distinct reserved development identity', () => {
    expect(targetManifest('firefox')).toMatchObject({ background: { scripts: ['background.js'], persistent: false },
        browser_specific_settings: { gecko: { strict_min_version: '140.0', id: 'copilot-foundation-dev@extensions.invalid',
            data_collection_permissions: { required: ['none'] } } } });
});
it('bexh1-foundation-C15 generates Safari event scripts/floor without unsupported notifications', () => {
    expect(targetManifest('safari')).toMatchObject({ background: { scripts: ['background.js'], persistent: false },
        browser_specific_settings: { safari: { strict_min_version: '18.2' } }, permissions: ['storage'] });
});
it('bexh1-foundation-C16 has only top-frame packaged GitHub content and storage with no broken UI or broad grants', () => {
    for (const target of TARGETS) {
        const manifest = targetManifest(target);
        expect(manifest.permissions).toEqual(['storage']);
        expect(manifest.incognito).toBe('not_allowed');
        expect(manifest.content_scripts).toEqual([{ matches: ['https://github.com/*'], js: ['content.js'],
            all_frames: false, match_about_blank: false, run_at: 'document_idle' }]);
        for (const key of ['host_permissions', 'optional_permissions', 'options_ui', 'action', 'web_accessible_resources', 'externally_connectable']) {
            expect(manifest).not.toHaveProperty(key);
        }
        expect(isBrowserTarget(target)).toBe(true);
    }
    expect(isBrowserTarget('edge')).toBe(false);
});
