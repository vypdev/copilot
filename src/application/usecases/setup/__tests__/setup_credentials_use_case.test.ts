import { SetupCredentialsUseCase } from '../setup_credentials_use_case';

const requirement = (name: string, kind: 'workflowPat' | 'apiKey' = 'apiKey') => ({ name, kind, description: name, provider: 'openai' });

describe('SetupCredentialsUseCase', () => {
    it('rejects an invalid setup PAT before collecting credentials', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'invalid', message: 'denied' }),
            validateCredential: jest.fn(),
        };

        await expect(new SetupCredentialsUseCase(prompt, validation).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token', requirements: [], manageSecrets: true,
        })).rejects.toThrow('Setup PAT validation failed');
        expect(prompt.explainCredentialSeparation).not.toHaveBeenCalled();
    });

    it('returns only the setup check when Secret management is disabled', async () => {
        const setupCheck = { name: 'SETUP_PAT', status: 'valid' as const, message: 'ok' };
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue(setupCheck), validateCredential: jest.fn() };

        await expect(new SetupCredentialsUseCase(prompt, validation).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token', requirements: [], manageSecrets: false,
        })).resolves.toEqual({ collection: { apiKeys: [] }, checks: [setupCheck], existingSecretNames: [] });
        expect(prompt.showCredentialChecks).toHaveBeenCalledWith([setupCheck]);
    });

    it('fails explicitly when Secret management has no repository query port', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn(),
        };

        await expect(new SetupCredentialsUseCase(prompt, validation).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token', requirements: [], manageSecrets: true,
        })).rejects.toThrow('Secret provisioning is not available');
    });

    it('allows an existing valid optional credential to be skipped', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn().mockResolvedValue('skip'), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn(),
        };
        const secrets = { list: jest.fn().mockResolvedValue(['OPTIONAL_KEY']), upsertSecrets: jest.fn() };
        const remoteHealth = {
            validateExisting: jest.fn().mockResolvedValue([{ name: 'OPTIONAL_KEY', status: 'valid', message: 'healthy' }]),
        };

        const result = await new SetupCredentialsUseCase(prompt, validation, secrets, remoteHealth).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [{
                ...requirement('OPTIONAL_KEY'),
                alternativeGroups: ['optional'],
                runnerAuthenticationGroups: ['optional'],
            }],
            manageSecrets: true,
        });

        expect(result.collection).toEqual({ apiKeys: [] });
        expect(prompt.requestApiKey).not.toHaveBeenCalled();
    });

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

    it('replaces and validates an existing credential when requested', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn(),
            requestApiKey: jest.fn().mockResolvedValue({ name: 'OPENAI_API_KEY', value: 'replacement' }),
            chooseExistingCredential: jest.fn().mockResolvedValue('replace'), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn().mockResolvedValue({ name: 'OPENAI_API_KEY', status: 'valid', message: 'replacement ok' }),
        };

        const result = await new SetupCredentialsUseCase(
            prompt,
            validation,
            { list: jest.fn().mockResolvedValue(['OPENAI_API_KEY']) },
            { validateExisting: jest.fn().mockResolvedValue([{ name: 'OPENAI_API_KEY', status: 'valid', message: 'remote ok' }]) },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('OPENAI_API_KEY')], manageSecrets: true,
        });

        expect(validation.validateCredential).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'OPENAI_API_KEY' }),
            'replacement',
        );
        expect(result.collection.apiKeys).toEqual([{ name: 'OPENAI_API_KEY', value: 'replacement' }]);
        expect(result.checks.filter(check => check.name === 'OPENAI_API_KEY')).toEqual([
            expect.objectContaining({ status: 'valid', message: 'replacement ok' }),
        ]);
    });

    it('requires an existing workflow PAT to be re-entered and audited before provisioning it', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn(), chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn(),
        };
        const secrets = { list: jest.fn().mockResolvedValue(['PAT']), upsertSecrets: jest.fn() };
        const remoteHealth = {
            validateExisting: jest.fn().mockResolvedValue([{ name: 'PAT', status: 'valid', message: 'Remote health passed.' }]),
        };
        const permission = {
            id: 'workflow.repository.metadata', role: 'workflow' as const, scope: 'repository' as const,
            permission: 'Metadata', level: 'read' as const, applicability: 'required' as const,
            reason: 'Resolve repository.', probe: 'metadata' as const,
        };
        const report = {
            role: 'workflow' as const, account: 'workflow-bot', identityStatus: 'valid' as const,
            identityMessage: 'ok', ready: true, confirmationRequired: false,
            checks: [{ ...permission, status: 'verified' as const, message: 'available' }],
        };
        const tokenPermissions = { inspect: jest.fn().mockResolvedValue(report) };

        const result = await new SetupCredentialsUseCase(
            prompt,
            validation,
            secrets,
            remoteHealth,
            tokenPermissions,
            { showRequirements: jest.fn(), showReport: jest.fn() },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token', ref: 'main',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
            workflowTokenPermissions: [permission],
        });

        expect(prompt.chooseExistingCredential).not.toHaveBeenCalled();
        expect(prompt.requestWorkflowPat).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'PAT' }),
            expect.objectContaining({
                status: 'unverifiable',
                message: expect.stringContaining('re-enter the workflow PAT'),
            }),
        );
        expect(tokenPermissions.inspect).toHaveBeenCalledWith(expect.objectContaining({
            role: 'workflow', token: 'workflow-token', requirements: [permission],
        }));
        expect(result.collection.workflowPat).toEqual({ name: 'PAT', value: 'workflow-token' });
        expect(result.checks.filter(check => check.name === 'PAT')).toEqual([
            expect.objectContaining({ status: 'valid', account: 'workflow-bot' }),
        ]);
    });

    it('preserves invalid remote-health evidence while requesting a workflow PAT re-entry', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'replacement-token' }),
            requestApiKey: jest.fn(), chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const permission = {
            id: 'workflow.repository.metadata', role: 'workflow' as const, scope: 'repository' as const,
            permission: 'Metadata', level: 'read' as const, applicability: 'required' as const,
            reason: 'Resolve repository.', probe: 'metadata' as const,
        };
        const report = {
            role: 'workflow' as const, identityStatus: 'valid' as const, identityMessage: 'ok',
            ready: true, confirmationRequired: false,
            checks: [{ ...permission, status: 'verified' as const, message: 'available' }],
        };

        await new SetupCredentialsUseCase(
            prompt,
            {
                validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
                validateCredential: jest.fn(),
            },
            { list: jest.fn().mockResolvedValue(['PAT']) },
            { validateExisting: jest.fn().mockResolvedValue([{ name: 'PAT', status: 'invalid', message: 'Remote health failed.' }]) },
            { inspect: jest.fn().mockResolvedValue(report) },
            { showRequirements: jest.fn(), showReport: jest.fn() },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
            workflowTokenPermissions: [permission],
        });

        expect(prompt.requestWorkflowPat).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'PAT' }),
            expect.objectContaining({ status: 'invalid', message: expect.stringContaining('re-enter the workflow PAT') }),
        );
    });

    it('rejects an existing workflow PAT when non-interactive setup cannot re-enter it for audit', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue(undefined), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn(),
        };
        const permission = {
            id: 'workflow.repository.metadata', role: 'workflow' as const, scope: 'repository' as const,
            permission: 'Metadata', level: 'read' as const, applicability: 'required' as const,
            reason: 'Resolve repository.', probe: 'metadata' as const,
        };
        const tokenPermissions = { inspect: jest.fn() };

        await expect(new SetupCredentialsUseCase(
            prompt,
            validation,
            { list: jest.fn().mockResolvedValue(['PAT']) },
            { validateExisting: jest.fn().mockResolvedValue([{ name: 'PAT', status: 'valid', message: 'Remote health passed.' }]) },
            tokenPermissions,
            { showRequirements: jest.fn(), showReport: jest.fn() },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
            workflowTokenPermissions: [permission],
        })).rejects.toThrow('Existing PAT cannot be permission-audited');

        expect(prompt.chooseExistingCredential).not.toHaveBeenCalled();
        expect(tokenPermissions.inspect).not.toHaveBeenCalled();
    });

    it('fails closed when a workflow permission plan has no audit port', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn(), chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const permission = {
            id: 'workflow.repository.metadata', role: 'workflow' as const, scope: 'repository' as const,
            permission: 'Metadata', level: 'read' as const, applicability: 'required' as const,
            reason: 'Resolve repository.', probe: 'metadata' as const,
        };

        await expect(new SetupCredentialsUseCase(
            prompt,
            {
                validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
                validateCredential: jest.fn(),
            },
            { list: jest.fn().mockResolvedValue([]) },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
            workflowTokenPermissions: [permission],
        })).rejects.toThrow('Workflow PAT permission auditing is not available');
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
            repositorySecrets: [], repositorySecretsAccess: 'available' as const,
            organizationSecrets: ['PAT'], repositoryVariables: [], repositoryVariablesAccess: 'available' as const,
            organizationVariables: [],
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

    it('blocks credential decisions when repository Secret inventory is unavailable', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }), validateCredential: jest.fn() };
        const secrets = { list: jest.fn(), upsertSecrets: jest.fn() };
        const remoteConfiguration = {
            ownerType: 'User' as const, repositoryVisibility: 'private' as const,
            repositorySecrets: [], repositorySecretsAccess: 'unavailable' as const,
            organizationSecrets: [], repositoryVariables: [], repositoryVariablesAccess: 'available' as const,
            organizationVariables: [], organizationAccess: 'not_applicable' as const,
            organizationSecretsAccess: 'not_applicable' as const, organizationVariablesAccess: 'not_applicable' as const,
        };

        await expect(new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true, remoteConfiguration,
        })).rejects.toThrow('credential collection cannot safely preserve existing Secrets');

        expect(prompt.explainCredentialSeparation).not.toHaveBeenCalled();
        expect(prompt.requestWorkflowPat).not.toHaveBeenCalled();
        expect(secrets.list).not.toHaveBeenCalled();
    });

    it('uses organization inventory when selected Secrets do not depend on repository scope', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'replacement-token' }),
            requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn().mockResolvedValue('keep'), showCredentialChecks: jest.fn(),
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }), validateCredential: jest.fn() };
        const secrets = { list: jest.fn(), upsertSecrets: jest.fn() };
        const remoteHealth = { validateExisting: jest.fn().mockResolvedValue([{ name: 'PAT', status: 'valid', message: 'remote ok' }]) };
        const remoteConfiguration = {
            ownerType: 'Organization' as const, repositoryId: 42, repositoryVisibility: 'private' as const,
            repositorySecrets: [], repositorySecretsAccess: 'unavailable' as const,
            organizationSecrets: ['PAT'], repositoryVariables: [], repositoryVariablesAccess: 'available' as const,
            organizationVariables: [], organizationAccess: 'available' as const,
            organizationSecretsAccess: 'available' as const, organizationVariablesAccess: 'available' as const,
        };

        await expect(new SetupCredentialsUseCase(prompt, validation, secrets, remoteHealth).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true, remoteConfiguration,
            secretStoragePolicy: {
                defaultScope: 'organization', organizationVisibility: 'selected', preserveExisting: false, overrides: {},
            },
        })).resolves.toEqual(expect.objectContaining({
            collection: { workflowPat: { name: 'PAT', value: 'replacement-token' }, apiKeys: [] },
        }));

        expect(prompt.chooseExistingCredential).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'PAT' }),
            expect.objectContaining({ sourceScope: 'organization' }),
        );
        expect(prompt.requestWorkflowPat).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'PAT' }),
            expect.objectContaining({ sourceScope: 'organization' }),
        );
        expect(secrets.list).not.toHaveBeenCalled();
    });

    it('requires replacement when an explicit storage override moves an existing credential', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn(),
            requestApiKey: jest.fn().mockResolvedValue({ name: 'OPENAI_API_KEY', value: 'replacement-key' }),
            chooseExistingCredential: jest.fn().mockResolvedValue('keep'), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn().mockResolvedValue({ name: 'OPENAI_API_KEY', status: 'valid', message: 'replacement ok' }),
        };
        const remoteConfiguration = {
            ownerType: 'Organization' as const, repositoryId: 42, repositoryVisibility: 'private' as const,
            repositorySecrets: [], repositorySecretsAccess: 'available' as const,
            organizationSecrets: ['OPENAI_API_KEY'], repositoryVariables: [], repositoryVariablesAccess: 'available' as const,
            organizationVariables: [], organizationAccess: 'available' as const,
            organizationSecretsAccess: 'available' as const, organizationVariablesAccess: 'available' as const,
        };

        const result = await new SetupCredentialsUseCase(
            prompt,
            validation,
            { list: jest.fn() },
            { validateExisting: jest.fn().mockResolvedValue([
                { name: 'OPENAI_API_KEY', status: 'valid', message: 'remote ok' },
            ]) },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('OPENAI_API_KEY')], manageSecrets: true, remoteConfiguration,
            secretStoragePolicy: {
                defaultScope: 'organization', organizationVisibility: 'selected', preserveExisting: true,
                overrides: { OPENAI_API_KEY: 'repository' },
            },
        });

        expect(prompt.requestApiKey).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'OPENAI_API_KEY' }),
            expect.objectContaining({ sourceScope: 'organization' }),
        );
        expect(validation.validateCredential).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'OPENAI_API_KEY' }),
            'replacement-key',
        );
        expect(result.collection.apiKeys).toEqual([{ name: 'OPENAI_API_KEY', value: 'replacement-key' }]);
    });

    it('blocks preservation when organization Secret inventory is unavailable', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn(), requestApiKey: jest.fn(),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }), validateCredential: jest.fn() };
        const secrets = { list: jest.fn(), upsertSecrets: jest.fn() };
        const remoteConfiguration = {
            ownerType: 'Organization' as const, repositoryId: 42, repositoryVisibility: 'private' as const,
            repositorySecrets: [], repositorySecretsAccess: 'available' as const,
            organizationSecrets: [], repositoryVariables: [], repositoryVariablesAccess: 'available' as const,
            organizationVariables: [], organizationAccess: 'unavailable' as const,
            organizationSecretsAccess: 'unavailable' as const, organizationVariablesAccess: 'available' as const,
        };

        await expect(new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true, remoteConfiguration,
            secretStoragePolicy: {
                defaultScope: 'repository', organizationVisibility: 'selected', preserveExisting: true, overrides: {},
            },
        })).rejects.toThrow('Organization Secret inventory is unavailable');

        expect(prompt.explainCredentialSeparation).not.toHaveBeenCalled();
        expect(prompt.requestWorkflowPat).not.toHaveBeenCalled();
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
        const alternativeGroup = 'agent:opencode:openai';

        const result = await new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [
                { ...requirement('PAT', 'workflowPat'), alternativeGroups: undefined },
                { ...requirement('OPENCODE_API_KEY'), alternativeGroups: [alternativeGroup] },
                { ...requirement('OPENAI_API_KEY'), alternativeGroups: [alternativeGroup] },
            ],
            manageSecrets: true,
        });

        expect(result.collection.apiKeys).toEqual([{ name: 'OPENAI_API_KEY', value: 'api-key' }]);
        expect(validation.validateCredential).toHaveBeenCalledTimes(1);
    });

    it('allows a Codex credential group to rely on the target runner login', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn().mockResolvedValue(undefined),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn(),
        };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };
        const alternativeGroup = 'agent:codex:openai';

        const result = await new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [
                { ...requirement('PAT', 'workflowPat'), alternativeGroups: undefined },
                {
                    ...requirement('CODEX_API_KEY'),
                    alternativeGroups: [alternativeGroup],
                    runnerAuthenticationGroups: [alternativeGroup],
                },
            ],
            manageSecrets: true,
        });

        expect(result.collection.apiKeys).toEqual([]);
        expect(result.checks).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'CODEX_API_KEY', status: 'not_required' }),
        ]));
        expect(validation.validateCredential).not.toHaveBeenCalled();
    });

    it('still requires a separate unsatisfied OpenCode group when Codex can use runner login', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn().mockResolvedValue(undefined),
            chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
            validateCredential: jest.fn(),
        };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };
        const codexGroup = 'agent:codex:openai';
        const openCodeGroup = 'agent:opencode:openai';

        await expect(new SetupCredentialsUseCase(prompt, validation, secrets).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [
                { ...requirement('PAT', 'workflowPat'), alternativeGroups: undefined },
                {
                    ...requirement('CODEX_API_KEY'),
                    alternativeGroups: [codexGroup],
                    runnerAuthenticationGroups: [codexGroup],
                },
                {
                    ...requirement('OPENAI_API_KEY'),
                    alternativeGroups: [openCodeGroup],
                },
                { ...requirement('OPENCODE_API_KEY'), alternativeGroups: [openCodeGroup] },
            ],
            manageSecrets: true,
        })).rejects.toThrow('At least one of OPENAI_API_KEY or OPENCODE_API_KEY is required');
        expect(validation.validateCredential).not.toHaveBeenCalled();
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

    it('shows and audits workflow PAT permissions around new secret collection', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn(), chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'setup ok' }),
            validateCredential: jest.fn(),
        };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };
        const permission = {
            id: 'workflow.repository.metadata', role: 'workflow' as const, scope: 'repository' as const,
            permission: 'Metadata', level: 'read' as const, applicability: 'required' as const,
            reason: 'Resolve repository.', probe: 'metadata' as const,
        };
        const report = {
            role: 'workflow' as const, account: 'workflow-bot', identityStatus: 'valid' as const, identityMessage: 'ok', ready: true,
            confirmationRequired: false,
            checks: [{ ...permission, status: 'verified' as const, message: 'available' }],
        };
        const tokenPermissions = { inspect: jest.fn().mockResolvedValue(report) };
        const presenter = { showRequirements: jest.fn(), showReport: jest.fn() };

        const result = await new SetupCredentialsUseCase(
            prompt, validation, secrets, undefined, tokenPermissions, presenter,
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
            workflowTokenPermissions: [permission],
        });

        expect(presenter.showRequirements).toHaveBeenCalledWith('workflow', [permission]);
        expect(tokenPermissions.inspect).toHaveBeenCalledWith(expect.objectContaining({
            role: 'workflow', token: 'workflow-token', requirements: [permission],
        }));
        expect(presenter.showReport).toHaveBeenCalledWith(report);
        expect(result.checks).toContainEqual(expect.objectContaining({ name: 'PAT', account: 'workflow-bot' }));
        expect(result.collection.workflowPat).toEqual({ name: 'PAT', value: 'workflow-token' });
    });

    it('rejects a workflow PAT when the permission audit is not ready', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn(), chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'setup ok' }),
            validateCredential: jest.fn(),
        };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };
        const permission = {
            id: 'workflow.repository.metadata', role: 'workflow' as const, scope: 'repository' as const,
            permission: 'Metadata', level: 'read' as const, applicability: 'required' as const,
            reason: 'Resolve repository.', probe: 'metadata' as const,
        };
        const tokenPermissions = { inspect: jest.fn().mockResolvedValue({
            role: 'workflow', identityStatus: 'valid', identityMessage: 'ok', ready: false, confirmationRequired: false,
            checks: [{ ...permission, status: 'missing', message: 'denied' }],
        }) };

        await expect(new SetupCredentialsUseCase(
            prompt, validation, secrets, undefined, tokenPermissions, { showRequirements: jest.fn(), showReport: jest.fn() },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
            workflowTokenPermissions: [permission],
        })).rejects.toThrow('PAT validation failed');
    });

    it('accepts a workflow PAT only after explicit acknowledgement of unverifiable required writes', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn(), chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
            confirmUnverifiableTokenPermissions: jest.fn().mockResolvedValue(true),
        };
        const validation = {
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'setup ok' }),
            validateCredential: jest.fn(),
        };
        const secrets = { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() };
        const permission = {
            id: 'workflow.repository.contents', role: 'workflow' as const, scope: 'repository' as const,
            permission: 'Contents', level: 'write' as const, applicability: 'required' as const,
            reason: 'Manage branches.', probe: 'contents' as const,
        };
        const report = {
            role: 'workflow' as const, identityStatus: 'valid' as const, identityMessage: 'ok',
            ready: false, confirmationRequired: true,
            checks: [{ ...permission, status: 'unverifiable' as const, message: 'no safe write proof' }],
        };

        const result = await new SetupCredentialsUseCase(
            prompt,
            validation,
            secrets,
            undefined,
            { inspect: jest.fn().mockResolvedValue(report) },
            { showRequirements: jest.fn(), showReport: jest.fn() },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
            workflowTokenPermissions: [permission],
        });

        expect(prompt.confirmUnverifiableTokenPermissions).toHaveBeenCalledWith(report);
        expect(result.collection.workflowPat).toEqual({ name: 'PAT', value: 'workflow-token' });
        expect(result.checks).toContainEqual(expect.objectContaining({
            name: 'PAT',
            status: 'valid',
            message: expect.stringContaining('explicitly acknowledged'),
        }));
    });

    it('preserves legacy credential validation when no permission plan is supplied', async () => {
        const prompt = {
            requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(),
            requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'workflow-token' }),
            requestApiKey: jest.fn(), chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn(),
        };
        const validation = {
            validateSetupPat: jest.fn()
                .mockResolvedValueOnce({ name: 'SETUP_PAT', status: 'valid', message: 'setup ok' })
                .mockResolvedValueOnce({ name: 'SETUP_PAT', status: 'valid', message: 'workflow ok' }),
            validateCredential: jest.fn(),
        };
        const result = await new SetupCredentialsUseCase(
            prompt, validation, { list: jest.fn().mockResolvedValue([]) },
        ).collect({
            owner: 'owner', repository: 'repo', setupToken: 'setup-token',
            requirements: [requirement('PAT', 'workflowPat')], manageSecrets: true,
        });
        expect(validation.validateSetupPat).toHaveBeenCalledTimes(2);
        expect(result.collection.workflowPat).toBeDefined();
    });
});
