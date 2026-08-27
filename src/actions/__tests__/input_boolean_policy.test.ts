import { isEnabledInput } from '../input_boolean_policy';

describe('input boolean policy', () => {
    it('accepts string and boolean true values', () => {
        expect(isEnabledInput('true')).toBe(true);
        expect(isEnabledInput(true)).toBe(true);
    });

    it('rejects other values', () => {
        expect(isEnabledInput('false')).toBe(false);
        expect(isEnabledInput(false)).toBe(false);
        expect(isEnabledInput(undefined)).toBe(false);
    });
});
