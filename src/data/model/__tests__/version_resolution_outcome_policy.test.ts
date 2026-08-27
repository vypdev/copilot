import { shouldAbortReleaseResolution } from '../version_resolution_outcome_policy';

describe('version resolution outcome policy', () => {
    it('aborts when release type is missing or blank', () => {
        expect(shouldAbortReleaseResolution(undefined)).toBe(true);
        expect(shouldAbortReleaseResolution('')).toBe(true);
        expect(shouldAbortReleaseResolution('  ')).toBe(true);
    });

    it('continues when release type is present', () => {
        expect(shouldAbortReleaseResolution('Minor')).toBe(false);
    });
});
