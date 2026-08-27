import { releaseName, tagReference, tagReferencePath } from '../release_tag_policy';

describe('release tag policy', () => {
    it('builds GitHub tag references consistently', () => {
        expect(tagReference('latest')).toBe('tags/latest');
        expect(tagReferencePath('latest')).toBe('refs/tags/latest');
    });

    it('builds release names', () => {
        expect(releaseName('v1.2.3', 'Stable')).toBe('v1.2.3 - Stable');
    });
});
