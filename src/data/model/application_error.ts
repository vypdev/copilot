import { isChangeSizeReconciliationFacts, type ChangeSizeReconciliationFacts } from '../../domain/change_size_reconciliation';
import { COPILOT_COMMAND_VALIDATION_REASONS, isCopilotCommandValidationReason, isValidCopilotCommandValidation, type CopilotCommandValidationReason } from '../../domain/copilot_command_validation';
import type { CopilotCommandName } from '../../domain/copilot_command';
import { CLOSED_ISSUE_RESULTS, CLOSED_ISSUE_PHASES, CLOSED_ISSUE_REASONS, type ClosedIssueReconciliationFacts } from '../../domain/closed_issue_reconciliation';
import { APPROVAL_EVIDENCE_PERMISSIONS, APPROVAL_EVIDENCE_REASONS, type ApprovalEvidenceDiagnostic } from '../../domain/approval_evidence_diagnostic';

import { BRANCH_SYNC_VALIDATION_CODES, type BranchSyncValidationCode } from '../../domain/branch_sync_validation';
import { isBranchSyncVerificationFailure, type BranchSyncVerificationFailure } from '../../domain/verification_failure';

export type ApplicationErrorKind =
    | 'configuration'
    | 'authorization'
    | 'provider'
    | 'agent'
    | 'validation'
    | 'workflow'
    | 'unknown';

export type ApplicationErrorCode =
    | 'configuration.invalid'
    | 'configuration.unsupported'
    | 'authorization.denied'
    | 'authorization.credential-invalid'
    | 'provider.not-found'
    | 'provider.conflict'
    | 'provider.rate-limited'
    | 'provider.unavailable'
    | 'provider.contract-invalid'
    | 'agent.policy-rejected'
    | 'agent.failed'
    | 'locale.output-invalid'
    | 'locale.translation-failed'
    | 'validation.invalid-input'
    | 'validation.evidence-too-large'
    | 'validation.evidence-unavailable'
    | 'workflow.invalid-event'
    | 'workflow.stale'
    | 'workflow.cancelled'
    | 'workflow.failed'
    | 'workflow.presentation-pending'
    | 'timeout'
    | 'unexpected';

export const APPLICATION_ERROR_RECOVERY_IDS = Object.freeze([
    ...COPILOT_COMMAND_VALIDATION_REASONS,
    'pull-request-link-restored',
    'pull-request-link-base-retained',
    'pull-request-link-reference-retained',
    'pull-request-link-base-and-reference-retained',
    'managed-branch-enrichment-failed',
    'inactivity-explanation-failed',
    'bugbot-review-blocks-pending',
    'branch-sync-agent-disabled',
    'branch-sync-fixer-unavailable',
    'branch-sync-resolution-invalid',
    'branch-sync-verification-failed',
    'sdd-draft-size-exceeded',
    'sdd-catalog-unsupported-profile',
    'sdd-catalog-format-invalid',
    'sdd-draft-format-invalid',
    'sdd-draft-case-identity-invalid',
    'sdd-draft-case-budget-invalid',
    'sdd-draft-requirement-mapping-invalid',
    'sdd-draft-repository-path-invalid',

    'workspace-changes-rejected',
    'closed-issue-reconciliation-failed',
    'approval-evidence-read-failed',
    'change-size-reconciliation-failed',
    'stored-configuration-schema-missing',
    'stored-configuration-schema-unsupported',
    'stored-configuration-invalid',

] as const);

export type ApplicationErrorRecoveryId = typeof APPLICATION_ERROR_RECOVERY_IDS[number];

