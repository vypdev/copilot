import type { AgentTask } from '../../domain/agent';
import {
    DEFAULT_AGENT_MODEL,
    DEFAULT_AGENT_PROVIDER,
    DEFAULT_MODEL_PROVIDER,
} from '../../domain/agent';
import type {
    SetupAgentConfiguration,
    SetupAgentRoleConfiguration,
    SetupConfiguration,
    SetupFeatures,
    SetupPlan,
    SetupVariable,
    SetupCredentialRequirement,
    SetupResourceScope,
    SetupResourceStoragePolicy,
    SetupStorageConfiguration,
    SetupRemoteConfiguration,
    SetupResourceTarget,
} from '../../domain/setup';
import { SUPPORTED_AGENT_PROVIDERS } from './agent_configuration_validation_policy';
import { normalizePullRequestDescriptionMode } from '../../domain/pull_request_description';

export const SETUP_AGENT_TASKS: readonly AgentTask[] = [
    'planner',
    'findings',
    'reviewer',
    'fixer',
    'tester',
    'release',
];

export const SETUP_FEATURE_DESCRIPTIONS: Readonly<Record<string, string>> = {
    issues: 'Issue automation: branching, labels, projects, and issue lifecycle',
    pullRequests: 'Pull request automation: review, descriptions, and lifecycle',
    commits: 'Commit automation: progress, sizing, and Bugbot analysis',
    issueComments: 'Issue comments: questions, translations, and Bugbot autofix',
    pullRequestComments: 'Pull request review comments: translations and Bugbot autofix',
    release: 'Release workflow: versioning, changelog, tag, and GitHub Release',
    hotfix: 'Hotfix workflow: emergency release from a production tag',
    agentProvisioning: 'Agent CLI provisioning check workflow',
    credentialHealth: 'Read-only remote credential health workflow for setup and doctor',
    issueTemplates: 'Issue templates for feature, bug, documentation, and operations',
    pullRequestTemplate: 'Pull request template',
};

const WORKFLOW_FILES: Readonly<Record<string, string[]>> = {
    issues: ['copilot_issue.yml'],
    pullRequests: ['copilot_pull_request.yml'],
    commits: ['copilot_commit.yml'],
    issueComments: ['copilot_issue_comment.yml'],
    pullRequestComments: ['copilot_pull_request_comment.yml'],
    release: ['release_workflow.yml'],
    hotfix: ['hotfix_workflow.yml'],
    agentProvisioning: ['agent-cli-provisioning.yml'],
    credentialHealth: ['copilot_credential_health.yml'],
};

const ISSUE_TEMPLATE_FILES = [
    'config.yml',
    'feature_request.yml',
    'bug_report.yml',
    'doc_update.yml',
    'chore_task.yml',
    'help_request.yml',
    'hotfix.yml',
    'release.yml',
];

const SECRET_BY_MODEL_PROVIDER: Readonly<Record<string, string>> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
};

const RESOURCE_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function defaultStoragePolicy(): SetupResourceStoragePolicy {
    return {
        defaultScope: 'repository',
        organizationVisibility: 'selected',
        preserveExisting: true,
        overrides: {},
    };
}

export function createDefaultSetupStorageConfiguration(): SetupStorageConfiguration {
    return {
        secrets: defaultStoragePolicy(),
        variables: defaultStoragePolicy(),
    };
}

