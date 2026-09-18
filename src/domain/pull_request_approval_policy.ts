/** The runtime never infers an approval policy from Action or PR defaults. */
export type PullRequestApprovalMode = 'off' | 'recommend' | 'guarded';
export type PullRequestApprovalTargetRole = 'development' | 'main';
export type PullRequestApprovalBranchKind = 'feature' | 'bugfix' | 'documentation' | 'chore';

export interface PullRequestApprovalProducer {
    readonly name: string;
    readonly sourceAppId: number;
    readonly workflowName: string;
}

export type PullRequestApprovalCoverage =
    | { readonly mode: 'check'; readonly checkName: string }
    | { readonly mode: 'numeric'; readonly checkName: string; readonly minDiffPercent: number; readonly artifactWorkflowName: string; readonly reporterAttested: boolean };

export interface PullRequestApprovalPolicy {
    readonly version: 1;
    readonly mode: PullRequestApprovalMode;
    readonly targetRoles: readonly PullRequestApprovalTargetRole[];
    readonly branchKinds: readonly PullRequestApprovalBranchKind[];
    readonly requireLinkedIssue: boolean;
    readonly additionalExcludedPaths: readonly string[];
    readonly testChecks: readonly PullRequestApprovalProducer[];
    /** The operator explicitly verified the exact App/workflow/check and enforcing CI step. */
    readonly producerAttested: boolean;
    readonly coverage: PullRequestApprovalCoverage;
    readonly allowHumanDismissed: boolean;
    readonly skipWhenHumanApproved: boolean;
}

export const DEFAULT_PULL_REQUEST_APPROVAL_POLICY: PullRequestApprovalPolicy = {
    version: 1,
    mode: 'recommend',
    targetRoles: ['development'],
    branchKinds: ['feature', 'bugfix', 'documentation', 'chore'],
    requireLinkedIssue: true,
    additionalExcludedPaths: [],
    testChecks: [],
    producerAttested: false,
    coverage: { mode: 'check', checkName: '' },
    allowHumanDismissed: false,
    skipWhenHumanApproved: true,
};

export const DISABLED_PULL_REQUEST_APPROVAL_POLICY: PullRequestApprovalPolicy = {
    ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY,
    mode: 'off',
};

/** Additive exclusions. A user-selected glob cannot remove any of these paths. */
export const FIXED_APPROVAL_EXCLUSIONS = [
    '.github/workflows/**',
    '.github/actions/**',
    '.copilot/**',
    'setup/workflows/**',
    'action.yml',
    'build/**',
    'CODEOWNERS',
    '**/CODEOWNERS',
    'src/domain/pull_request_approval**',
    'src/domain/bugbot/**',
    'src/application/**/pull_request_approval**',
    'src/application/usecases/steps/commit/bugbot/**',
    'src/application/policies/bugbot_review_presentation_policy.ts',
    'src/data/repository/pull_request/**approval**',
    'src/actions/**approval**',
    'src/actions/github_action.ts',
    'src/application/contracts/input_keys.ts',
    'src/infrastructure/**approval**',
    'src/application/policies/setup_configuration_**',
] as const;

const POLICY_KEYS = new Set([
    'version', 'mode', 'targetRoles', 'branchKinds', 'requireLinkedIssue',
    'additionalExcludedPaths', 'testChecks', 'producerAttested', 'coverage', 'allowHumanDismissed',
    'skipWhenHumanApproved',
]);
const PRODUCER_KEYS = new Set(['name', 'sourceAppId', 'workflowName']);
const SAFE_NAME = /^[^\r\n${}<>|]{1,100}$/u;
const SAFE_GLOB = /^(?![!/]|.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._*?/-]{1,120}$/u;

