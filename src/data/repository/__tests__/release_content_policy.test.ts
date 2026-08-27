import { hasReleaseContent, releasePayload } from '../release_content_policy';

describe('release content policy', () => {
    it('recognizes complete source release content', () => {
        expect(hasReleaseContent({ name: 'v1', body: 'notes' })).toBe(true);
        expect(hasReleaseContent({ name: '', body: 'notes' })).toBe(false);
    });

    it('builds the target release payload', () => {
        expect(releasePayload('latest', {
            name: 'v1', body: 'notes', draft: false, prerelease: true,
        })).toEqual({
            tag_name: 'latest', name: 'v1', body: 'notes', draft: false, prerelease: true,
        });
    });
});