export function createDefaultSetupConfiguration(): SetupConfiguration {
    const defaultRole = (): SetupAgentRoleConfiguration => ({
        provider: DEFAULT_AGENT_PROVIDER,
        modelProvider: DEFAULT_MODEL_PROVIDER,
        model: DEFAULT_AGENT_MODEL,
        effort: '',
    });
    const agents = Object.fromEntries(
        SETUP_AGENT_TASKS.map(task => [task, defaultRole()]),
    ) as SetupAgentConfiguration;
    const features: SetupFeatures = Object.fromEntries(
        Object.keys(SETUP_FEATURE_DESCRIPTIONS).map(feature => [feature, true]),
    );
    return {
        features,
        agents,
        repository: {
            mainBranch: 'master',
            developmentBranch: 'develop',
            featureTree: 'feature',
            bugfixTree: 'bugfix',
            hotfixTree: 'hotfix',
            releaseTree: 'release',
            docsTree: 'docs',
            choreTree: 'chore',
            branchManagementAlways: false,
            reopenIssueOnPush: true,
            desiredAssigneesCount: 1,
            desiredReviewersCount: 1,
            mergeTimeout: 600,
            issueLocale: 'en-US',
            pullRequestLocale: 'en-US',
            commitPrefixTransforms: 'replace-slash',
        },
        ai: {
            pullRequestDescription: true,
            pullRequestDescriptionMode: 'replace',
            ignoreFiles: 'build/*',
            membersOnly: false,
            includeReasoning: true,
            bugbotSeverity: 'low',
            bugbotCommentLimit: 20,
            bugbotFixVerifyCommands: '',
            provisioningMode: 'auto',
        },
        projects: {
            ids: '',
            issueCreatedColumn: 'Todo',
            pullRequestCreatedColumn: 'In Progress',
            issueInProgressColumn: 'In Progress',
            pullRequestInProgressColumn: 'In Progress',
        },
        createInitialTag: true,
        manageRepositoryVariables: true,
        manageRepositorySecrets: true,
        actionInputs: {},
        storage: createDefaultSetupStorageConfiguration(),
    };
}

export type SetupConfigurationOverrides = {
    features?: Partial<SetupFeatures>;
    agents?: Partial<Record<AgentTask, Partial<SetupAgentRoleConfiguration>>>;
    repository?: Partial<SetupConfiguration['repository']>;
    ai?: Partial<SetupConfiguration['ai']>;
    projects?: Partial<SetupConfiguration['projects']>;
    createInitialTag?: boolean;
    manageRepositoryVariables?: boolean;
    manageRepositorySecrets?: boolean;
    actionInputs?: Record<string, string>;
    storage?: {
        secrets?: Partial<SetupResourceStoragePolicy>;
        variables?: Partial<SetupResourceStoragePolicy>;
    };
};

export function mergeSetupConfiguration(
    base: SetupConfiguration,
    overrides: SetupConfigurationOverrides = {},
): SetupConfiguration {
    const agents = { ...base.agents } as SetupAgentConfiguration;
    for (const task of SETUP_AGENT_TASKS) {
        agents[task] = { ...base.agents[task], ...(overrides.agents?.[task] ?? {}) };
    }
    return {
        ...base,
        features: { ...base.features, ...(overrides.features ?? {}) } as SetupFeatures,
        agents,
        repository: { ...base.repository, ...(overrides.repository ?? {}) },
        ai: { ...base.ai, ...(overrides.ai ?? {}) },
        projects: { ...base.projects, ...(overrides.projects ?? {}) },
        createInitialTag: overrides.createInitialTag ?? base.createInitialTag,
        manageRepositoryVariables: overrides.manageRepositoryVariables ?? base.manageRepositoryVariables,
        manageRepositorySecrets: overrides.manageRepositorySecrets ?? base.manageRepositorySecrets,
        actionInputs: { ...base.actionInputs, ...(overrides.actionInputs ?? {}) },
        storage: {
            secrets: mergeStoragePolicy(base.storage?.secrets, overrides.storage?.secrets),
            variables: mergeStoragePolicy(base.storage?.variables, overrides.storage?.variables),
        },
    };
}