export function validatePullRequestApprovalPolicy(value: unknown, allowIncomplete = false): string[] {
    const errors: string[] = [];
    if (!isRecord(value)) return ['PR approval policy must be an object.'];
    unknownKeys(value, POLICY_KEYS, 'policy', errors);
    if (value.version !== 1) errors.push('PR approval policy version must be 1.');
    if (!['off', 'recommend', 'guarded'].includes(String(value.mode))) errors.push('PR approval mode must be off, recommend, or guarded.');
    enumArray(value.targetRoles, ['development', 'main'], 'targetRoles', 2, errors);
    enumArray(value.branchKinds, ['feature', 'bugfix', 'documentation', 'chore'], 'branchKinds', 4, errors);
    for (const key of ['requireLinkedIssue', 'allowHumanDismissed', 'skipWhenHumanApproved']) {
        if (typeof value[key] !== 'boolean') errors.push(`${key} must be boolean.`);
    }
    if (!Array.isArray(value.additionalExcludedPaths) || value.additionalExcludedPaths.length > 32
        || value.additionalExcludedPaths.some(path => typeof path !== 'string' || !SAFE_GLOB.test(path))
        || new Set(value.additionalExcludedPaths).size !== value.additionalExcludedPaths.length) {
        errors.push('additionalExcludedPaths must contain at most 32 unique safe rooted globs.');
    }
    if (!Array.isArray(value.testChecks) || value.testChecks.length > 8 || (value.mode !== 'off' && value.testChecks.length === 0 && !allowIncomplete)) {
        errors.push('guarded/recommend mode requires 1–8 exact test checks.');
    } else {
        const identities = new Set<string>();
        for (const item of value.testChecks) {
            if (!isRecord(item)) { errors.push('Each test check must be an object.'); continue; }
            unknownKeys(item, PRODUCER_KEYS, 'test check', errors);
            if (!safeName(item.name) || !safeName(item.workflowName) || !Number.isSafeInteger(item.sourceAppId) || Number(item.sourceAppId) <= 0) {
                errors.push('Each test check needs a safe exact name, workflow name, and positive source App ID.');
            }
            const identity = `${item.name}:${item.sourceAppId}:${item.workflowName}`;
            if (identities.has(identity)) errors.push('Test checks cannot contain duplicate producer identities.');
            identities.add(identity);
        }
    }
    if (typeof value.producerAttested !== 'boolean') errors.push('producerAttested must be boolean.');
    if (value.mode === 'guarded' && value.producerAttested !== true && !allowIncomplete) {
        errors.push('Guarded approval requires explicit exact-producer and coverage-enforcement attestation.');
    }
    const coverage = value.coverage;
    if (!isRecord(coverage) || !['check', 'numeric'].includes(String(coverage.mode))) {
        errors.push('Coverage mode must be check or numeric.');
    } else {
        unknownKeys(coverage, new Set(coverage.mode === 'numeric'
            ? ['mode', 'checkName', 'minDiffPercent', 'artifactWorkflowName', 'reporterAttested']
            : ['mode', 'checkName']), 'coverage', errors);
        if (!safeName(coverage.checkName) && !(coverage.checkName === '' && (value.mode === 'off' || allowIncomplete))) {
            errors.push('Coverage checkName must identify one exact safe check.');
        }
        if (value.mode !== 'off' && !(allowIncomplete && coverage.checkName === '') && Array.isArray(value.testChecks)
            && !value.testChecks.some(item => isRecord(item) && item.name === coverage.checkName)) {
            errors.push('Coverage checkName must match a configured trusted test check.');
        }
        if (coverage.mode === 'numeric' && (!Number.isSafeInteger(coverage.minDiffPercent)
            || Number(coverage.minDiffPercent) < 0 || Number(coverage.minDiffPercent) > 100
            || !safeName(coverage.artifactWorkflowName))) {
            errors.push('Numeric coverage needs minDiffPercent 0–100 and an exact artifact workflow name.');
        }
        if (coverage.mode === 'numeric' && Array.isArray(value.testChecks)
            && !value.testChecks.some(item => isRecord(item) && item.workflowName === coverage.artifactWorkflowName)) {
            errors.push('Numeric artifact workflow must match a configured trusted producer.');
        }
        if (coverage.mode === 'numeric' && typeof coverage.reporterAttested !== 'boolean') {
            errors.push('Numeric coverage reporterAttested must be boolean.');
        }
        if (coverage.mode === 'numeric' && value.mode === 'guarded'
            && coverage.reporterAttested !== true && !allowIncomplete) {
            errors.push('Guarded numeric coverage requires an installed-reporter attestation.');
        }
    }
    return errors;
}

export function parsePullRequestApprovalPolicy(raw: string | undefined): PullRequestApprovalPolicy {
    if (raw && raw.length > 16_384) throw new Error('PR approval policy exceeds 16 KiB.');
    if (!raw?.trim()) return DISABLED_PULL_REQUEST_APPROVAL_POLICY;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error('PR approval policy is not valid JSON.'); }
    const errors = validatePullRequestApprovalPolicy(value);
    if (errors.length > 0) throw new Error(errors.join(' '));
    return value as unknown as PullRequestApprovalPolicy;
}

export function serializePullRequestApprovalPolicy(policy: PullRequestApprovalPolicy): string {
    const errors = validatePullRequestApprovalPolicy(policy);
    if (errors.length > 0) throw new Error(errors.join(' '));
    return JSON.stringify(policy);
}

function safeName(value: unknown): boolean {
    return typeof value === 'string' && SAFE_NAME.test(value) && value.trim() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string, errors: string[]): void {
    const unknown = Object.keys(value).filter(key => !allowed.has(key));
    if (unknown.length > 0) errors.push(`Unknown ${label} field(s): ${unknown.join(', ')}.`);
}

function enumArray(value: unknown, allowed: readonly string[], label: string, max: number, errors: string[]): void {
    if (!Array.isArray(value) || value.length === 0 || value.length > max
        || value.some(item => typeof item !== 'string' || !allowed.includes(item))
        || new Set(value).size !== value.length) errors.push(`${label} must be a nonempty unique supported selection.`);
}