interface ApplicationErrorRecoveryVariables extends Readonly<Record<CopilotCommandValidationReason, Readonly<{ command: CopilotCommandName }>>> {
    readonly 'stored-configuration-schema-missing': Readonly<{ issueNumber: number; expectedVersion: number }>;
    readonly 'stored-configuration-schema-unsupported': Readonly<{ issueNumber: number; expectedVersion: number; actualVersion: number }>;
    readonly 'stored-configuration-invalid': Readonly<{ issueNumber: number; expectedVersion: number }>;
    readonly 'closed-issue-reconciliation-failed': ClosedIssueReconciliationFacts;
    readonly 'approval-evidence-read-failed': ApprovalEvidenceDiagnostic;
    readonly 'change-size-reconciliation-failed': ChangeSizeReconciliationFacts;

    readonly 'pull-request-link-restored': Readonly<Record<string, never>>;
    readonly 'pull-request-link-base-retained': Readonly<Record<string, never>>;
    readonly 'pull-request-link-reference-retained': Readonly<Record<string, never>>;
    readonly 'pull-request-link-base-and-reference-retained': Readonly<Record<string, never>>;
    readonly 'managed-branch-enrichment-failed': Readonly<{ branchName: string }>;
    readonly 'inactivity-explanation-failed': Readonly<{ issueNumber: number }>;
    readonly 'bugbot-review-blocks-pending': Readonly<{ pendingCount: number }>;
    readonly 'branch-sync-agent-disabled': Readonly<{ command: '/copilot sync-branch' }>;
    readonly 'branch-sync-fixer-unavailable': Readonly<{ command: '/copilot sync-branch' }>;
    readonly 'branch-sync-resolution-invalid': Readonly<{ validationCode: BranchSyncValidationCode; command: '/copilot sync-branch' }>;
    readonly 'branch-sync-verification-failed': BranchSyncVerificationFailure;
    readonly 'sdd-draft-size-exceeded': Readonly<Record<string, never>>;
    readonly 'sdd-catalog-unsupported-profile': Readonly<Record<string, never>>;
    readonly 'sdd-catalog-format-invalid': Readonly<Record<string, never>>;
    readonly 'sdd-draft-format-invalid': Readonly<Record<string, never>>;
    readonly 'sdd-draft-case-identity-invalid': Readonly<Record<string, never>>;
    readonly 'sdd-draft-case-budget-invalid': Readonly<Record<string, never>>;
    readonly 'sdd-draft-requirement-mapping-invalid': Readonly<Record<string, never>>;
    readonly 'sdd-draft-repository-path-invalid': Readonly<Record<string, never>>;

    readonly 'workspace-changes-rejected': Readonly<Record<string, never>>;
}

export type ApplicationErrorRecovery = {
    readonly [Id in ApplicationErrorRecoveryId]: Readonly<{
        id: Id;
        variables: ApplicationErrorRecoveryVariables[Id];
    }>;
}[ApplicationErrorRecoveryId];

interface ApplicationErrorMetadata {
    readonly kind: ApplicationErrorKind;
    readonly retryable: boolean;
    readonly impact: string;
    readonly action: string;
    readonly retainedState: string;
}

const PRESERVED_STATE = 'Existing persisted state and completed external effects were preserved.';
const UNCHANGED_STATE = 'No new state or external effect was created.';

