import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import {
    SETUP_AGENT_TASKS,
    SETUP_FEATURE_DESCRIPTIONS,
    type SetupConfigurationOverrides,
} from '../application/policies/setup_configuration_policy';
import { normalizeMergeQueueCheckAttestations } from '../domain/merge_queue_readiness';
import { ISSUE_WORKFLOW_KINDS, type IssueWorkflowKind } from '../domain/issue_workflow_profile';

const SETUP_OVERRIDE_KEYS = new Set([
    'features',
    'agents',
    'repository',
    'ai',
    'pullRequestApproval',
    'projects',
    'createInitialTag',
    'manageRepositoryVariables',
    'manageRepositorySecrets',
    'actionInputs',
    'storage',
    'issueWorkflows',
    'repositoryAgentGuidance',
]);
const AGENT_OVERRIDE_KEYS = new Set(['provider', 'modelProvider', 'model', 'effort', 'executable']);
const REPOSITORY_STRING_KEYS = new Set([
    'mainBranch',
    'developmentBranch',
    'featureTree',
    'bugfixTree',
    'hotfixTree',
    'releaseTree',
    'docsTree',
    'choreTree',
    'repositoryLocale',
    'issueLocale',
    'pullRequestLocale',
    'commitPrefixTransforms',
    'releaseReconciliationStrategy',
    'hotfixReconciliationStrategy',
    'reconciliationPullRequestMode',
    'reconciliationBackmergeMode',
    'hotfixActiveReleasePolicy',
    'reconciliationTree',
    'reconciliationCleanup',
    'reconciliationIssueCompletion',
    'orchestrationPresentationMode',
    'orchestrationCommentMode',
]);
const REPOSITORY_BOOLEAN_KEYS = new Set(['issueManagedBranches', 'preBranchSdd', 'reopenIssueOnPush', 'orchestrationDiagrams']);
const REPOSITORY_NUMBER_KEYS = new Set(['desiredAssigneesCount', 'desiredReviewersCount', 'inactivityThresholdHours']);
const REPOSITORY_STRUCTURED_KEYS = new Set(['mergeQueueCheckAttestations']);
const AI_STRING_KEYS = new Set(['ignoreFiles', 'pullRequestDescriptionMode', 'bugbotSeverity', 'bugbotFixVerifyCommands', 'bugbotEffort', 'bugbotOrganizationRules', 'provisioningMode']);
const AI_NUMBER_KEYS = new Set(['bugbotCommentLimit']);
const AI_BOOLEAN_KEYS = new Set(['membersOnly', 'includeReasoning', 'bugbotDryRun', 'bugbotReviewDrafts', 'bugbotTraceRules', 'bugbotSuggestedChanges', 'bugbotTelemetry', 'bugbotFailOnUnresolved']);
const PROJECT_KEYS = new Set([
    'ids',
    'issueCreatedColumn',
    'pullRequestCreatedColumn',
    'issueInProgressColumn',
    'pullRequestInProgressColumn',
]);
const STORAGE_KEYS = new Set(['secrets', 'variables']);
const STORAGE_POLICY_KEYS = new Set(['defaultScope', 'organizationVisibility', 'preserveExisting', 'overrides']);
const GUIDANCE_KEYS = new Set(['enabled', 'agentsPointer']);

