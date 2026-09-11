import { DEFAULT_BASE_VERSION, DEFAULT_INITIAL_TAG, incrementVersion, getLatestVersion } from '../version_policy';

jest.mock('../../../utils/logger', () => ({
  logDebugInfo: jest.fn(),
}));

describe('version policy', () => {
  describe('DEFAULT_BASE_VERSION', () => {
    it('is 1.0.0 for repositories with no existing tags', () => {
      expect(DEFAULT_BASE_VERSION).toBe('1.0.0');
    });

    it('is valid for incrementVersion (Major, Minor, Patch)', () => {
      expect(incrementVersion(DEFAULT_BASE_VERSION, 'Major')).toBe('2.0.0');
      expect(incrementVersion(DEFAULT_BASE_VERSION, 'Minor')).toBe('1.1.0');
      expect(incrementVersion(DEFAULT_BASE_VERSION, 'Patch')).toBe('1.0.1');
    });
  });

  describe('DEFAULT_INITIAL_TAG', () => {
    it('equals v plus DEFAULT_BASE_VERSION for setup-created tag', () => {
      expect(DEFAULT_INITIAL_TAG).toBe('v1.0.0');
    });
  });

  describe('incrementVersion', () => {
    it('increments major version and resets minor and patch', () => {
      expect(incrementVersion('1.2.3', 'Major')).toBe('2.0.0');
      expect(incrementVersion('10.0.0', 'Major')).toBe('11.0.0');
    });

    it('increments minor version and resets patch', () => {
      expect(incrementVersion('1.2.3', 'Minor')).toBe('1.3.0');
      expect(incrementVersion('2.0.5', 'Minor')).toBe('2.1.0');
    });

    it('increments patch version', () => {
      expect(incrementVersion('1.2.3', 'Patch')).toBe('1.2.4');
      expect(incrementVersion('0.0.0', 'Patch')).toBe('0.0.1');
    });

    it('throws on invalid version format', () => {
      expect(() => incrementVersion('1.2', 'Patch')).toThrow('Invalid version format');
      expect(() => incrementVersion('1', 'Patch')).toThrow('Invalid version format');
      expect(() => incrementVersion('1.2.3.4', 'Patch')).toThrow('Invalid version format');
      expect(() => incrementVersion('invalid', 'Patch')).toThrow('Invalid version format');
    });

    it('throws on unknown release type', () => {
      expect(() => incrementVersion('1.2.3', 'Unknown')).toThrow('Unknown release type');
      expect(() => incrementVersion('1.2.3', '')).toThrow('Unknown release type');
    });
  });

  describe('getLatestVersion', () => {
    it('returns the latest version from a list', () => {
      expect(getLatestVersion(['1.0.0', '1.2.3', '1.2.0'])).toBe('1.2.3');
      expect(getLatestVersion(['2.0.0', '1.9.9', '1.10.0'])).toBe('2.0.0');
    });

    it('returns undefined for empty array', () => {
      expect(getLatestVersion([])).toBeUndefined();
    });

    it('returns the only version for single-element array', () => {
      expect(getLatestVersion(['3.1.4'])).toBe('3.1.4');
    });

    it('sorts versions correctly by major, minor, patch', () => {
      expect(getLatestVersion(['0.0.1', '0.1.0', '1.0.0'])).toBe('1.0.0');
      expect(getLatestVersion(['1.10.0', '1.9.0', '1.2.0'])).toBe('1.10.0');
    });

    it('returns highest when multiple equal versions exist (sort return 0 path)', () => {
      expect(getLatestVersion(['1.0.0', '1.0.0', '2.0.0'])).toBe('2.0.0');
      expect(getLatestVersion(['1.0.0', '1.0.0'])).toBe('1.0.0');
    });
  });
});