export const APPLICATION_ERROR_METADATA: Readonly<Record<ApplicationErrorCode, ApplicationErrorMetadata>> = {
    'configuration.invalid': {
        kind: 'configuration', retryable: false,
        impact: 'The operation could not use the configured values.',
        action: 'Correct the invalid configuration and retry.',
        retainedState: UNCHANGED_STATE,
    },
    'configuration.unsupported': {
        kind: 'configuration', retryable: false,
        impact: 'The requested capability is not supported by this installation.',
        action: 'Use a supported configuration or update the installation.',
        retainedState: UNCHANGED_STATE,
    },
    'authorization.denied': {
        kind: 'authorization', retryable: false,
        impact: 'The operation could not access the required resource.',
        action: 'Grant the documented permission and retry.',
        retainedState: UNCHANGED_STATE,
    },
    'authorization.credential-invalid': {
        kind: 'authorization', retryable: false,
        impact: 'The operation could not authenticate with the required provider.',
        action: 'Replace or configure the required credential and retry.',
        retainedState: UNCHANGED_STATE,
    },
    'provider.not-found': {
        kind: 'provider', retryable: false,
        impact: 'A required provider resource was not found.',
        action: 'Verify the target resource and retry the operation.',
        retainedState: PRESERVED_STATE,
    },
    'provider.conflict': {
        kind: 'provider', retryable: true,
        impact: 'The provider rejected a conflicting current state.',
        action: 'Reload the current state and retry if the operation is still required.',
        retainedState: PRESERVED_STATE,
    },
    'provider.rate-limited': {
        kind: 'provider', retryable: true,
        impact: 'The provider temporarily limited the operation.',
        action: 'Retry after the provider limit resets.',
        retainedState: PRESERVED_STATE,
    },
    'provider.unavailable': {
        kind: 'provider', retryable: true,
        impact: 'The provider was temporarily unavailable.',
        action: 'Retry when the provider is available.',
        retainedState: PRESERVED_STATE,
    },
    'provider.contract-invalid': {
        kind: 'provider', retryable: false,
        impact: 'The provider response could not be safely interpreted.',
        action: 'Review the provider integration before retrying.',
        retainedState: PRESERVED_STATE,
    },
    'agent.policy-rejected': {
        kind: 'agent', retryable: false,
        impact: 'The configured agent was not started.',
        action: 'Use an allowed agent configuration and retry.',
        retainedState: UNCHANGED_STATE,
    },
    'agent.failed': {
        kind: 'agent', retryable: true,
        impact: 'The admitted agent did not produce a usable result.',
        action: 'Inspect the sanitized agent status and retry if appropriate.',
        retainedState: PRESERVED_STATE,
    },
    'locale.output-invalid': {
        kind: 'agent', retryable: true,
        impact: 'Agent-generated product content was rejected before publication because its locale contract was invalid.',
        action: 'Retry with a provider that supports the configured repository locale.',
        retainedState: UNCHANGED_STATE,
    },
    'locale.translation-failed': {
        kind: 'agent', retryable: true,
        impact: 'The request could not be safely interpreted in the configured repository language.',
        action: 'Rephrase the request or retry when the configured language provider is available.',
        retainedState: UNCHANGED_STATE,
    },
    'validation.invalid-input': {
        kind: 'validation', retryable: false,
        impact: 'The operation did not accept the supplied input.',
        action: 'Correct the input and retry.',
        retainedState: UNCHANGED_STATE,
    },
    'validation.evidence-unavailable': {
        kind: 'validation', retryable: false,
        impact: 'Progress was not assessed because GitHub omitted a required file patch.',
        action: 'Inspect the exact base/head comparison manually or split the work into smaller reviewed changes with complete patches before a new assessment. Retrying the same commits cannot restore omitted evidence.',
        retainedState: 'Existing progress labels and published assessments were preserved; no model assessment was made.',
    },
    'validation.evidence-too-large': {
        kind: 'validation', retryable: false,
        impact: 'Progress could not be assessed within the fixed evidence limits.',
        action: 'Reduce the comparison size or split the work into smaller reviewed changes before running a new assessment.',
        retainedState: 'Existing progress labels and published assessments were preserved.',
    },
    'workflow.invalid-event': {
        kind: 'workflow', retryable: false,
        impact: 'The event cannot start the requested workflow.',
        action: 'Start the operation from a supported event or surface.',
        retainedState: UNCHANGED_STATE,
    },
    'workflow.stale': {
        kind: 'workflow', retryable: false,
        impact: 'A newer state superseded this workflow invocation.',
        action: 'Inspect the current state and start a fresh invocation only if needed.',
        retainedState: PRESERVED_STATE,
    },
    'workflow.cancelled': {
        kind: 'workflow', retryable: false,
        impact: 'The workflow stopped before it completed.',
        action: 'Start a new invocation if the operation is still required.',
        retainedState: PRESERVED_STATE,
    },
    'workflow.failed': {
        kind: 'workflow', retryable: true,
        impact: 'The workflow could not complete the requested operation.',
        action: 'Inspect the current state and retry the failed step.',
        retainedState: PRESERVED_STATE,
    },
    'workflow.presentation-pending': {
        kind: 'workflow', retryable: true,
        impact: 'Bugbot completed the review, but historical review summaries are not fully synchronized.',
        action: 'Run a Bugbot recheck to continue the bounded presentation repair.',
        retainedState: PRESERVED_STATE,
    },
    timeout: {
        kind: 'workflow', retryable: true,
        impact: 'The operation exceeded its bounded execution time.',
        action: 'Verify the current state before retrying.',
        retainedState: PRESERVED_STATE,
    },
    unexpected: {
        kind: 'unknown', retryable: false,
        impact: 'The operation stopped because an unexpected failure was handled safely.',
        action: 'Use the correlation ID to investigate before retrying.',
        retainedState: PRESERVED_STATE,
    },
};