/** Loads a non-secret setup override file. JSON and YAML are supported. */
export function loadSetupConfigurationOverrides(filePath: string): SetupConfigurationOverrides {
    const parsed = yaml.load(readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Setup configuration must be a YAML or JSON object.');
    }
    const raw = parsed as Record<string, unknown>;
    if (containsCredentialMaterial(raw)) {
        throw new Error('Setup configuration must not contain secrets or credential material.');
    }
    validateObjectKeys(raw, SETUP_OVERRIDE_KEYS, 'setup configuration');
    validateOptionalObject(raw.features, 'features');
    if (raw.features !== undefined) {
        validateObjectKeys(raw.features as Record<string, unknown>, new Set(Object.keys(SETUP_FEATURE_DESCRIPTIONS)), 'features');
        validateBooleanValues(raw.features as Record<string, unknown>, 'features');
    }
    validateOptionalObject(raw.agents, 'agents');
    if (raw.agents !== undefined) {
        const agents = raw.agents as Record<string, unknown>;
        validateObjectKeys(agents, new Set(SETUP_AGENT_TASKS), 'agents');
        for (const [task, value] of Object.entries(agents)) {
            validateObject(value, `agents.${task}`);
            const agent = value as Record<string, unknown>;
            validateObjectKeys(agent, AGENT_OVERRIDE_KEYS, `agents.${task}`);
            validateStringValues(agent, `agents.${task}`);
        }
    }
    validateSection(
        raw.repository,
        'repository',
        REPOSITORY_STRING_KEYS,
        REPOSITORY_BOOLEAN_KEYS,
        REPOSITORY_NUMBER_KEYS,
        REPOSITORY_STRUCTURED_KEYS,
    );
    if (raw.repository && (raw.repository as Record<string, unknown>).mergeQueueCheckAttestations !== undefined) {
        const result = normalizeMergeQueueCheckAttestations(
            (raw.repository as Record<string, unknown>).mergeQueueCheckAttestations,
        );
        if (result.errors.length > 0) throw new Error(result.errors.join(' '));
        (raw.repository as Record<string, unknown>).mergeQueueCheckAttestations = result.value;
    }
    validateSection(raw.ai, 'ai', AI_STRING_KEYS, AI_BOOLEAN_KEYS, AI_NUMBER_KEYS);
    validateApprovalOverride(raw.pullRequestApproval);
    validateSection(raw.projects, 'projects', PROJECT_KEYS, new Set(), new Set());
    validateBooleanProperty(raw, 'createInitialTag');
    validateBooleanProperty(raw, 'manageRepositoryVariables');
    validateBooleanProperty(raw, 'manageRepositorySecrets');
    validateOptionalObject(raw.actionInputs, 'actionInputs');
    if (raw.actionInputs !== undefined) validateStringValues(raw.actionInputs as Record<string, unknown>, 'actionInputs');
    validateStorage(raw.storage);
    validateIssueWorkflows(raw.issueWorkflows);
    validateGuidance(raw.repositoryAgentGuidance);
    return raw as SetupConfigurationOverrides;
}

function validateApprovalOverride(value: unknown): void {
    if (value === undefined) return;
    validateObject(value, 'pullRequestApproval');
    const policy = value as Record<string, unknown>;
    validateObjectKeys(policy, new Set([
        'version', 'mode', 'targetRoles', 'branchKinds', 'requireLinkedIssue',
        'additionalExcludedPaths', 'testChecks', 'producerAttested', 'coverage', 'allowHumanDismissed',
        'skipWhenHumanApproved',
    ]), 'pullRequestApproval');
    if (policy.testChecks !== undefined && !Array.isArray(policy.testChecks)) throw new Error('pullRequestApproval.testChecks must be an array.');
    if (policy.coverage !== undefined) {
        validateObject(policy.coverage, 'pullRequestApproval.coverage');
        validateObjectKeys(policy.coverage as Record<string, unknown>, new Set([
            'mode', 'checkName', 'minDiffPercent', 'artifactWorkflowName', 'reporterAttested',
        ]), 'pullRequestApproval.coverage');
    }
}

function validateIssueWorkflows(value: unknown): void {
    if (value === undefined) return;
    validateObject(value, 'issueWorkflows');
    const section = value as Record<string, unknown>;
    validateObjectKeys(section, new Set(['enabled']), 'issueWorkflows');
    if (!Array.isArray(section.enabled) || section.enabled.some(item => typeof item !== 'string')) {
        throw new Error('issueWorkflows.enabled must be an array of workflow IDs.');
    }
    const enabled = section.enabled as string[];
    const unknown = enabled.filter(item => !ISSUE_WORKFLOW_KINDS.includes(item as IssueWorkflowKind));
    if (unknown.length > 0) throw new Error(`Unknown issue workflow(s): ${unknown.join(', ')}.`);
    if (new Set(enabled).size !== enabled.length) throw new Error('issueWorkflows.enabled cannot contain duplicates.');
}

function validateGuidance(value: unknown): void {
    if (value === undefined) return;
    validateObject(value, 'repositoryAgentGuidance');
    const section = value as Record<string, unknown>;
    validateObjectKeys(section, GUIDANCE_KEYS, 'repositoryAgentGuidance');
    if (section.enabled !== undefined && typeof section.enabled !== 'boolean') throw new Error('repositoryAgentGuidance.enabled must be a boolean.');
    if (section.agentsPointer !== undefined && !['prompt', 'create-if-missing', 'disabled'].includes(String(section.agentsPointer))) {
        throw new Error('repositoryAgentGuidance.agentsPointer must be prompt, create-if-missing, or disabled.');
    }
}

