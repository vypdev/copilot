import type { CopilotLifecycleState } from '../../domain/copilot_lifecycle';
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
    readonly results: readonly LifecycleStatePolicyResult[];
}
/** Resolves the next lifecycle state from application facts, never from labels or API responses. */
export declare function resolveLifecycleState(input: LifecycleStateDecisionInput): CopilotLifecycleState | undefined;
