import {
    buildSetupActionInputs,
    buildSetupCredentialRequirements,
    buildSetupPlan,
    buildSetupRepositoryVariables,
    createDefaultSetupConfiguration,
    mergeSetupConfiguration,
    resolveSetupResourceTarget,
    shouldUpsertSetupResource,
    validateSetupStorageAgainstRemote,
    validateSetupConfiguration,
} from '../setup_configuration_policy';
import type { SetupConfigurationOverrides } from '../setup_configuration_policy';

describe('setup configuration policy', () => {
    it('builds a complete safe default plan', () => {
        const configuration = createDefaultSetupConfiguration();
        const plan = buildSetupPlan(configuration);

        expect(plan.workflowFiles).toHaveLength(9);
        expect(plan.issueTemplateFiles).toHaveLength(8);
        expect(plan.selectedFiles).toHaveLength(18);
        expect(plan.variables).toEqual(expect.arrayContaining([
            { name: 'AGENT_PROVIDER', value: 'codex' },
            { name: 'AGENT_ALLOWED_MODELS', value: 'openai/gpt-5.6-luna' },
            { name: 'MAIN_BRANCH', value: 'master' },
            { name: 'AI_IGNORE_FILES', value: 'build/*' },
        ]));
        expect(plan.requiredSecrets).toEqual(expect.arrayContaining(['PAT', 'CODEX_ACCESS_TOKEN', 'OPENAI_API_KEY']));
        expect(plan.warnings.length).toBeGreaterThan(0);
    });

    it('removes optional files while retaining core setup resources', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            features: {
                release: false,
                hotfix: false,
                agentProvisioning: false,
                issueTemplates: false,
                pullRequestTemplate: false,
            },
        });
        const plan = buildSetupPlan(configuration);

        expect(plan.workflowFiles).toEqual(expect.arrayContaining([
            'copilot_issue.yml',
            'copilot_pull_request.yml',
            'copilot_commit.yml',
        ]));
        expect(plan.workflowFiles).not.toContain('release_workflow.yml');
        expect(plan.selectedFiles).toHaveLength(6);
    });

    it('keeps inactivity closure opt-in and wires its threshold when enabled', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            features: { inactiveIssueClosure: true },
            repository: { inactivityThresholdHours: 72 },
        });
        const plan = buildSetupPlan(configuration);

        expect(plan.workflowFiles).toContain('copilot_close_inactive_issues.yml');
        expect(buildSetupRepositoryVariables(configuration)).toEqual(expect.arrayContaining([
            { name: 'INACTIVITY_THRESHOLD_HOURS', value: '72' },
        ]));
        expect(buildSetupActionInputs(configuration)['inactivity-threshold-hours']).toBe('72');
        expect(plan.warnings).toEqual(expect.arrayContaining([
            expect.stringContaining('Inactive issue closure is enabled'),
        ]));
    });

    it('supports independent agent runtime and model settings for every task', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            agents: {
                planner: { provider: 'cursor', modelProvider: 'openai', model: 'gpt-5.6-luna' },
                reviewer: { provider: 'opencode', modelProvider: 'anthropic', model: 'claude-3-7-sonnet', effort: 'high' },
            },
        });
        const variables = buildSetupRepositoryVariables(configuration);

        expect(variables).toEqual(expect.arrayContaining([
            { name: 'PLANNER_PROVIDER', value: 'cursor' },
            { name: 'REVIEWER_PROVIDER', value: 'opencode' },
            { name: 'REVIEWER_MODEL_PROVIDER', value: 'anthropic' },
            { name: 'AGENT_ALLOWED_MODEL_PROVIDERS', value: 'openai,anthropic' },
        ]));
        expect(buildSetupActionInputs(configuration)).toMatchObject({
            'planner-provider': 'cursor',
            'reviewer-model': 'claude-3-7-sonnet',
            'ai-pull-request-description-mode': 'replace',
        });
        expect(buildSetupPlan(configuration).warnings).toEqual(expect.arrayContaining([
            expect.stringContaining('Cursor is an experimental runtime'),
        ]));
    });

    it('derives runtime credentials without asking Cursor for an unused model-provider key', () => {
        const opencode = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            agents: Object.fromEntries(['planner', 'findings', 'reviewer', 'fixer', 'tester', 'release'].map(task => [task, {
                provider: 'opencode', modelProvider: 'openai', model: 'gpt-5.6-luna',
        }])) as SetupConfigurationOverrides['agents'],
        });
        expect(buildSetupCredentialRequirements(opencode).map(requirement => requirement.name)).toEqual([
            'PAT', 'OPENCODE_API_KEY', 'OPENAI_API_KEY',
        ]);

        const cursor = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            agents: Object.fromEntries(['planner', 'findings', 'reviewer', 'fixer', 'tester', 'release'].map(task => [task, {
                provider: 'cursor', modelProvider: 'openai', model: 'composer-1',
        }])) as SetupConfigurationOverrides['agents'],
        });
        expect(buildSetupCredentialRequirements(cursor).map(requirement => requirement.name)).toEqual(['PAT', 'CURSOR_API_KEY']);
    });

    it('does not request credentials for agent roles whose workflows are disabled', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            features: {
                issues: false,
                pullRequests: false,
                commits: false,
                issueComments: false,
                pullRequestComments: false,
                release: false,
                hotfix: false,
            },
        });

        expect(buildSetupCredentialRequirements(configuration).map(requirement => requirement.name)).toEqual(['PAT']);
    });

    it('models runtime and model-provider credentials as alternatives', () => {
        const requirements = buildSetupCredentialRequirements(createDefaultSetupConfiguration());
        const runtime = requirements.find(requirement => requirement.name === 'CODEX_ACCESS_TOKEN');
        const modelProvider = requirements.find(requirement => requirement.name === 'OPENAI_API_KEY');

        expect(runtime?.alternativeGroups).toEqual(expect.arrayContaining(['agent:codex:openai']));
        expect(modelProvider?.alternativeGroups).toEqual(expect.arrayContaining(['agent:codex:openai']));
    });

    it('marks custom provider credentials as intentionally unverifiable', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            agents: {
                findings: { provider: 'opencode', modelProvider: 'my-company', model: 'internal-model' },
            },
        });

        expect(buildSetupCredentialRequirements(configuration).find(requirement => requirement.name === 'MY_COMPANY_API_KEY')).toMatchObject({
            validation: 'unverifiable',
        });
    });

    it('rejects invalid operational and agent values', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.repository.desiredReviewersCount = 16;
        configuration.repository.inactivityThresholdHours = 0;
        configuration.repository.mainBranch = 'main branch';
        configuration.ai.bugbotCommentLimit = 0;
        configuration.agents.planner.model = 'unsafe model';

        expect(validateSetupConfiguration(configuration)).toEqual(expect.arrayContaining([
            'Desired reviewers must be between 0 and 15.',
            'The main branch must be non-empty and contain no whitespace.',
            'Bugbot comment limit must be between 1 and 100.',
            'Inactivity threshold must be between 1 and 8760 hours.',
            'Model provider and model for planner cannot contain whitespace.',
        ]));
    });

    it('validates and persists the PR description policy', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            ai: { pullRequestDescriptionMode: 'append' },
        });

        expect(validateSetupConfiguration(configuration)).toEqual([]);
        expect(buildSetupRepositoryVariables(configuration)).toEqual(expect.arrayContaining([
            { name: 'AI_PULL_REQUEST_DESCRIPTION_MODE', value: 'append' },
        ]));
        expect(buildSetupActionInputs(configuration)['ai-pull-request-description-mode']).toBe('append');
    });

    it('keeps independent repository/organization storage policies and mixed overrides', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            storage: {
                secrets: { defaultScope: 'organization', organizationVisibility: 'private' },
                variables: { overrides: { AGENT_PROVIDER: 'repository' } },
            },
        });
        const remote = {
            ownerType: 'Organization' as const,
            repositoryId: 42,
            repositoryVisibility: 'private' as const,
            repositorySecrets: [],
            organizationSecrets: ['PAT'],
            repositoryVariables: [],
            organizationVariables: [{ name: 'AGENT_PROVIDER', value: 'codex' }],
            organizationAccess: 'available' as const,
            organizationSecretsAccess: 'available' as const,
            organizationVariablesAccess: 'available' as const,
        };

        expect(resolveSetupResourceTarget(configuration, 'secret', 'PAT', remote)).toEqual({
            scope: 'organization', organizationVisibility: 'private', repositoryId: 42,
        });
        expect(resolveSetupResourceTarget(configuration, 'variable', 'AGENT_PROVIDER', remote).scope).toBe('repository');
        expect(shouldUpsertSetupResource(configuration, 'secret', 'PAT', remote)).toBe(true);
        expect(shouldUpsertSetupResource(configuration, 'variable', 'AGENT_PROVIDER', remote)).toBe(true);
        expect(validateSetupStorageAgainstRemote(configuration, remote)).toEqual([]);
    });

    it('preserves an inherited organization resource unless an override is explicit', () => {
        const configuration = createDefaultSetupConfiguration();
        const remote = {
            ownerType: 'Organization' as const,
            repositoryId: 42,
            repositoryVisibility: 'private' as const,
            repositorySecrets: [],
            organizationSecrets: [],
            repositoryVariables: [],
            organizationVariables: [{ name: 'AGENT_PROVIDER', value: 'codex' }],
            organizationAccess: 'available' as const,
            organizationSecretsAccess: 'available' as const,
            organizationVariablesAccess: 'available' as const,
        };

        expect(shouldUpsertSetupResource(configuration, 'variable', 'AGENT_PROVIDER', remote)).toBe(false);
        const override = mergeSetupConfiguration(configuration, { storage: { variables: { overrides: { AGENT_PROVIDER: 'repository' } } } });
        expect(shouldUpsertSetupResource(override, 'variable', 'AGENT_PROVIDER', remote)).toBe(true);
    });

    it('keeps replacement credentials on the effective repository scope unless scope is explicitly overridden', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            storage: { secrets: { defaultScope: 'organization' } },
        });
        const remote = {
            ownerType: 'Organization' as const,
            repositoryId: 42,
            repositoryVisibility: 'private' as const,
            repositorySecrets: ['PAT'], organizationSecrets: [], repositoryVariables: [], organizationVariables: [],
            organizationAccess: 'available' as const, organizationSecretsAccess: 'available' as const,
            organizationVariablesAccess: 'available' as const,
        };

        expect(resolveSetupResourceTarget(configuration, 'secret', 'PAT', remote).scope).toBe('repository');
        const explicit = mergeSetupConfiguration(configuration, { storage: { secrets: { overrides: { PAT: 'organization' } } } });
        expect(resolveSetupResourceTarget(explicit, 'secret', 'PAT', remote).scope).toBe('organization');
    });

    it('rejects organization storage for personal repositories or unavailable organization permissions', () => {
        const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            storage: { variables: { defaultScope: 'organization' } },
        });
        const personalRemote = {
            ownerType: 'User' as const,
            repositoryId: 42,
            repositoryVisibility: 'private' as const,
            repositorySecrets: [], organizationSecrets: [], repositoryVariables: [], organizationVariables: [],
            organizationAccess: 'not_applicable' as const,
            organizationSecretsAccess: 'not_applicable' as const,
            organizationVariablesAccess: 'not_applicable' as const,
        };
        expect(validateSetupStorageAgainstRemote(configuration, personalRemote)).toEqual([
            'Organization-level variable storage is only available for organization-owned repositories.',
        ]);

        const unavailableRemote = { ...personalRemote, ownerType: 'Organization' as const, organizationVariablesAccess: 'unavailable' as const };
        expect(validateSetupStorageAgainstRemote(configuration, unavailableRemote)).toEqual([
            'The setup PAT cannot inspect organization variables for this repository. Organization variable permissions are required.',
        ]);
    });

    it('validates storage policy values and selected access requirements', () => {
        const invalid = createDefaultSetupConfiguration() as any;
        invalid.storage.secrets.defaultScope = 'tenant';
        invalid.storage.variables.organizationVisibility = 'team';
        invalid.storage.variables.preserveExisting = 'yes';
        invalid.storage.variables.overrides = { 'bad-name': 'tenant' };

        expect(validateSetupConfiguration(invalid)).toEqual(expect.arrayContaining([
            'secrets default scope must be repository or organization.',
            'variables organization visibility must be all, private, or selected.',
            'variables preserveExisting must be a boolean.',
            'variables override name bad-name must be an uppercase GitHub Actions name.',
            'variables override bad-name must use repository or organization.',
        ]));

        const selected = mergeSetupConfiguration(createDefaultSetupConfiguration(), {
            storage: { variables: { defaultScope: 'organization', organizationVisibility: 'selected' } },
        });
        const remote = {
            ownerType: 'Organization' as const, repositoryVisibility: 'private' as const,
            repositorySecrets: [], organizationSecrets: [], repositoryVariables: [], organizationVariables: [],
            organizationAccess: 'available' as const, organizationSecretsAccess: 'available' as const,
            organizationVariablesAccess: 'available' as const,
        };
        expect(validateSetupStorageAgainstRemote(selected, remote)).toEqual([
            'The repository ID is required for selected organization variable access.',
        ]);
    });

    it('adds warnings for organization storage, projects, and always-provision mode', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.features.release = false;
        configuration.features.hotfix = false;
        configuration.projects.ids = 'PVT_example';
        configuration.ai.provisioningMode = 'always';
        configuration.storage.variables.defaultScope = 'organization';

        expect(buildSetupPlan(configuration).warnings).toEqual(expect.arrayContaining([
            expect.stringContaining('Project IDs'),
            expect.stringContaining('Always-provision'),
            expect.stringContaining('Organization-level'),
        ]));
    });
});
