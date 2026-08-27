import { hotfixResolutionFromPayload, releaseResolutionFromPayload } from '../version_resolution_result_policy';

describe('version resolution result policy', () => {
    it('maps release payload values', () => {
        expect(releaseResolutionFromPayload({ releaseVersion: '1.2.3', releaseType: 'Minor' })).toEqual({
            version: '1.2.3',
            type: 'Minor',
        });
    });

    it('ignores malformed release values', () => {
        expect(releaseResolutionFromPayload({ releaseVersion: 123, releaseType: null })).toEqual({});
    });

    it('maps hotfix payload values', () => {
        expect(hotfixResolutionFromPayload({ baseVersion: '1.2.3', hotfixVersion: '1.2.4' })).toEqual({
            baseVersion: '1.2.3',
            version: '1.2.4',
        });
    });
});
