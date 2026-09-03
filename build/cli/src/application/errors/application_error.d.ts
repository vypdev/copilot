export type ApplicationErrorKind = 'configuration' | 'authorization' | 'provider' | 'agent' | 'validation' | 'workflow' | 'unknown';
export interface ApplicationErrorOptions {
    readonly retryable?: boolean;
    readonly cause?: unknown;
}
/** Semantic error contract: safe to publish, while the original cause stays available to diagnostics. */
export declare class ApplicationError extends Error {
    readonly kind: ApplicationErrorKind;
    readonly retryable: boolean;
    readonly cause?: unknown;
    constructor(message: string, kind?: ApplicationErrorKind, options?: ApplicationErrorOptions);
}
export declare function toApplicationError(error: unknown, message: string, kind?: ApplicationErrorKind, options?: ApplicationErrorOptions): ApplicationError;
