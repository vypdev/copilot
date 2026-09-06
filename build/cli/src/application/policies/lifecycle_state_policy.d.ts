import type { CopilotLifecycleState } from '../../domain/copilot_lifecycle';
import type { ExecutionInputs } from '../../data/model/execution_inputs';
export type LifecycleChecksEvidence = 'pending' | 'success' | 'failure';
export type LifecycleReviewEvidence = 'approved' | 'changes-requested' | 'commented' | 'dismissed';
export declare const LIFECYCLE_VALIDATION_WORKFLOWS: readonly ["CI Check"];
export interface LifecycleExternalEvidence {
    readonly checks?: LifecycleChecksEvidence;
    readonly review?: LifecycleReviewEvidence;
}
export interface LifecycleStatePolicyResult {
    readonly id: string;
    readonly success: boolean;
    readonly executed: boolean;
    readonly steps: readonly string[];
    readonly errors: readonly unknown[];
    readonly payload?: unknown;
}
export interface LifecycleStateDecisionInput {
    readonly eventName: string;
    readonly action: string;
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly issueOpened: boolean;
    readonly issueDescriptionEdited: boolean;
    readonly pullRequestMerged: boolean;
    readonly pullRequestClosed: boolean;
    readonly externalEvidence?: LifecycleExternalEvidence;
    readonly results: readonly LifecycleStatePolicyResult[];
}
/** Resolves the next lifecycle state from application facts, never from labels or API responses. */
export declare function resolveLifecycleState(input: LifecycleStateDecisionInput): CopilotLifecycleState | undefined;
/** Extracts only stable review/check facts from GitHub event payloads. */
export declare function readLifecycleExternalEvidence(inputs: ExecutionInputs | undefined, currentPullRequestHeadSha?: string): LifecycleExternalEvidence | undefined;