function validateStorage(value: unknown): void {
    if (value === undefined) return;
    validateObject(value, 'storage');
    const storage = value as Record<string, unknown>;
    validateObjectKeys(storage, STORAGE_KEYS, 'storage');
    for (const kind of STORAGE_KEYS) {
        if (storage[kind] === undefined) continue;
        validateObject(storage[kind], `storage.${kind}`);
        const policy = storage[kind] as Record<string, unknown>;
        validateObjectKeys(policy, STORAGE_POLICY_KEYS, `storage.${kind}`);
        if (policy.defaultScope !== undefined && !['repository', 'organization'].includes(String(policy.defaultScope))) {
            throw new Error(`storage.${kind}.defaultScope must be repository or organization.`);
        }
        if (policy.organizationVisibility !== undefined && !['all', 'private', 'selected'].includes(String(policy.organizationVisibility))) {
            throw new Error(`storage.${kind}.organizationVisibility must be all, private, or selected.`);
        }
        if (policy.preserveExisting !== undefined && typeof policy.preserveExisting !== 'boolean') {
            throw new Error(`storage.${kind}.preserveExisting must be a boolean.`);
        }
        if (policy.overrides !== undefined) {
            validateObject(policy.overrides, `storage.${kind}.overrides`);
            validateStringValues(policy.overrides as Record<string, unknown>, `storage.${kind}.overrides`);
            for (const [name, scope] of Object.entries(policy.overrides as Record<string, unknown>)) {
                if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
                    throw new Error(`storage.${kind}.overrides names must be uppercase GitHub Actions names.`);
                }
                if (!['repository', 'organization'].includes(String(scope))) {
                    throw new Error(`storage.${kind}.overrides.${name} must be repository or organization.`);
                }
            }
        }
    }
}

function validateSection(
    value: unknown,
    name: string,
    stringKeys: ReadonlySet<string>,
    booleanKeys: ReadonlySet<string>,
    numberKeys: ReadonlySet<string>,
    structuredKeys: ReadonlySet<string> = new Set(),
): void {
    if (value === undefined) return;
    validateObject(value, name);
    const section = value as Record<string, unknown>;
    validateObjectKeys(section, new Set([...stringKeys, ...booleanKeys, ...numberKeys, ...structuredKeys]), name);
    for (const key of stringKeys) if (section[key] !== undefined && typeof section[key] !== 'string') throw new Error(`${name}.${key} must be a string.`);
    for (const key of booleanKeys) if (section[key] !== undefined && typeof section[key] !== 'boolean') throw new Error(`${name}.${key} must be a boolean.`);
    for (const key of numberKeys) if (section[key] !== undefined && (!Number.isInteger(section[key]) || (section[key] as number) < 0)) throw new Error(`${name}.${key} must be a non-negative integer.`);
}

function validateOptionalObject(value: unknown, name: string): void {
    if (value !== undefined) validateObject(value, name);
}

function validateObject(value: unknown, name: string): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
}

function validateObjectKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, name: string): void {
    const unknown = Object.keys(value).filter(key => !allowed.has(key));
    if (unknown.length > 0) throw new Error(`Unknown ${name} field(s): ${unknown.join(', ')}.`);
}

function validateBooleanValues(value: Record<string, unknown>, name: string): void {
    for (const [key, item] of Object.entries(value)) if (typeof item !== 'boolean') throw new Error(`${name}.${key} must be a boolean.`);
}

function validateStringValues(value: Record<string, unknown>, name: string): void {
    for (const [key, item] of Object.entries(value)) if (typeof item !== 'string') throw new Error(`${name}.${key} must be a string.`);
}

function validateBooleanProperty(value: Record<string, unknown>, key: string): void {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
}

function containsCredentialMaterial(value: unknown, insideStorage = false): boolean {
    if (typeof value === 'string') {
        return /^(?:github_pat_|gh[pso]_|ghu_|ghs_|sk-|AIza|xox[baprs]-)/i.test(value.trim());
    }
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(item => containsCredentialMaterial(item, insideStorage));
    return Object.entries(value).some(([key, item]) => {
        if (insideStorage) return false;
        if (key === 'storage') return containsCredentialMaterial(item, true);
        // Boolean configuration switches such as `manageRepositorySecrets` and
        // `features.credentialHealth` are not credential material. Only reject
        // credential-shaped properties when they actually carry a value.
        const looksLikeCredentialProperty = /(?:password|secret|token|api[_-]?key|credential)/i.test(key)
            && !['storage', 'secrets', 'variables'].includes(key.toLowerCase());
        return (looksLikeCredentialProperty && item !== undefined && item !== null && typeof item !== 'boolean')
            || containsCredentialMaterial(item);
    });
}
