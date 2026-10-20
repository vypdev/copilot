import { readApprovalEvidence } from '../approval_evidence_read';
import { approvalEvidenceError } from '../../../../application/errors/approval_evidence_error';
import { renderApplicationErrorText } from '../../../../application/policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../../../application/policies/application_error_message_catalog';
import { ApplicationError } from '../../../../application/errors/application_error';

describe('sanitized approval evidence failures', () => {
    it.each([
        [401, 'authorization.credential-invalid', false], [403, 'authorization.denied', false],
        [404, 'provider.not-found', false], [409, 'provider.conflict', true],
        [422, 'provider.contract-invalid', false], [429, 'provider.rate-limited', true],
        [500, 'provider.unavailable', true], [502, 'provider.unavailable', true],
        [503, 'provider.unavailable', true], [504, 'provider.unavailable', true],
    ])('preserves HTTP %s with stable retryability across serialization', async (status, code, retryable) => {
        const cause = { status, message: 'SECRET @everyone <script>', response: { data: 'SECRET' } };
        const error = await readApprovalEvidence('jobs', async () => { throw cause; }).catch(error => error);
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error).toMatchObject({ code, retryable, recovery: { id: 'approval-evidence-read-failed',
            variables: { operation: 'jobs', reason: `http-${status}`, permission: 'actions-read' } } });
        const restored = JSON.parse(JSON.stringify(error));
        expect(renderApplicationErrorText(restored)).toContain(`jobs (http-${status})`);
        expect(JSON.stringify(restored)).not.toContain('SECRET');
    });
    it.each([{ 'x-ratelimit-remaining': '0' }, { 'retry-after': '60' }])('recognizes a rate-limited 403 without publishing headers (%j)', async headers => {
        const error = await readApprovalEvidence('head-checks', async () => { throw { status: 403, response: { headers } }; }).catch(error => error);
        expect(error).toMatchObject({ code: 'provider.rate-limited', retryable: true });
        expect(error.recovery.variables.reason).toBe('http-429');
    });
    it.each(['SECRET', 499])('contains unknown status %s as an invalid response', async status => {
        const error = await readApprovalEvidence('files', async () => { throw { status, message: 'SECRET' }; }).catch(error => error);
        expect(error).toMatchObject({ code: 'provider.contract-invalid', retryable: false });
        expect(JSON.stringify(error)).not.toContain('SECRET');
    });
    it('identifies unavailable transport without serializing its raw message', async () => {
        const error = await readApprovalEvidence('merge-runs', async () => { throw new Error('SECRET'); }).catch(error => error);
        expect(error).toMatchObject({ code: 'provider.unavailable', retryable: true });
        expect(renderApplicationErrorText(error)).toContain('merge-runs (transport-unavailable)');
        expect(JSON.stringify(error)).not.toContain('SECRET');
    });
    it('preserves a recognized schema failure rather than reclassifying it as a retry', async () => {
        const original = approvalEvidenceError('reviews', 'invalid-page');
        await expect(readApprovalEvidence('reviews', async () => { throw original; })).rejects.toBe(original);
    });
    it('renders complete Spanish recovery with stable machine facts', () => {
        const error = approvalEvidenceError('classic-protection', 'http-403');
        const text = renderApplicationErrorText(error, resolveStaticApplicationErrorCatalog('es-ES').message);
        expect(text).toContain('No se pudo verificar'); expect(text).toContain('administration-read');
        expect(text).toContain('classic-protection (http-403)'); expect(text).toContain('Reintentable: No');
    });
    it.each([
        { operation: '@everyone', reason: 'http-403', permission: 'actions-read' },
        { operation: 'jobs', reason: '<script>', permission: 'actions-read' },
        { operation: 'jobs', reason: 'http-403', permission: 'SECRET' },
    ])('rejects forged recovery vocabulary (%j)', variables => {
        expect(() => new ApplicationError('authorization.denied', 'Safe', { recovery: {
            id: 'approval-evidence-read-failed', variables: variables as never,
        } })).toThrow('diagnostic is invalid');
    });
});
