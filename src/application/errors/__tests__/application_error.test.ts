import {
    APPLICATION_ERROR_METADATA,
    ApplicationError,
    type ApplicationErrorCode,
    toApplicationError,
} from '../application_error';
import { runAtApplicationErrorBoundary, runWithApplicationErrorCorrelation } from '../application_error_context';

const CORRELATION_ID = '6f173f89-96a3-4fc8-b90e-4f8f48e0e319';

describe('ApplicationError', () => {
    it('exposes the closed semantic contract for every error code', () => {
        const codes = Object.keys(APPLICATION_ERROR_METADATA) as ApplicationErrorCode[];

        expect(codes).toHaveLength(18);
        for (const code of codes) {
            const error = new ApplicationError(code, 'Safe public message.', { correlationId: CORRELATION_ID });
            expect(error).toMatchObject({
                name: 'ApplicationError',
                code,
                kind: APPLICATION_ERROR_METADATA[code].kind,
                retryable: APPLICATION_ERROR_METADATA[code].retryable,
                correlationId: CORRELATION_ID,
            });
            expect(error.impact).not.toBe('');
            expect(error.action).not.toBe('');
            expect(error.retainedState).not.toBe('');
        }
    });

    it('serializes only public allowlisted fields', () => {
        const cause = new Error('provider-secret');
        const error = new ApplicationError('provider.unavailable', 'Unable to reach provider.', {
            cause,
            correlationId: CORRELATION_ID,
        });

        expect(error.toJSON()).toEqual({
            name: 'ApplicationError',
            message: 'Unable to reach provider.',
            code: 'provider.unavailable',
            kind: 'provider',
            retryable: true,
            impact: 'The provider was temporarily unavailable.',
            action: 'Retry when the provider is available.',
            retainedState: 'Existing persisted state and completed external effects were preserved.',
            correlationId: CORRELATION_ID,
        });
        expect(JSON.stringify(error)).not.toContain('provider-secret');
        expect('cause' in error).toBe(false);
    });

    it('allows retryability to narrow but never broaden', () => {
        expect(new ApplicationError('provider.unavailable', 'Unavailable.', {
            retryable: false,
            correlationId: CORRELATION_ID,
        }).retryable).toBe(false);
        expect(() => new ApplicationError('validation.invalid-input', 'Invalid.', {
            retryable: true,
            correlationId: CORRELATION_ID,
        })).toThrow('Retryability cannot be broadened');
    });

    it('creates and validates lowercase UUID v4 correlation IDs', () => {
        expect(new ApplicationError('unexpected', 'Unexpected.').correlationId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(() => new ApplicationError('validation.invalid-input', 'Invalid.', {
            correlationId: 'not-a-uuid',
        })).toThrow('correlation ID');
    });

    it('preserves semantic errors and normalizes unknown failures safely', () => {
        const existing = new ApplicationError('configuration.invalid', 'Invalid setup.', {
            correlationId: CORRELATION_ID,
        });
        const original = new Error('unexpected-provider-secret');

        expect(toApplicationError(existing, 'unexpected', 'Ignored.')).toBe(existing);
        const normalized = toApplicationError(original, 'workflow.failed', 'Operation failed.', {
            correlationId: CORRELATION_ID,
        });
        expect(normalized).toMatchObject({
            message: 'Operation failed.',
            code: 'workflow.failed',
            kind: 'workflow',
            retryable: true,
            correlationId: CORRELATION_ID,
        });
        expect(JSON.stringify(normalized)).not.toContain('unexpected-provider-secret');
    });

    it('reuses one boundary correlation across nested and concurrent async operations', async () => {
        const secondCorrelationId = 'b7ab91e0-96dc-4f23-a6d2-af6def833b8c';
        const [first, second] = await Promise.all([
            runWithApplicationErrorCorrelation(CORRELATION_ID, async () => {
                await Promise.resolve();
                return runAtApplicationErrorBoundary(() => [
                    new ApplicationError('provider.unavailable', 'First.'),
                    new ApplicationError('workflow.failed', 'Second.'),
                ]);
            }),
            runWithApplicationErrorCorrelation(secondCorrelationId, async () => {
                await Promise.resolve();
                return new ApplicationError('unexpected', 'Concurrent.');
            }),
        ]);

        expect(first.map(error => error.correlationId)).toEqual([CORRELATION_ID, CORRELATION_ID]);
        expect(second.correlationId).toBe(secondCorrelationId);
    });
});
