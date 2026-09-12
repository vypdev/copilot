export type ApplicationErrorKind = 'configuration' | 'authorization' | 'provider' | 'agent' | 'validation' | 'workflow' | 'unknown';
export type ApplicationErrorCode = 'configuration.invalid' | 'configuration.unsupported' | 'authorization.denied' | 'authorization.credential-invalid' | 'provider.not-found' | 'provider.conflict' | 'provider.rate-limited' | 'provider.unavailable' | 'provider.contract-invalid' | 'agent.policy-rejected' | 'agent.failed' | 'validation.invalid-input' | 'workflow.invalid-event' | 'workflow.stale' | 'workflow.cancelled' | 'workflow.failed' | 'timeout' | 'unexpected';
interface ApplicationErrorMetadata {
    readonly kind: ApplicationErrorKind;
    readonly retryable: boolean;
    readonly impact: string;
    readonly action: string;
    readonly retainedState: string;
}
export declare const APPLICATION_ERROR_METADATA: Readonly<Record<ApplicationErrorCode, ApplicationErrorMetadata>>;
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
export declare function isApplicationErrorCorrelationId(value: string): boolean;
/** Semantic error contract whose public fields are safe to serialize and present. */
export declare class ApplicationError extends Error {
    #private;
    readonly name: 'ApplicationError';
    readonly code: ApplicationErrorCode;
    readonly kind: ApplicationErrorKind;
    readonly retryable: boolean;
    readonly impact: string;
    readonly action: string;
    readonly retainedState: string;
    readonly correlationId: string;
    constructor(code: ApplicationErrorCode, message: string, options: SemanticApplicationErrorOptions);
    toJSON(): ApplicationErrorPublicRecord;
}
export {};
