export type ApplicationErrorKind = 'configuration' | 'authorization' | 'provider' | 'agent' | 'validation' | 'workflow' | 'unknown';
export type ApplicationErrorCode = 'configuration.invalid' | 'configuration.unsupported' | 'authorization.denied' | 'authorization.credential-invalid' | 'provider.not-found' | 'provider.conflict' | 'provider.rate-limited' | 'provider.unavailable' | 'provider.contract-invalid' | 'agent.policy-rejected' | 'agent.failed' | 'locale.output-invalid' | 'locale.translation-failed' | 'validation.invalid-input' | 'workflow.invalid-event' | 'workflow.stale' | 'workflow.cancelled' | 'workflow.failed' | 'workflow.presentation-pending' | 'timeout' | 'unexpected';
export declare const APPLICATION_ERROR_RECOVERY_IDS: readonly ["pull-request-link-restored", "pull-request-link-base-retained", "pull-request-link-reference-retained", "pull-request-link-base-and-reference-retained", "managed-branch-enrichment-failed", "inactivity-explanation-failed", "bugbot-review-blocks-pending"];
export type ApplicationErrorRecoveryId = typeof APPLICATION_ERROR_RECOVERY_IDS[number];
interface ApplicationErrorRecoveryVariables {
    readonly 'pull-request-link-restored': Readonly<Record<string, never>>;
    readonly 'pull-request-link-base-retained': Readonly<Record<string, never>>;
    readonly 'pull-request-link-reference-retained': Readonly<Record<string, never>>;
    readonly 'pull-request-link-base-and-reference-retained': Readonly<Record<string, never>>;
    readonly 'managed-branch-enrichment-failed': Readonly<{
        branchName: string;
    }>;
    readonly 'inactivity-explanation-failed': Readonly<{
        issueNumber: number;
    }>;
    readonly 'bugbot-review-blocks-pending': Readonly<{
        pendingCount: number;
    }>;
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
export declare const APPLICATION_ERROR_METADATA: Readonly<Record<ApplicationErrorCode, ApplicationErrorMetadata>>;
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
    readonly recovery?: ApplicationErrorRecovery;
    constructor(code: ApplicationErrorCode, message: string, options: SemanticApplicationErrorOptions);
    toJSON(): ApplicationErrorPublicRecord;
}
export {};
