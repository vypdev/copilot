import { nextHotfixVersion, nextReleaseVersion } from '../version_resolution_policy';

describe('version resolution policy', () => {
    it('increments releases from the latest tag', () => {
        expect(nextReleaseVersion('1.2.3', 'Minor')).toBe('1.3.0');
    });

    it('uses the default base version when no release tag exists', () => {
        expect(nextReleaseVersion(undefined, 'Major')).toBe('2.0.0');
    });

    it('resolves hotfix base and patch version together', () => {
        expect(nextHotfixVersion('1.2.3')).toEqual({ baseVersion: '1.2.3', version: '1.2.4' });
    });
});
