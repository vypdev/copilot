import { applyHotfixResolution, applyReleaseResolution } from '../version_resolution_application_policy';

describe('version resolution application policy', () => {
    it('builds the release state', () => {
        expect(applyReleaseResolution('release', '1.2.3')).toEqual({
            version: '1.2.3',
            branch: 'release/1.2.3',
        });
    });

    it('builds the hotfix state and origin branch', () => {
        expect(applyHotfixResolution('hotfix', '1.2.3', '1.2.4')).toEqual({
            baseVersion: '1.2.3',
            baseBranch: 'tags/v1.2.3',
            version: '1.2.4',
            branch: 'hotfix/1.2.4',
        });
    });
});
