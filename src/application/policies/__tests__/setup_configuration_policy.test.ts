import {
    buildSetupActionInputs,
    buildSetupCredentialRequirements,
    buildSetupPlan,
    buildSetupRepositoryVariables,
    createDefaultSetupConfiguration,
    mergeSetupConfiguration,
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

    it('rejects invalid operational and agent values', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.repository.desiredReviewersCount = 16;
        configuration.repository.mainBranch = 'main branch';
        configuration.ai.bugbotCommentLimit = 0;
        configuration.agents.planner.model = 'unsafe model';

        expect(validateSetupConfiguration(configuration)).toEqual(expect.arrayContaining([
            'Desired reviewers must be between 0 and 15.',
            'The main branch must be non-empty and contain no whitespace.',
            'Bugbot comment limit must be between 1 and 100.',
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
});
