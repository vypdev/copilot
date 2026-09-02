import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import {
    SETUP_AGENT_TASKS,
    SETUP_FEATURE_DESCRIPTIONS,
    type SetupConfigurationOverrides,
} from '../application/policies/setup_configuration_policy';

const SETUP_OVERRIDE_KEYS = new Set([
    'features',
    'agents',
    'repository',
    'ai',
    'projects',
    'createInitialTag',
    'manageRepositoryVariables',
    'manageRepositorySecrets',
    'actionInputs',
]);
const AGENT_OVERRIDE_KEYS = new Set(['provider', 'modelProvider', 'model', 'effort']);
const REPOSITORY_STRING_KEYS = new Set([
    'mainBranch',
    'developmentBranch',
    'featureTree',
    'bugfixTree',
    'hotfixTree',
    'releaseTree',
    'docsTree',
    'choreTree',
    'issueLocale',
    'pullRequestLocale',
    'commitPrefixTransforms',
]);
const REPOSITORY_BOOLEAN_KEYS = new Set(['branchManagementAlways', 'reopenIssueOnPush']);
const REPOSITORY_NUMBER_KEYS = new Set(['desiredAssigneesCount', 'desiredReviewersCount', 'mergeTimeout']);
const AI_BOOLEAN_KEYS = new Set(['pullRequestDescription', 'membersOnly', 'includeReasoning']);
const AI_STRING_KEYS = new Set(['ignoreFiles', 'bugbotSeverity', 'bugbotFixVerifyCommands', 'provisioningMode']);
const AI_NUMBER_KEYS = new Set(['bugbotCommentLimit']);
const PROJECT_KEYS = new Set([
    'ids',
    'issueCreatedColumn',
    'pullRequestCreatedColumn',
    'issueInProgressColumn',
    'pullRequestInProgressColumn',
]);

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
    validateSection(raw.repository, 'repository', REPOSITORY_STRING_KEYS, REPOSITORY_BOOLEAN_KEYS, REPOSITORY_NUMBER_KEYS);
    validateSection(raw.ai, 'ai', AI_STRING_KEYS, AI_BOOLEAN_KEYS, AI_NUMBER_KEYS);
    validateSection(raw.projects, 'projects', PROJECT_KEYS, new Set(), new Set());
    validateBooleanProperty(raw, 'createInitialTag');
    validateBooleanProperty(raw, 'manageRepositoryVariables');
    validateBooleanProperty(raw, 'manageRepositorySecrets');
    validateOptionalObject(raw.actionInputs, 'actionInputs');
    if (raw.actionInputs !== undefined) validateStringValues(raw.actionInputs as Record<string, unknown>, 'actionInputs');
    return raw as SetupConfigurationOverrides;
}

function validateSection(
    value: unknown,
    name: string,
    stringKeys: ReadonlySet<string>,
    booleanKeys: ReadonlySet<string>,
    numberKeys: ReadonlySet<string>,
): void {
    if (value === undefined) return;
    validateObject(value, name);
    const section = value as Record<string, unknown>;
    validateObjectKeys(section, new Set([...stringKeys, ...booleanKeys, ...numberKeys]), name);
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

function containsCredentialMaterial(value: unknown): boolean {
    if (typeof value === 'string') {
        return /^(?:github_pat_|gh[pso]_|ghu_|ghs_|sk-|AIza|xox[baprs]-)/i.test(value.trim());
    }
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(containsCredentialMaterial);
    return Object.entries(value).some(([key, item]) => {
        // Boolean configuration switches such as `manageRepositorySecrets` and
        // `features.credentialHealth` are not credential material. Only reject
        // credential-shaped properties when they actually carry a value.
        const looksLikeCredentialProperty = /(?:password|secret|token|api[_-]?key|credential)/i.test(key);
        return (looksLikeCredentialProperty && item !== undefined && item !== null && typeof item !== 'boolean')
            || containsCredentialMaterial(item);
    });
}