export function validateSetupConfiguration(configuration: SetupConfiguration): string[] {
    const errors: string[] = [];
    const nonEmpty = [
        ['main branch', configuration.repository.mainBranch],
        ['development branch', configuration.repository.developmentBranch],
        ['feature branch prefix', configuration.repository.featureTree],
        ['bugfix branch prefix', configuration.repository.bugfixTree],
        ['hotfix branch prefix', configuration.repository.hotfixTree],
        ['release branch prefix', configuration.repository.releaseTree],
        ['docs branch prefix', configuration.repository.docsTree],
        ['chore branch prefix', configuration.repository.choreTree],
    ] as const;
    for (const [name, value] of nonEmpty) {
        if (!value.trim() || /\s/.test(value)) errors.push(`The ${name} must be non-empty and contain no whitespace.`);
    }
    if (configuration.repository.desiredAssigneesCount < 0 || configuration.repository.desiredAssigneesCount > 10) {
        errors.push('Desired assignees must be between 0 and 10.');
    }
    if (configuration.repository.desiredReviewersCount < 0 || configuration.repository.desiredReviewersCount > 15) {
        errors.push('Desired reviewers must be between 0 and 15.');
    }
    if (configuration.repository.mergeTimeout < 0) errors.push('Merge timeout cannot be negative.');
    if (configuration.ai.bugbotCommentLimit < 1 || configuration.ai.bugbotCommentLimit > 100) {
        errors.push('Bugbot comment limit must be between 1 and 100.');
    }
    if (!['info', 'low', 'medium', 'high'].includes(configuration.ai.bugbotSeverity)) {
        errors.push('Bugbot severity must be info, low, medium, or high.');
    }
    if (configuration.ai.pullRequestDescriptionMode !== undefined
        && !['replace', 'append', 'preserve', 'disabled'].includes(configuration.ai.pullRequestDescriptionMode)) {
        errors.push('Pull-request description mode must be replace, append, preserve, or disabled.');
    }
    if (!['auto', 'always', 'disabled'].includes(configuration.ai.provisioningMode)) {
        errors.push('Agent provisioning must be auto, always, or disabled.');
    }
    errors.push(...validateStorageConfiguration(configuration.storage));
    for (const task of SETUP_AGENT_TASKS) {
        const agent = configuration.agents[task];
        if (!SUPPORTED_AGENT_PROVIDERS.includes(agent.provider)) errors.push(`Unsupported provider for ${task}: ${agent.provider}.`);
        if (!agent.modelProvider.trim() || !agent.model.trim()) errors.push(`Model provider and model are required for ${task}.`);
        if (/\s/.test(agent.model) || /\s/.test(agent.modelProvider)) errors.push(`Model provider and model for ${task} cannot contain whitespace.`);
    }
    return errors;
}

export function buildSetupPlan(configuration: SetupConfiguration): SetupPlan {
    const workflowFiles = Object.entries(WORKFLOW_FILES)
        .filter(([feature]) => configuration.features[feature] !== false)
        .flatMap(([, files]) => files);
    const issueTemplateFiles = configuration.features.issueTemplates === false
        ? []
        : ISSUE_TEMPLATE_FILES.filter(file => configuration.features.release !== false || file !== 'release.yml')
            .filter(file => configuration.features.hotfix !== false || file !== 'hotfix.yml');
    const selectedFiles = [
        ...workflowFiles.map(file => `workflows/${file}`),
        ...issueTemplateFiles.map(file => `ISSUE_TEMPLATE/${file}`),
        ...(configuration.features.pullRequestTemplate === false ? [] : ['pull_request_template.md']),
    ];
    return {
        configuration,
        workflowFiles,
        issueTemplateFiles,
        selectedFiles,
        variables: buildSetupRepositoryVariables(configuration),
        requiredSecrets: buildRequiredSetupSecrets(configuration),
        credentialRequirements: buildSetupCredentialRequirements(configuration),
        warnings: buildSetupWarnings(configuration),
    };
}