export interface SemanticApplicationErrorOptions {
    readonly retryable?: boolean;
    readonly recovery?: ApplicationErrorRecovery;
    readonly correlationId: string;
    readonly cause?: unknown;
}

export interface ApplicationErrorPublicRecord {
    readonly name: 'ApplicationError';
    readonly message: string;
    readonly code: ApplicationErrorCode;
    readonly kind: ApplicationErrorKind;
    readonly retryable: boolean;
    readonly impact: string;
    readonly action: string;
    readonly retainedState: string;
    readonly correlationId: string;
    readonly recovery?: ApplicationErrorRecovery;
}

const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isApplicationErrorCorrelationId(value: string): boolean {
    return CORRELATION_ID_PATTERN.test(value);
}

/** Semantic error contract whose public fields are safe to serialize and present. */
export class ApplicationError extends Error {
    override readonly name: 'ApplicationError';
    readonly code: ApplicationErrorCode;
    readonly kind: ApplicationErrorKind;
    readonly retryable: boolean;
    readonly impact: string;
    readonly action: string;
    readonly retainedState: string;
    readonly correlationId: string;
    readonly recovery?: ApplicationErrorRecovery;
    // The cause is intentionally debugger-only: no accessor or serializer may expose it.
    // eslint-disable-next-line no-unused-private-class-members
    readonly #cause?: unknown;

    constructor(code: ApplicationErrorCode, message: string, options: SemanticApplicationErrorOptions) {
        super(message);
        const metadata = APPLICATION_ERROR_METADATA[code];
        const correlationId = options.correlationId;
        if (!isApplicationErrorCorrelationId(correlationId)) {
            throw new TypeError('Application error correlation ID must be a lowercase UUID v4.');
        }
        if (options.retryable === true && !metadata.retryable) {
            throw new TypeError(`Retryability cannot be broadened for ${code}.`);
        }
        this.name = 'ApplicationError';
        this.code = code;
        this.kind = metadata.kind;
        this.retryable = options.retryable ?? metadata.retryable;
        this.impact = metadata.impact;
        this.action = metadata.action;
        this.retainedState = options.recovery?.id === 'change-size-reconciliation-failed'
            ? 'Completed effects were retained; the failed and later size operations remain unverified.'
            : metadata.retainedState;
        this.correlationId = correlationId;
        this.recovery = normalizeApplicationErrorRecovery(options.recovery);
        this.#cause = options.cause;
    }

    toJSON(): ApplicationErrorPublicRecord {
        return {
            name: 'ApplicationError',
            message: this.message,
            code: this.code,
            kind: this.kind,
            retryable: this.retryable,
            impact: this.impact,
            action: this.action,
            retainedState: this.retainedState,
            correlationId: this.correlationId,
            ...(this.recovery ? { recovery: this.recovery } : {}),
        };
    }
}

