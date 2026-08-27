import { resolveActionInput, resolveJsonInput } from '../action_input_source';

describe('resolveActionInput', () => {
    it('prefers explicit runtime parameters over defaults', () => {
        expect(resolveActionInput({ token: 'runtime' }, { token: 'default' }, 'token')).toBe('runtime');
    });

    it('uses action defaults when no runtime parameter is provided', () => {
        expect(resolveActionInput({}, { token: 'default' }, 'token')).toBe('default');
    });

    it('reads an input from the GitHub JSON source', () => {
        expect(resolveJsonInput('{"INPUT_TOKEN":"secretless-value"}', 'token')).toBe('secretless-value');
    });

    it('returns undefined when the GitHub JSON source does not contain the key', () => {
        expect(resolveJsonInput('{"INPUT_OTHER":"value"}', 'token')).toBeUndefined();
    });
});