/** Builds the non-sensitive credential contract implied by the selected agents. */
export function buildSetupCredentialRequirements(configuration: SetupConfiguration): SetupCredentialRequirement[] {
    const requirements = new Map<string, SetupCredentialRequirement>();
    const add = (name: string, kind: SetupCredentialRequirement['kind'], description: string, provider?: string, model?: string) => {
        if (!requirements.has(name)) requirements.set(name, { name, kind, description, provider, model });
    };
    add('PAT', 'workflowPat', 'A separate GitHub token owned by the bot account. It is used by workflows at runtime.');
    for (const task of SETUP_AGENT_TASKS) {
        const agent = configuration.agents[task];
        if (agent.provider === 'cursor') {
            add('CURSOR_API_KEY', 'apiKey', 'Cursor API key used by the Cursor agent runtime.', 'cursor', agent.model);
            continue;
        }
        if (agent.provider === 'opencode') add('OPENCODE_API_KEY', 'apiKey', 'OpenCode API key used by the OpenCode agent runtime.', 'opencode', agent.model);
        if (agent.provider === 'codex') add('CODEX_ACCESS_TOKEN', 'apiKey', 'Codex access token used by the Codex agent runtime.', 'codex', agent.model);
        const modelProvider = agent.modelProvider.trim().toLowerCase();
        if (modelProvider && !['local', 'ollama', 'lmstudio'].includes(modelProvider)) {
            const name = SECRET_BY_MODEL_PROVIDER[modelProvider] ?? `${modelProvider.replace(/-/g, '_').toUpperCase()}_API_KEY`;
            add(name, 'apiKey', `${modelProvider} API key for ${agent.model}.`, modelProvider, agent.model);
        }
    }
    return [...requirements.values()];
}

export function buildSetupRepositoryVariables(configuration: SetupConfiguration): SetupVariable[] {
    const variables: SetupVariable[] = [];
    const add = (name: string, value: string | number | boolean | undefined) => {
        if (value === undefined || value === '') return;
        variables.push({ name, value: String(value) });
    };
    const base = configuration.agents.findings;
    add('AGENT_PROVIDER', base.provider);
    add('AGENT_MODEL_PROVIDER', base.modelProvider);
    add('AGENT_MODEL', base.model);
    add('AGENT_EFFORT', base.effort);
    add('AGENT_PROVISIONING', configuration.ai.provisioningMode);
    add('AGENT_ALLOWED_MODEL_PROVIDERS', unique(SETUP_AGENT_TASKS.map(task => configuration.agents[task].modelProvider)).join(','));
    add('AGENT_ALLOWED_MODELS', unique(SETUP_AGENT_TASKS.map(task => `${configuration.agents[task].modelProvider}/${configuration.agents[task].model}`)).join(','));

    for (const task of SETUP_AGENT_TASKS) {
        const prefix = task.toUpperCase();
        const agent = configuration.agents[task];
        add(`${prefix}_PROVIDER`, agent.provider);
        add(`${prefix}_MODEL_PROVIDER`, agent.modelProvider);
        add(`${prefix}_MODEL`, agent.model);
        add(`${prefix}_EFFORT`, agent.effort);
    }

    const repository = configuration.repository;
    add('MAIN_BRANCH', repository.mainBranch);
    add('DEVELOPMENT_BRANCH', repository.developmentBranch);
    add('FEATURE_TREE', repository.featureTree);
    add('BUGFIX_TREE', repository.bugfixTree);
    add('HOTFIX_TREE', repository.hotfixTree);
    add('RELEASE_TREE', repository.releaseTree);
    add('DOCS_TREE', repository.docsTree);
    add('CHORE_TREE', repository.choreTree);
    add('BRANCH_MANAGEMENT_ALWAYS', repository.branchManagementAlways);
    add('REOPEN_ISSUE_ON_PUSH', repository.reopenIssueOnPush);
    add('DESIRED_ASSIGNEES_COUNT', repository.desiredAssigneesCount);
    add('DESIRED_REVIEWERS_COUNT', repository.desiredReviewersCount);
    add('MERGE_TIMEOUT', repository.mergeTimeout);
    add('ISSUES_LOCALE', repository.issueLocale);
    add('PULL_REQUESTS_LOCALE', repository.pullRequestLocale);
    add('COMMIT_PREFIX_TRANSFORMS', repository.commitPrefixTransforms);

    add('AI_PULL_REQUEST_DESCRIPTION', configuration.ai.pullRequestDescription);
    add('AI_PULL_REQUEST_DESCRIPTION_MODE', configuration.ai.pullRequestDescriptionMode);
    add('AI_IGNORE_FILES', configuration.ai.ignoreFiles);
    add('AI_MEMBERS_ONLY', configuration.ai.membersOnly);
    add('AI_INCLUDE_REASONING', configuration.ai.includeReasoning);
    add('BUGBOT_SEVERITY', configuration.ai.bugbotSeverity);
    add('BUGBOT_COMMENT_LIMIT', configuration.ai.bugbotCommentLimit);
    add('BUGBOT_AUTOFIX_VERIFY_COMMANDS', configuration.ai.bugbotFixVerifyCommands);

    add('PROJECT_IDS', configuration.projects.ids);
    add('PROJECT_COLUMN_ISSUE_CREATED', configuration.projects.issueCreatedColumn);
    add('PROJECT_COLUMN_PULL_REQUEST_CREATED', configuration.projects.pullRequestCreatedColumn);
    add('PROJECT_COLUMN_ISSUE_IN_PROGRESS', configuration.projects.issueInProgressColumn);
    add('PROJECT_COLUMN_PULL_REQUEST_IN_PROGRESS', configuration.projects.pullRequestInProgressColumn);
    return variables;
}

