import type { CopilotLifecycleState } from '../../domain/copilot_lifecycle';

export interface LifecycleStatePolicyResult {
    readonly id: string;
    readonly success: boolean;
    readonly executed: boolean;
    readonly steps: readonly string[];
    readonly errors: readonly unknown[];
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
export function resolveLifecycleState(
    input: LifecycleStateDecisionInput,
): CopilotLifecycleState | undefined {
    if (!input.isIssue && !input.isPullRequest) return undefined;
    if (hasFailure(input.results)) return 'blocked';

    if (input.isPullRequest) {
        if (input.pullRequestClosed && input.pullRequestMerged) return 'verified';
        if (['opened', 'reopened', 'synchronize'].includes(input.action)) return 'reviewing';
        return undefined;
    }

    if (hasResult(input.results, 'PrepareBranchesUseCase')) return 'in-progress';
    if (hasSuccessfulResult(input.results, 'RecommendStepsUseCase')) return 'planned';
    if (input.issueOpened || input.issueDescriptionEdited) return 'analyzing';
    return undefined;
}

function hasFailure(results: readonly LifecycleStatePolicyResult[]): boolean {
    return results.some(result => result.executed && (!result.success || result.errors.length > 0));
}

function hasResult(results: readonly LifecycleStatePolicyResult[], id: string): boolean {
    return results.some(result => result.id === id && result.executed && result.success);
}

function hasSuccessfulResult(results: readonly LifecycleStatePolicyResult[], id: string): boolean {
    return hasResult(results, id);
}

