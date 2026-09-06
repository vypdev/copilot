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
    SetupResourceStoragePolicy,
    SetupStorageConfiguration,
} from '../../domain/setup';
import { DEFAULT_INACTIVITY_THRESHOLD_HOURS } from '../../domain/issue_inactivity';

export const SETUP_AGENT_TASKS: readonly AgentTask[] = [
    'planner',
    'findings',
    'reviewer',
    'fixer',
    'tester',
    'release',
];

/** Features that can invoke each agent role at runtime. */
export const SETUP_AGENT_TASK_FEATURES: Readonly<Record<AgentTask, readonly string[]>> = {
    planner: ['issues', 'pullRequests', 'issueComments', 'pullRequestComments'],
    findings: ['commits', 'issueComments', 'pullRequestComments'],
    reviewer: ['pullRequests', 'pullRequestComments'],
    fixer: ['issueComments', 'pullRequestComments'],
    tester: ['issueComments', 'pullRequestComments'],
    release: ['release', 'hotfix'],
};

export function setupAgentTasksForFeatures(configuration: Pick<SetupConfiguration, 'features'>): AgentTask[] {
    return SETUP_AGENT_TASKS.filter(task =>
        SETUP_AGENT_TASK_FEATURES[task].some(feature => configuration.features[feature] !== false),
    );
}

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
    inactiveIssueClosure: 'Close issues after inactivity while waiting for an issuer or issue author',
    issueTemplates: 'Issue templates for feature, bug, documentation, and operations',
    pullRequestTemplate: 'Pull request template',
};

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
        Object.keys(SETUP_FEATURE_DESCRIPTIONS).map(feature => [feature, feature !== 'inactiveIssueClosure']),
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
            inactivityThresholdHours: DEFAULT_INACTIVITY_THRESHOLD_HOURS,
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
            secrets: {
                ...base.storage.secrets,
                ...(overrides.storage?.secrets ?? {}),
                overrides: {
                    ...base.storage.secrets.overrides,
                    ...(overrides.storage?.secrets?.overrides ?? {}),
                },
            },
            variables: {
                ...base.storage.variables,
                ...(overrides.storage?.variables ?? {}),
                overrides: {
                    ...base.storage.variables.overrides,
                    ...(overrides.storage?.variables?.overrides ?? {}),
                },
            },
        },
    };
}
