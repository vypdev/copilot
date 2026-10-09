import { SetupCredentialsUseCase } from '../setup_credentials_use_case';
import { VerifyGuidedWorkflowPatIdentityUseCase } from '../verify_guided_workflow_pat_identity_use_case';
import { SetupInteractionCancelledError } from '../../../errors/setup_interaction_cancelled_error';
import { SetupWorkflowPatIdentityMismatchError } from '../../../errors/setup_workflow_pat_identity_mismatch_error';
import { ApplicationError } from '../../../errors/application_error';

const expected = { id: 42, login: 'vypbot' };
const actual = { id: 99, login: 'operator' };
const request = { owner: 'owner', repository: 'repo', setupToken: 'setup-token', manageSecrets: true,
    requirements: [{ name: 'API_KEY', kind: 'apiKey' as const, description: 'Provider' },
        { name: 'PAT', kind: 'workflowPat' as const, description: 'Runtime' }],
    workflowTokenPermissions: [{ id: 'contents', role: 'workflow' as const, scope: 'repository' as const,
        permission: 'Contents' as const, level: 'write' as const, applicability: 'required' as const,
        reason: 'Write repository', probe: 'contents' as const }],
};

function fixture() {
    const prompt = { guidedWorkflowBotIdentity: expected,
        requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), showCredentialChecks: jest.fn(),
        chooseExistingCredential: jest.fn(), requestApiKey: jest.fn().mockResolvedValue({ name: 'API_KEY', value: 'api-value' }),
        requestWorkflowPat: jest.fn().mockResolvedValueOnce({ name: 'PAT', value: 'wrong-token' })
            .mockResolvedValue({ name: 'PAT', value: 'correct-token' }),
        recoverWorkflowPatIdentityMismatch: jest.fn().mockResolvedValue('retry'),
    };
    const validation = { validateSetupPat: jest.fn().mockResolvedValue({ status: 'valid', message: 'ok' }),
        validateCredential: jest.fn().mockResolvedValue({ status: 'valid', message: 'ok' }) };
    const identities = { resolve: jest.fn(), identify: jest.fn().mockResolvedValueOnce(actual).mockResolvedValue(expected) };
    const secrets = { list: jest.fn().mockResolvedValue([]) };
    const audit = { inspect: jest.fn().mockResolvedValue({ ready: true, identityStatus: 'valid', checks: [] }) };
    const verifier = new VerifyGuidedWorkflowPatIdentityUseCase(identities);
    return { prompt, validation, identities, secrets, audit,
        collect: () => new SetupCredentialsUseCase(prompt, validation, secrets, undefined, audit, undefined, verifier).collect(request) };
}

describe('guided workflow PAT account recovery', () => {
    it('retains collected credentials and audits only the explicitly retried correct-account PAT', async () => {
        const f = fixture();
        let choose!: (answer: string) => void;
        f.prompt.recoverWorkflowPatIdentityMismatch.mockImplementation(() => new Promise(resolve => { choose = resolve; }));
        const pending = f.collect();
        await new Promise(resolve => setImmediate(resolve));
        expect(f.prompt.recoverWorkflowPatIdentityMismatch).toHaveBeenCalledWith(expected, actual);
        expect(f.prompt.requestWorkflowPat).toHaveBeenCalledTimes(1);
        expect(f.audit.inspect).not.toHaveBeenCalled();
        choose('retry');
        await expect(pending).resolves.toMatchObject({ collection: {
            workflowPat: { name: 'PAT', value: 'correct-token' }, apiKeys: [{ name: 'API_KEY', value: 'api-value' }],
        }, checks: [{ status: 'valid' }, { name: 'API_KEY' }, { name: 'PAT', status: 'valid' }] });
        expect(f.audit.inspect).toHaveBeenCalledTimes(1);
        expect(f.audit.inspect).toHaveBeenCalledWith(expect.objectContaining({ token: 'correct-token' }));
        expect(f.identities.identify.mock.calls).toEqual([['wrong-token'], ['correct-token']]);
        expect(f.prompt.requestApiKey).toHaveBeenCalledTimes(1);
        expect(f.secrets.list).toHaveBeenCalledTimes(1);
        expect(f.validation.validateSetupPat).toHaveBeenCalledTimes(1);
    });

    it('cancels without another token prompt or capability test when the user chooses to stop', async () => {
        const f = fixture();
        f.prompt.recoverWorkflowPatIdentityMismatch.mockResolvedValue('cancel');
        await expect(f.collect()).rejects.toBeInstanceOf(SetupInteractionCancelledError);
        expect(f.prompt.requestWorkflowPat).toHaveBeenCalledTimes(1);
        expect(f.audit.inspect).not.toHaveBeenCalled();
    });

    it('requires a new explicit recovery choice for every repeated account mismatch', async () => {
        const f = fixture();
        f.identities.identify.mockReset().mockResolvedValue(actual);
        f.prompt.recoverWorkflowPatIdentityMismatch.mockResolvedValueOnce('retry').mockResolvedValueOnce('cancel');
        await expect(f.collect()).rejects.toBeInstanceOf(SetupInteractionCancelledError);
        expect(f.prompt.recoverWorkflowPatIdentityMismatch).toHaveBeenCalledTimes(2);
        expect(f.identities.identify).toHaveBeenCalledTimes(2);
        expect(f.audit.inspect).not.toHaveBeenCalled();
    });

    it.each([new ApplicationError('provider.unavailable', 'GitHub is unavailable.'),
        new Error('The workflow PAT belongs to @operator, not the selected bot @vypbot.')])(
        'does not reinterpret another error as recoverable account evidence: %s', async error => {
            const f = fixture();
            f.identities.identify.mockReset().mockRejectedValue(error);
            await expect(f.collect()).rejects.toBe(error);
            expect(f.prompt.recoverWorkflowPatIdentityMismatch).not.toHaveBeenCalled();
            expect(f.audit.inspect).not.toHaveBeenCalled();
        });

    it('keeps the existing error contract when the presenter has no interactive recovery capability', async () => {
        const f = fixture();
        const { recoverWorkflowPatIdentityMismatch: _unused, ...prompt } = f.prompt;
        await expect(new SetupCredentialsUseCase(prompt, f.validation, f.secrets, undefined, f.audit, undefined,
            new VerifyGuidedWorkflowPatIdentityUseCase(f.identities)).collect(request))
            .rejects.toBeInstanceOf(SetupWorkflowPatIdentityMismatchError);
        expect(f.audit.inspect).not.toHaveBeenCalled();
    });

    it('does not accept a corrected identity when its token fails the final permission audit', async () => {
        const f = fixture();
        f.audit.inspect.mockResolvedValue({ ready: false, identityStatus: 'valid', checks: [] });
        await expect(f.collect()).rejects.toThrow('PAT validation failed');
        expect(f.audit.inspect).toHaveBeenCalledWith(expect.objectContaining({ token: 'correct-token' }));
        expect(f.prompt.recoverWorkflowPatIdentityMismatch).toHaveBeenCalledTimes(1);
    });

    it('treats missing input after an explicit retry as missing rather than reusing the rejected token', async () => {
        const f = fixture();
        f.prompt.requestWorkflowPat.mockReset().mockResolvedValueOnce({ name: 'PAT', value: 'wrong-token' }).mockResolvedValue(undefined);
        await expect(f.collect()).rejects.toThrow('PAT is required');
        expect(f.identities.identify).toHaveBeenCalledTimes(1);
        expect(f.audit.inspect).not.toHaveBeenCalled();
    });
});