const RECOVERY_VARIABLE_KEYS: Readonly<Record<ApplicationErrorRecoveryId, readonly string[]>> = Object.freeze({
    'comment-command-length': Object.freeze(['command']),
    'comment-command-name-missing': Object.freeze(['command']),
    'comment-command-name-unknown': Object.freeze(['command']),
    'comment-command-argument-count': Object.freeze(['command']),
    'comment-command-arguments-unexpected': Object.freeze(['command']),
    'comment-command-arguments-missing': Object.freeze(['command']),
    'comment-command-finding-quoting': Object.freeze(['command']),
    'comment-command-review-format': Object.freeze(['command']),
    'comment-command-review-effort': Object.freeze(['command']),
    'comment-command-review-boolean': Object.freeze(['command']),
    'comment-command-review-option': Object.freeze(['command']),
    'comment-command-sync-option': Object.freeze(['command']),
    'comment-command-sync-parent': Object.freeze(['command']),
    'stored-configuration-schema-missing': Object.freeze(['issueNumber', 'expectedVersion']),
    'stored-configuration-schema-unsupported': Object.freeze(['issueNumber', 'expectedVersion', 'actualVersion']),
    'stored-configuration-invalid': Object.freeze(['issueNumber', 'expectedVersion']),
    'closed-issue-reconciliation-failed': Object.freeze(['resultId', 'phase', 'state', 'reason', 'changed', 'remaining']),
    'approval-evidence-read-failed': Object.freeze(['operation', 'reason', 'permission']),
    'change-size-reconciliation-failed': Object.freeze(['operation', 'issueNumber', 'targetNumber', 'projectIndex', 'verifiedOperations', 'pendingProjectSizes', 'providerStatus', 'providerReference']),

    'pull-request-link-restored': Object.freeze([]),
    'pull-request-link-base-retained': Object.freeze([]),
    'pull-request-link-reference-retained': Object.freeze([]),
    'pull-request-link-base-and-reference-retained': Object.freeze([]),
    'managed-branch-enrichment-failed': Object.freeze(['branchName']),
    'inactivity-explanation-failed': Object.freeze(['issueNumber']),
    'bugbot-review-blocks-pending': Object.freeze(['pendingCount']),
    'branch-sync-agent-disabled': Object.freeze(['command']),
    'branch-sync-fixer-unavailable': Object.freeze(['command']),
    'branch-sync-resolution-invalid': Object.freeze(['validationCode', 'command']),
    'branch-sync-verification-failed': Object.freeze(['stage', 'reason', 'command', 'commandIndex', 'childSha', 'restoration']),
    'sdd-draft-size-exceeded': Object.freeze([]),
    'sdd-catalog-unsupported-profile': Object.freeze([]),
    'sdd-catalog-format-invalid': Object.freeze([]),
    'sdd-draft-format-invalid': Object.freeze([]),
    'sdd-draft-case-identity-invalid': Object.freeze([]),
    'sdd-draft-case-budget-invalid': Object.freeze([]),
    'sdd-draft-requirement-mapping-invalid': Object.freeze([]),
    'sdd-draft-repository-path-invalid': Object.freeze([]),

    'workspace-changes-rejected': Object.freeze([]),
});