export function buildSetupActionInputs(configuration: SetupConfiguration): Record<string, string> {
    const repository = configuration.repository;
    const ai = configuration.ai;
    const projects = configuration.projects;
    return {
        'main-branch': repository.mainBranch,
        'development-branch': repository.developmentBranch,
        'feature-tree': repository.featureTree,
        'bugfix-tree': repository.bugfixTree,
        'hotfix-tree': repository.hotfixTree,
        'release-tree': repository.releaseTree,
        'docs-tree': repository.docsTree,
        'chore-tree': repository.choreTree,
        'branch-management-always': String(repository.branchManagementAlways),
        'reopen-issue-on-push': String(repository.reopenIssueOnPush),
        'desired-assignees-count': String(repository.desiredAssigneesCount),
        'desired-reviewers-count': String(repository.desiredReviewersCount),
        'merge-timeout': String(repository.mergeTimeout),
        'issues-locale': repository.issueLocale,
        'pull-requests-locale': repository.pullRequestLocale,
        'commit-prefix-transforms': repository.commitPrefixTransforms,
        'ai-pull-request-description': String(ai.pullRequestDescription),
        'ai-pull-request-description-mode': normalizePullRequestDescriptionMode(ai.pullRequestDescriptionMode),
        'ai-ignore-files': ai.ignoreFiles,
        'ai-members-only': String(ai.membersOnly),
        'ai-include-reasoning': String(ai.includeReasoning),
        'bugbot-severity': ai.bugbotSeverity,
        'bugbot-comment-limit': String(ai.bugbotCommentLimit),
        'bugbot-fix-verify-commands': ai.bugbotFixVerifyCommands,
        'project-ids': projects.ids,
        'project-column-issue-created': projects.issueCreatedColumn,
        'project-column-pull-request-created': projects.pullRequestCreatedColumn,
        'project-column-issue-in-progress': projects.issueInProgressColumn,
        'project-column-pull-request-in-progress': projects.pullRequestInProgressColumn,
        ...buildAgentActionInputs(configuration),
        ...configuration.actionInputs,
    };
}

function buildAgentActionInputs(configuration: SetupConfiguration): Record<string, string> {
    const result: Record<string, string> = {};
    const base = configuration.agents.findings;
    const add = (key: string, value: string | undefined) => { if (value !== undefined) result[key] = value; };
    add('agent-provider', base.provider);
    add('agent-model-provider', base.modelProvider);
    add('agent-model', base.model);
    add('agent-effort', base.effort);
    for (const task of SETUP_AGENT_TASKS) {
        const agent = configuration.agents[task];
        const prefix = `${task}-`;
        add(`${prefix}provider`, agent.provider);
        add(`${prefix}model-provider`, agent.modelProvider);
        add(`${prefix}model`, agent.model);
        add(`${prefix}effort`, agent.effort);
    }
    return result;
}

