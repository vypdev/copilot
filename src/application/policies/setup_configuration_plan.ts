import { normalizePullRequestDescriptionMode } from '../../domain/pull_request_description';
import type {
    SetupConfiguration,
    SetupCredentialRequirement,
    SetupPlan,
    SetupVariable,
} from '../../domain/setup';
import { SETUP_AGENT_TASKS } from './setup_configuration_defaults';
import { usesOrganizationStorage } from './setup_configuration_storage_policy';

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
    inactiveIssueClosure: ['copilot_close_inactive_issues.yml'],
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
    const credentialRequirements = buildSetupCredentialRequirements(configuration);
    return {
        configuration,
        workflowFiles,
        issueTemplateFiles,
        selectedFiles,
        variables: buildSetupRepositoryVariables(configuration),
        requiredSecrets: credentialRequirements.map(requirement => requirement.name),
        credentialRequirements,
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
    if (configuration.features.inactiveIssueClosure !== false) {
        add('INACTIVITY_THRESHOLD_HOURS', repository.inactivityThresholdHours);
    }
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
        'inactivity-threshold-hours': String(repository.inactivityThresholdHours),
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

function buildSetupWarnings(configuration: SetupConfiguration): string[] {
    const warnings: string[] = [];
    if (configuration.features.release !== false && configuration.features.hotfix !== false) {
        warnings.push('Release and hotfix workflows require the workflow PAT Secret and a writable token.');
    }
    if (configuration.ai.provisioningMode === 'always') {
        warnings.push('Always-provision mode requires pinned CLI versions or a Cursor installer checksum in repository Variables.');
    }
    if (configuration.features.inactiveIssueClosure !== false) {
        warnings.push('Inactive issue closure is enabled; waiting issues are closed after the configured inactivity threshold and can be reopened with a new comment.');
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

function unique(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
