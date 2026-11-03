import { ApplicationError } from '../../../../application/errors/application_error';
import { AssignmentProviderError } from '../../../../application/ports/assignment_provider_error';
import { withAssignmentProviderFailure } from '../assignment_provider_failure';

describe('assignment provider failure boundary', () => {
    it.each([
        [401, 'authorization.credential-invalid', false], [403, 'authorization.denied', false],
        [404, 'provider.not-found', false], [409, 'provider.conflict', true], [412, 'provider.conflict', true],
        [400, 'provider.contract-invalid', false], [422, 'provider.contract-invalid', false],
        [429, 'provider.rate-limited', true], [408, 'provider.unavailable', true],
        [500, 'provider.unavailable', true], [503, 'provider.unavailable', true], [599, 'provider.unavailable', true],
    ])('maps HTTP %s without provider text', async (status, code, retryable) => {
        const cause = { status, message: 'private-token', response: { data: { members: ['private-member'] } } };
        const error = await withAssignmentProviderFailure('list-teams', async () => { throw cause; }).catch(value => value);
        expect(error).toMatchObject({ code, retryable, operation: 'list-teams', providerStatus: `http-${status}` });
        expect(JSON.stringify(error)).not.toMatch(/private-token|private-member|"response":|"cause":/);
    });

    it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'])('recognizes transport %s', async code => {
        await expect(withAssignmentProviderFailure('list-team-members', async () => { throw { code }; }))
            .rejects.toMatchObject({ code: 'provider.unavailable', retryable: true, providerStatus: 'http-unavailable' });
    });

    it.each([
        { status: 403, response: { headers: { 'Retry-After': '60' } } },
        { status: 403, response: { headers: { 'X-RateLimit-Remaining': '0' } } },
        { status: 403, message: 'secondary rate limit reached' },
        { response: { status: 403 }, headers: { 'retry-after': '60' } },
    ])('distinguishes a limited 403 from denied access (%j)', async cause => {
        await expect(withAssignmentProviderFailure('read-assignees', async () => { throw cause; }))
            .rejects.toMatchObject({ code: 'provider.rate-limited', retryable: true, providerStatus: 'http-403' });
    });

    it.each([null, [], 'private-token', new Error('private-token'), { status: '503' }, { status: 500.5 }, { status: 600 }, { status: 0 }])('does not invent transient availability for an unknown failure (%j)', async cause => {
        const error = await withAssignmentProviderFailure('add-assignees', async () => { throw cause; }).catch(value => value);
        expect(error).toMatchObject({ code: 'unexpected', retryable: false, providerStatus: 'http-unavailable' });
        expect(JSON.stringify(error)).not.toContain('private-token');
    });

    it('uses a bounded response HTTP status when top-level status is invalid', async () => {
        await expect(withAssignmentProviderFailure('list-teams', async () => { throw { status: 'bad', response: { status: 504 } }; }))
            .rejects.toMatchObject({ code: 'provider.unavailable', providerStatus: 'http-504' });
    });

    it('preserves an existing semantic category, narrowed retryability and correlation', async () => {
        const original = new ApplicationError('provider.unavailable', 'Safe diagnostic.', { retryable: false, cause: 'private-token' });
        const error = await withAssignmentProviderFailure('initialize-client', async () => { throw original; }).catch(value => value);
        expect(error).toMatchObject({ code: original.code, retryable: false, correlationId: original.correlationId, operation: 'initialize-client' });
        expect(JSON.stringify(error)).not.toContain('private-token');
    });

    it('preserves the specific inner operation when membership collection rejects asynchronously', async () => {
        const inner = new AssignmentProviderError('authorization.denied', 'list-team-members', 'http-403');
        await expect(withAssignmentProviderFailure('initialize-client', async () => { throw inner; })).rejects.toBe(inner);
    });

    it('returns successful values unchanged', async () => {
        const value = ['alice'];
        await expect(withAssignmentProviderFailure('list-teams', async () => value)).resolves.toBe(value);
    });

    it.each([['not-an-operation', 'http-403'], ['list-teams', 'private-token']])('rejects invalid provider metadata (%s)', (operation, status) => {
        expect(() => new AssignmentProviderError('unexpected', operation as never, status)).toThrow('Assignment provider evidence is invalid.');
    });
});