function buildRequiredSetupSecrets(configuration: SetupConfiguration): string[] {
    return buildSetupCredentialRequirements(configuration).map(requirement => requirement.name);
}

function buildSetupWarnings(configuration: SetupConfiguration): string[] {
    const warnings: string[] = [];
    if (configuration.features.release !== false && configuration.features.hotfix !== false) {
        warnings.push('Release and hotfix workflows require the workflow PAT Secret and a writable token.');
    }
    if (configuration.ai.provisioningMode === 'always') {
        warnings.push('Always-provision mode requires pinned CLI versions or a Cursor installer checksum in repository Variables.');
    }
    if (configuration.projects.ids.trim()) {
        warnings.push('Project IDs must be accessible to the PAT and use the expected project column names.');
    }
    if (SETUP_AGENT_TASKS.some(task => configuration.agents[task].provider === 'cursor')) {
        warnings.push('Cursor is an experimental runtime in Copilot and requires a verified installer checksum plus CURSOR_API_KEY.');
    }
    if (usesOrganizationStorage(configuration)) {
        warnings.push('Organization-level Secrets and Variables require organization permissions; selected access is the safest default and repository values take precedence.');
    }
    return warnings;
}

export function resolveSetupResourceScope(
    policy: SetupResourceStoragePolicy,
    name: string,
): SetupResourceScope {
    return policy.overrides[name] ?? policy.defaultScope;
}

export type SetupResourceKind = 'secret' | 'variable';

export function getSetupResourceStoragePolicy(
    configuration: SetupConfiguration,
    kind: SetupResourceKind,
): SetupResourceStoragePolicy {
    return getSetupStorageConfiguration(configuration)[kind === 'secret' ? 'secrets' : 'variables'];
}

export function getSetupStorageConfiguration(configuration: Pick<SetupConfiguration, 'storage'>): SetupStorageConfiguration {
    const fallback = createDefaultSetupStorageConfiguration();
    return {
        secrets: mergeStoragePolicy(fallback.secrets, configuration.storage?.secrets),
        variables: mergeStoragePolicy(fallback.variables, configuration.storage?.variables),
    };
}

export function resolveSetupResourceTarget(
    configuration: SetupConfiguration,
    kind: SetupResourceKind,
    name: string,
    remote?: SetupRemoteConfiguration,
): SetupResourceTarget {
    const policy = getSetupResourceStoragePolicy(configuration, kind);
    const explicitOverride = Object.prototype.hasOwnProperty.call(policy.overrides, name);
    const existingScope = setupResourceExists(remote, kind, name).effective;
    const scope = existingScope && policy.preserveExisting && !explicitOverride
        ? existingScope
        : resolveSetupResourceScope(policy, name);
    return {
        scope,
        organizationVisibility: policy.organizationVisibility,
        repositoryId: remote?.repositoryId,
    };
}

export function setupResourceExists(
    remote: SetupRemoteConfiguration | undefined,
    kind: SetupResourceKind,
    name: string,
): { repository: boolean; organization: boolean; effective?: SetupResourceScope } {
    if (!remote) return { repository: false, organization: false };
    const repository = kind === 'secret'
        ? remote.repositorySecrets.includes(name)
        : remote.repositoryVariables.some(variable => variable.name === name);
    const organizationAccess = kind === 'secret'
        ? (remote.organizationSecretsAccess ?? remote.organizationAccess)
        : (remote.organizationVariablesAccess ?? remote.organizationAccess);
    const organization = organizationAccess === 'available' && (kind === 'secret'
        ? remote.organizationSecrets.includes(name)
        : remote.organizationVariables.some(variable => variable.name === name));
    return {
        repository,
        organization,
        effective: repository ? 'repository' : organization ? 'organization' : undefined,
    };
}

