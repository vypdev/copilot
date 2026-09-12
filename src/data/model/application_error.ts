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
    | 'validation.invalid-input'
    | 'workflow.invalid-event'
    | 'workflow.stale'
    | 'workflow.cancelled'
    | 'workflow.failed'
    | 'timeout'
    | 'unexpected';

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
    readonly impact?: string;
    readonly action?: string;
    readonly retainedState?: string;
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
        this.impact = options.impact ?? metadata.impact;
        this.action = options.action ?? metadata.action;
        this.retainedState = options.retainedState ?? metadata.retainedState;
        this.correlationId = correlationId;
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
        };
    }
}
