import { SetupCredentialsUseCase } from '../setup_credentials_use_case';

const requirement = (name: string, kind: 'workflowPat' | 'apiKey' = 'apiKey') => ({ name, kind, description: name, provider: 'openai' });

describe('SetupCredentialsUseCase', () => {
    it('validates supplied new credentials and returns values only in memory', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn().mockResolvedValue({ name: 'OPENAI_API_KEY', value: 'api-key' }),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn().mockResolvedValue({ name: 'OPENAI_API_KEY', status: 'valid', message: 'ok' }),
        };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };
        const result = await new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat'), requirement('OPENAI_API_KEY')], manageSecrets: true,
        });

        expect(result.collection).toEqual({ workflowPat: { name: 'PAT', value: 'workflow-token' }, apiKeys: [{ name: 'OPENAI_API_KEY', value: 'api-key' }] });
        expect(validation.validateSetupPat).toHaveBeenCalledWith('owner', 'repo', 'setup-token');
        expect(validation.validateCredential).toHaveBeenCalledWith(expect.objectContaining({ name: 'OPENAI_API_KEY' }), 'api-key');
    });

    it('keeps an existing valid credential without requesting its value', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn().mockResolvedValue('keep'), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn(),
        };
        const secrets = { list: jest.fn().mockResolvedValue(['PAT']), upsertSecrets: jest.fn() };
        const remoteHealth = { validateExisting: jest.fn().mockResolvedValue([{ name: 'PAT', status: 'valid', message: 'remote ok' }]) };
        const result = await new SetupCredentialsUseCase(prompt, validation, secrets, remoteHealth).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token', ref: 'main',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
        });

        expect(result.collection).toEqual({ apiKeys: [] });
        expect(prompt.requestWorkflowPat).not.toHaveBeenCalled();
        expect(remoteHealth.validateExisting).toHaveBeenCalledWith('owner', 'repo', 'setup-token', 'main', expect.any(Array));
    });

    it('fails closed when a required credential is omitted', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn().mockResolvedValue(undefined), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }), validateCredential: jest.fn() };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };
        await expect(new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token', requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
        })).rejects.toThrow('PAT is required');
    });

    it('does not allow an invalid existing credential to be skipped', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn().mockResolvedValue('skip'), showCredentialChecks: jest.fn(),
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }), validateCredential: jest.fn() };
        const secrets = { list: jest.fn().mockResolvedValue(['OPENAI_API_KEY']), upsertSecrets: jest.fn() };
        const remoteHealth = { validateExisting: jest.fn().mockResolvedValue([{ name: 'OPENAI_API_KEY', status: 'invalid', message: 'remote rejected it' }]) };

        await expect(new SetupCredentialsUseCase(prompt, validation, secrets, remoteHealth).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token', requirements: [requirement('OPENAI_API_KEY')], manageSecrets: true,
        })).rejects.toThrow('OPENAI_API_KEY is invalid and must be replaced');
        expect(prompt.requestApiKey).not.toHaveBeenCalled();
    });

    it('detects an existing organization Secret and keeps it without requesting its value', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn().mockResolvedValue('keep'), showCredentialChecks: jest.fn(),
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }), validateCredential: jest.fn() };
        const secrets = { list: jest.fn(), upsertSecrets: jest.fn() };
        const remoteHealth = { validateExisting: jest.fn().mockResolvedValue([{ name: 'PAT', status: 'valid', message: 'remote ok' }]) };
        const remoteConfiguration = {
            ownerType: 'Organization' as const, repositoryId: 42, repositoryVisibility: 'private' as const,
            repositorySecrets: [], organizationSecrets: ['PAT'], repositoryVariables: [], organizationVariables: [],
            organizationAccess: 'available' as const, organizationSecretsAccess: 'available' as const,
            organizationVariablesAccess: 'available' as const,
        };

        const result = await new SetupCredentialsUseCase(prompt, validation, secrets, remoteHealth).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token', ref: 'main',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true, remoteConfiguration,
        });

        expect(result.collection).toEqual({ apiKeys: [] });
        expect(prompt.requestWorkflowPat).not.toHaveBeenCalled();
        expect(prompt.chooseExistingCredential).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourceScope: 'organization' }));
        expect(secrets.list).not.toHaveBeenCalled();
    });

    it('accepts one usable credential from an alternative group', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn((candidate: { name: string }) => Promise.resolve(
                candidate.name === 'OPENAI_API_KEY' ? { name: candidate.name, value: 'api-key' } : undefined,
            )),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn().mockResolvedValue({ name: 'OPENAI_API_KEY', status: 'valid', message: 'ok' }),
        };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };
        const alternativeGroup = 'agent:codex:openai';

        const result = await new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [
                { ...requirement('PAT', 'workflowPat'), alternativeGroups: undefined },
                { ...requirement('CODEX_ACCESS_TOKEN'), alternativeGroups: [alternativeGroup] },
                { ...requirement('OPENAI_API_KEY'), alternativeGroups: [alternativeGroup] },
            ],
            manageSecrets: true,
        });

        expect(result.collection.apiKeys).toEqual([{ name: 'OPENAI_API_KEY', value: 'api-key' }]);
        expect(validation.validateCredential).toHaveBeenCalledTimes(1);
    });

    it('allows a supplied custom provider credential when metadata validation is unavailable', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn().mockResolvedValue({ name: 'ACME_API_KEY', value: 'api-key' }),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn().mockResolvedValue({ name: 'ACME_API_KEY', status: 'unverifiable', message: 'no endpoint' }),
        };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };

        const result = await new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat'), {
                ...requirement('ACME_API_KEY'), provider: 'acme', validation: 'unverifiable',
            }],
            manageSecrets: true,
        });

        expect(result.collection.apiKeys).toEqual([{ name: 'ACME_API_KEY', value: 'api-key' }]);
    });
});
