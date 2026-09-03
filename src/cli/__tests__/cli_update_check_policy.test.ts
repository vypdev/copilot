import {
    isUpdateCheckDisabled,
    shouldCheckForUpdates,
    UPDATE_CHECK_DISABLED_ENV,
} from '../cli_update_check_policy';

describe('CLI update check policy', () => {
    it('skips commands that would be noisy or recursive', () => {
        expect(shouldCheckForUpdates('upgrade')).toBe(false);
        expect(shouldCheckForUpdates('help')).toBe(false);
        expect(shouldCheckForUpdates('setup')).toBe(true);
    });

    it('supports explicit opt-out values', () => {
        expect(isUpdateCheckDisabled({ [UPDATE_CHECK_DISABLED_ENV]: 'true' })).toBe(true);
        expect(isUpdateCheckDisabled({ [UPDATE_CHECK_DISABLED_ENV]: '1' })).toBe(true);
        expect(isUpdateCheckDisabled({ [UPDATE_CHECK_DISABLED_ENV]: 'false' })).toBe(false);
        expect(isUpdateCheckDisabled({})).toBe(false);
    });
});
