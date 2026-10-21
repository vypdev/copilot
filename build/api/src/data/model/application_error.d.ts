import { type ClosedIssueReconciliationFacts } from '../../domain/closed_issue_reconciliation';
import { type ApprovalEvidenceDiagnostic } from '../../domain/approval_evidence_diagnostic';
import { type BranchSyncValidationCode } from '../../domain/branch_sync_validation';
export type ApplicationErrorKind = 'configuration' | 'authorization' | 'provider' | 'agent' | 'validation' | 'workflow' | 'unknown';
export type ApplicationErrorCode = 'configuration.invalid' | 'configuration.unsupported' | 'authorization.denied' | 'authorization.credential-invalid' | 'provider.not-found' | 'provider.conflict' | 'provider.rate-limited' | 'provider.unavailable' | 'provider.contract-invalid' | 'agent.policy-rejected' | 'agent.failed' | 'locale.output-invalid' | 'locale.translation-failed' | 'validation.invalid-input' | 'validation.evidence-too-large' | 'validation.evidence-unavailable' | 'workflow.invalid-event' | 'workflow.stale' | 'workflow.cancelled' | 'workflow.failed' | 'workflow.presentation-pending' | 'timeout' | 'unexpected';
export declare const APPLICATION_ERROR_RECOVERY_IDS: readonly ["pull-request-link-restored", "pull-request-link-base-retained", "pull-request-link-reference-retained", "pull-request-link-base-and-reference-retained", "managed-branch-enrichment-failed", "inactivity-explanation-failed", "bugbot-review-blocks-pending", "branch-sync-agent-disabled", "branch-sync-fixer-unavailable", "branch-sync-resolution-invalid", "sdd-draft-size-exceeded", "sdd-draft-format-invalid", "sdd-draft-case-identity-invalid", "sdd-draft-case-budget-invalid", "sdd-draft-requirement-mapping-invalid", "sdd-draft-repository-path-invalid", "workspace-changes-rejected", "closed-issue-reconciliation-failed", "approval-evidence-read-failed", "stored-configuration-schema-missing", "stored-configuration-schema-unsupported", "stored-configuration-invalid"];
export type ApplicationErrorRecoveryId = typeof APPLICATION_ERROR_RECOVERY_IDS[number];
interface ApplicationErrorRecoveryVariables {
    readonly 'stored-configuration-schema-missing': Readonly<{
        issueNumber: number;
        expectedVersion: number;
    }>;
    readonly 'stored-configuration-schema-unsupported': Readonly<{
        issueNumber: number;
        expectedVersion: number;
        actualVersion: number;
    }>;
    readonly 'stored-configuration-invalid': Readonly<{
        issueNumber: number;
        expectedVersion: number;
    }>;
    readonly 'closed-issue-reconciliation-failed': ClosedIssueReconciliationFacts;
    readonly 'approval-evidence-read-failed': ApprovalEvidenceDiagnostic;
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
    readonly 'branch-sync-agent-disabled': Readonly<{
        command: '/copilot sync-branch';
    }>;
    readonly 'branch-sync-fixer-unavailable': Readonly<{
        command: '/copilot sync-branch';
    }>;
    readonly 'branch-sync-resolution-invalid': Readonly<{
        validationCode: BranchSyncValidationCode;
        command: '/copilot sync-branch';
    }>;
    readonly 'sdd-draft-size-exceeded': Readonly<Record<string, never>>;
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
