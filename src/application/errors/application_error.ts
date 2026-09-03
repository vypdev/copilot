export type ApplicationErrorKind =
    | 'configuration'
    | 'authorization'
    | 'provider'
    | 'agent'
    | 'validation'
    | 'workflow'
    | 'unknown';

export interface ApplicationErrorOptions {
    readonly retryable?: boolean;
    readonly cause?: unknown;
}

/** Semantic error contract: safe to publish, while the original cause stays available to diagnostics. */
export class ApplicationError extends Error {
    readonly kind: ApplicationErrorKind;
    readonly retryable: boolean;
    readonly cause?: unknown;

    constructor(message: string, kind: ApplicationErrorKind = 'unknown', options: ApplicationErrorOptions = {}) {
        super(message);
        this.name = 'ApplicationError';
        this.kind = kind;
        this.retryable = options.retryable ?? false;
        this.cause = options.cause;
    }
}

export function toApplicationError(
    error: unknown,
    message: string,
    kind: ApplicationErrorKind = 'unknown',
    options: ApplicationErrorOptions = {},
): ApplicationError {
    return error instanceof ApplicationError
        ? error
        : new ApplicationError(message, kind, { ...options, cause: error });
}
