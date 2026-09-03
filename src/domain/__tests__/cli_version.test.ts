import { compareCliVersions, isNewerCliVersion } from '../cli_version';

describe('CLI version policy', () => {
    it('recognizes newer release versions', () => {
        expect(compareCliVersions('3.3.0', '3.4.0')).toBe(-1);
        expect(isNewerCliVersion('3.3.0', '3.4.0')).toBe(true);
    });

    it('does not report equal or older published versions', () => {
        expect(isNewerCliVersion('3.3.0', '3.3.0')).toBe(false);
        expect(isNewerCliVersion('3.4.0', '3.3.0')).toBe(false);
    });

    it('applies semver prerelease precedence', () => {
        expect(compareCliVersions('3.3.0-beta.2', '3.3.0-beta.10')).toBe(-1);
        expect(compareCliVersions('3.3.0-beta.10', '3.3.0')).toBe(-1);
        expect(compareCliVersions('v3.3.0', '3.3.0')).toBe(0);
        expect(compareCliVersions('3.2.0', '3.3.0')).toBe(-1);
        expect(compareCliVersions('4.0.0', '3.3.9')).toBe(1);
        expect(compareCliVersions('3.3.1', '3.3.0')).toBe(1);
        expect(compareCliVersions('3.3.0-1', '3.3.0-alpha')).toBe(-1);
        expect(compareCliVersions('3.3.0-alpha', '3.3.0-1')).toBe(1);
        expect(compareCliVersions('3.3.0-alpha', '3.3.0-alpha.1')).toBe(-1);
    });

    it('returns undefined for malformed versions', () => {
        expect(compareCliVersions('3.3', '3.4.0')).toBeUndefined();
        expect(compareCliVersions('3.3.0', 'latest')).toBeUndefined();
    });
});
