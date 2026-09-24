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
    | 'workflow.invalid-event'
    | 'workflow.stale'
    | 'workflow.cancelled'
    | 'workflow.failed'
    | 'workflow.presentation-pending'
    | 'timeout'
    | 'unexpected';

export const APPLICATION_ERROR_RECOVERY_IDS = Object.freeze([
    'pull-request-link-restored',
    'pull-request-link-base-retained',
    'pull-request-link-reference-retained',
    'pull-request-link-base-and-reference-retained',
    'managed-branch-enrichment-failed',
    'inactivity-explanation-failed',
    'bugbot-review-blocks-pending',
] as const);

export type ApplicationErrorRecoveryId = typeof APPLICATION_ERROR_RECOVERY_IDS[number];

interface ApplicationErrorRecoveryVariables {
    readonly 'pull-request-link-restored': Readonly<Record<string, never>>;
    readonly 'pull-request-link-base-retained': Readonly<Record<string, never>>;
    readonly 'pull-request-link-reference-retained': Readonly<Record<string, never>>;
    readonly 'pull-request-link-base-and-reference-retained': Readonly<Record<string, never>>;
    readonly 'managed-branch-enrichment-failed': Readonly<{ branchName: string }>;
    readonly 'inactivity-explanation-failed': Readonly<{ issueNumber: number }>;
    readonly 'bugbot-review-blocks-pending': Readonly<{ pendingCount: number }>;
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
        this.retainedState = metadata.retainedState;
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
    'pull-request-link-restored': Object.freeze([]),
    'pull-request-link-base-retained': Object.freeze([]),
    'pull-request-link-reference-retained': Object.freeze([]),
    'pull-request-link-base-and-reference-retained': Object.freeze([]),
    'managed-branch-enrichment-failed': Object.freeze(['branchName']),
    'inactivity-explanation-failed': Object.freeze(['issueNumber']),
    'bugbot-review-blocks-pending': Object.freeze(['pendingCount']),
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
    return Object.freeze({
        id: recovery.id,
        variables: Object.freeze({ ...variables }),
    }) as ApplicationErrorRecovery;
}
