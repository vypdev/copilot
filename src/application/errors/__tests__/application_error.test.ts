import { ApplicationError, toApplicationError } from '../application_error';

describe('ApplicationError', () => {
    it('exposes a stable semantic contract for callers', () => {
        const cause = new Error('network unavailable');
        const error = new ApplicationError('Unable to reach provider.', 'provider', {
            cause,
            retryable: true,
        });

        expect(error).toMatchObject({
            name: 'ApplicationError',
            kind: 'provider',
            retryable: true,
            cause,
        });
    });

    it('preserves application errors and normalizes unknown failures', () => {
        const existing = new ApplicationError('invalid setup', 'validation');
        const original = new Error('unexpected');

        expect(toApplicationError(existing, 'ignored', 'unknown')).toBe(existing);
        expect(toApplicationError(original, 'Operation failed.', 'workflow', { retryable: true })).toMatchObject({
            message: 'Operation failed.',
            kind: 'workflow',
            retryable: true,
            cause: original,
        });
    });
});
