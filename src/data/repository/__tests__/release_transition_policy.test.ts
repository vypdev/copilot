import { findTargetRelease, releaseIdAsString } from '../release_transition_policy';

describe('release transition policy', () => {
    it('finds a release by target tag while preserving its type', () => {
        const releases = [{ id: 1, tag_name: 'old' }, { id: 2, tag_name: 'latest' }];
        expect(findTargetRelease(releases, 'latest', (release) => release.tag_name)).toEqual(releases[1]);
    });

    it('formats release ids at the boundary', () => {
        expect(releaseIdAsString(42)).toBe('42');
    });
});
