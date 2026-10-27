import { withChangeSizeProviderFailure } from '../change_size_provider_failure';
import { ApplicationError } from '../../../../application/errors/application_error';
import { ChangeSizeProviderError } from '../../../../application/ports/change_size_provider_error';

async function failure(cause: unknown): Promise<ChangeSizeProviderError> {
    try { await withChangeSizeProviderFailure(async () => { throw cause; }); }
    catch (error) { return error as ChangeSizeProviderError; }
    throw new Error('Expected a failure');
}

describe('size provider exception boundary', () => {
    it.each([
        [401, 'authorization.credential-invalid', false], [403, 'authorization.denied', false],
        [404, 'provider.not-found', false], [409, 'provider.conflict', true], [412, 'provider.conflict', true],
        [400, 'provider.contract-invalid', false], [422, 'provider.contract-invalid', false],
        [429, 'provider.rate-limited', true], [408, 'provider.unavailable', true], [503, 'provider.unavailable', true],
        [499, 'unexpected', false],
    ])('maps HTTP %s without provider bodies', async (status, code, retryable) => {
        const error = await failure({ status, message: 'secret', response: {
            headers: { 'X-GitHub-Request-Id': 'ABCD:1234', authorization: 'secret' }, data: 'secret',
        } });
        expect(error).toMatchObject({ code, retryable, providerStatus: `http-${status}`, providerReference: 'ABCD:1234' });
        expect(JSON.stringify(error)).not.toContain('secret');
    });

    it.each([
        { status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } },
        { status: 403, response: { headers: { 'retry-after': '60' } } },
        { errors: [{ type: 'RATE_LIMITED' }] },
    ])('distinguishes rate limiting from denied permission', async cause => {
        expect(await failure(cause)).toMatchObject({ code: 'provider.rate-limited', retryable: true });
    });

    it.each([
        ['FORBIDDEN', 'authorization.denied'], ['UNAUTHORIZED', 'authorization.denied'],
        ['NOT_FOUND', 'provider.not-found'], ['INVALID', 'provider.contract-invalid'],
    ])('maps GraphQL %s without its message', async (type, code) => {
        expect(await failure({ status: 200, errors: [{ type, message: 'secret' }] })).toMatchObject({ code, retryable: false });
    });

    it.each(['INTERNAL', 'SERVICE_UNAVAILABLE'])('recognizes GraphQL transient %s on HTTP 200', async type => {
        expect(await failure({ status: 200, errors: [{ type }] })).toMatchObject({ code: 'provider.unavailable', retryable: true });
    });

    it('keeps malformed GraphQL errors nonretryable', async () => {
        expect(await failure({ errors: [null] })).toMatchObject({ code: 'provider.contract-invalid', retryable: false });
    });

    it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'])('recognizes transport %s', async code => {
        expect(await failure({ code })).toMatchObject({ code: 'provider.unavailable', retryable: true, providerStatus: 'http-unavailable' });
    });

    it.each([undefined, null, [], 'secret', new Error('secret'), { status: '503' }, { status: 999 }, { status: 500.5 }])('does not turn unknown failures into retryable outages: %p', async cause => {
        expect(await failure(cause)).toMatchObject({ code: 'unexpected', retryable: false, providerStatus: 'http-unavailable' });
    });

    it.each(['secret with spaces', 'x'.repeat(65), '<script>', 123])('rejects unsafe provider reference %p', async reference => {
        expect(await failure({ headers: { 'x-github-request-id': reference } })).toMatchObject({ providerReference: 'unavailable' });
    });

    it('retains semantic classification, narrowed retry and correlation', async () => {
        const cause = new ApplicationError('provider.unavailable', 'safe', { retryable: false });
        expect(await failure(cause)).toMatchObject({ code: cause.code, retryable: false, correlationId: cause.correlationId });
        const mapped = new ChangeSizeProviderError('authorization.denied', 'http-403', 'unavailable');
        expect(await failure(mapped)).toBe(mapped);
    });

    it('returns successful provider values without changing them', async () => {
        const value = { receipt: 'verified' };
        expect(await withChangeSizeProviderFailure(async () => value)).toBe(value);
    });
});