function normalizeApplicationErrorRecovery(
    recovery: ApplicationErrorRecovery | undefined,
): ApplicationErrorRecovery | undefined {
    if (!recovery) return undefined;
    if (!APPLICATION_ERROR_RECOVERY_IDS.includes(recovery.id)) {
        throw new TypeError('Application error recovery ID is invalid.');
    }
    const variables = recovery.variables as Readonly<Record<string, string | number>>;
    const actualKeys = Object.keys(variables).sort();
    const expectedKeys = [...RECOVERY_VARIABLE_KEYS[recovery.id]].sort();
    if (actualKeys.length !== expectedKeys.length
        || actualKeys.some((key, index) => key !== expectedKeys[index])) {
        throw new TypeError(`Application error recovery variables are invalid for ${recovery.id}.`);
    }
    if (isCopilotCommandValidationReason(recovery.id)
        && !isValidCopilotCommandValidation(recovery.id, variables.command)) {
        throw new TypeError('Comment command validation diagnostic is invalid.');
    }
    if (recovery.id.startsWith('stored-configuration-')
        && (![variables.issueNumber, variables.expectedVersion].every(value =>
            typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
            || (recovery.id === 'stored-configuration-schema-unsupported'
                && !(typeof variables.actualVersion === 'number'
                    && Number.isSafeInteger(variables.actualVersion) && variables.actualVersion >= 0)))) {
        throw new TypeError('Stored configuration diagnostic is invalid.');
    }
    if (recovery.id === 'managed-branch-enrichment-failed'
        && (typeof variables.branchName !== 'string'
            || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/u.test(variables.branchName))) {
        throw new TypeError('Application error recovery branch name is invalid.');
    }
    if (recovery.id === 'inactivity-explanation-failed'
        && (typeof variables.issueNumber !== 'number'
            || !Number.isSafeInteger(variables.issueNumber)
            || variables.issueNumber < 1)) {
        throw new TypeError('Application error recovery issue number is invalid.');
    }
    if (recovery.id === 'bugbot-review-blocks-pending'
        && (typeof variables.pendingCount !== 'number'
            || !Number.isSafeInteger(variables.pendingCount)
            || variables.pendingCount < 1)) {
        throw new TypeError('Application error recovery pending count is invalid.');
    }
    if ((recovery.id === 'branch-sync-agent-disabled' || recovery.id === 'branch-sync-fixer-unavailable' || recovery.id === 'branch-sync-resolution-invalid')
        && variables.command !== '/copilot sync-branch') {
        throw new TypeError('Application error recovery synchronization command is invalid.');
    }
    if (recovery.id === 'branch-sync-resolution-invalid'
        && !BRANCH_SYNC_VALIDATION_CODES.some(code => code === variables.validationCode)) {
        throw new TypeError('Application error recovery synchronization validation code is invalid.');
    }
    if (recovery.id === 'branch-sync-verification-failed' && !isBranchSyncVerificationFailure(variables)) {
        throw new TypeError('Branch synchronization verification diagnostic is invalid.');
    }
    if (recovery.id === 'closed-issue-reconciliation-failed'
        && (!CLOSED_ISSUE_RESULTS.some(value => value === variables.resultId)
            || !CLOSED_ISSUE_PHASES.some(value => value === variables.phase)
            || !['open', 'closed', 'unavailable'].includes(variables.state as string)
            || !CLOSED_ISSUE_REASONS.some(value => value === variables.reason)
            || ![variables.changed, variables.remaining].every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 3000))) {
        throw new TypeError('Closed issue reconciliation diagnostic is invalid.');
    }
    if (recovery.id === 'approval-evidence-read-failed'
        && (!Object.prototype.hasOwnProperty.call(APPROVAL_EVIDENCE_PERMISSIONS, variables.operation)
            || !APPROVAL_EVIDENCE_REASONS.some(reason => reason === variables.reason)
            || APPROVAL_EVIDENCE_PERMISSIONS[variables.operation as keyof typeof APPROVAL_EVIDENCE_PERMISSIONS] !== variables.permission)) {
        throw new TypeError('Approval evidence diagnostic is invalid.');
    }
    if (recovery.id === 'change-size-reconciliation-failed' && !isChangeSizeReconciliationFacts(variables)) {
        throw new TypeError('Change size reconciliation diagnostic is invalid.');
    }
    return Object.freeze({
        id: recovery.id,
        variables: Object.freeze({ ...variables }),
    }) as ApplicationErrorRecovery;
}