export function shouldUpsertSetupResource(
    configuration: SetupConfiguration,
    kind: SetupResourceKind,
    name: string,
    remote?: SetupRemoteConfiguration,
): boolean {
    const policy = getSetupResourceStoragePolicy(configuration, kind);
    const state = setupResourceExists(remote, kind, name);
    if (!state.effective) return true;
    const requested = resolveSetupResourceScope(policy, name);
    const explicitOverride = Object.prototype.hasOwnProperty.call(policy.overrides, name);
    return requested === state.effective || explicitOverride || !policy.preserveExisting;
}

export function validateSetupStorageAgainstRemote(
    configuration: SetupConfiguration,
    remote: SetupRemoteConfiguration,
): string[] {
    const errors: string[] = [];
    const policies: Array<[SetupResourceKind, SetupResourceStoragePolicy, boolean]> = [
        ['secret', getSetupResourceStoragePolicy(configuration, 'secret'), configuration.manageRepositorySecrets],
        ['variable', getSetupResourceStoragePolicy(configuration, 'variable'), configuration.manageRepositoryVariables],
    ];
    for (const [kind, policy, managed] of policies) {
        if (!managed) continue;
        const needsOrganization = policy.defaultScope === 'organization'
            || Object.values(policy.overrides).includes('organization');
        if (!needsOrganization) continue;
        if (remote.ownerType !== 'Organization') {
            errors.push(`Organization-level ${kind} storage is only available for organization-owned repositories.`);
            continue;
        }
        const access = kind === 'secret' ? remote.organizationSecretsAccess : remote.organizationVariablesAccess;
        if (access !== 'available') {
            errors.push(`The setup PAT cannot inspect organization ${kind}s for this repository. Organization ${kind} permissions are required.`);
        }
        if (policy.organizationVisibility === 'selected' && remote.repositoryId === undefined) {
            errors.push(`The repository ID is required for selected organization ${kind} access.`);
        }
    }
    return errors;
}

export function usesOrganizationStorage(configuration: SetupConfiguration): boolean {
    const storage = getSetupStorageConfiguration(configuration);
    return [storage.secrets, storage.variables].some(policy =>
        policy.defaultScope === 'organization' || Object.values(policy.overrides).includes('organization'),
    );
}

function mergeStoragePolicy(
    base: SetupResourceStoragePolicy | undefined,
    override: Partial<SetupResourceStoragePolicy> | undefined,
): SetupResourceStoragePolicy {
    const fallback = base ?? defaultStoragePolicy();
    return {
        ...fallback,
        ...(override ?? {}),
        overrides: { ...fallback.overrides, ...(override?.overrides ?? {}) },
    };
}

function validateStorageConfiguration(storage: SetupStorageConfiguration | undefined): string[] {
    // Setup files created before scoped storage was introduced remain valid and
    // receive the repository-level defaults through getSetupStorageConfiguration.
    if (!storage) return [];
    const errors: string[] = [];
    for (const [kind, policy] of Object.entries(storage)) {
        if (!policy || !['repository', 'organization'].includes(policy.defaultScope)) {
            errors.push(`${kind} default scope must be repository or organization.`);
            continue;
        }
        if (!['all', 'private', 'selected'].includes(policy.organizationVisibility)) {
            errors.push(`${kind} organization visibility must be all, private, or selected.`);
        }
        if (typeof policy.preserveExisting !== 'boolean') errors.push(`${kind} preserveExisting must be a boolean.`);
        for (const [name, scope] of Object.entries(policy.overrides ?? {}) as [string, SetupResourceScope][]) {
            if (!RESOURCE_NAME_PATTERN.test(name)) errors.push(`${kind} override name ${name} must be an uppercase GitHub Actions name.`);
            if (!['repository', 'organization'].includes(scope)) errors.push(`${kind} override ${name} must use repository or organization.`);
        }
    }
    return errors;
}

function unique(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
