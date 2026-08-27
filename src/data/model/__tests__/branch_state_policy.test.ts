import {
    hotfixBranch,
    hotfixOriginBranch,
    releaseBranch,
    versionFromHotfixOriginBranch,
    versionFromReleaseBranch,
} from '../branch_state_policy';

describe('branch state policy', () => {
    it('parses and builds release branches', () => {
        expect(versionFromReleaseBranch('release/1.2.3')).toBe('1.2.3');
        expect(releaseBranch('release', '1.2.3')).toBe('release/1.2.3');
    });

    it('parses and builds hotfix branches', () => {
        expect(versionFromHotfixOriginBranch('tags/v1.2.3')).toBe('1.2.3');
        expect(hotfixOriginBranch('1.2.3')).toBe('tags/v1.2.3');
        expect(hotfixBranch('hotfix', '1.2.4')).toBe('hotfix/1.2.4');
    });
});
