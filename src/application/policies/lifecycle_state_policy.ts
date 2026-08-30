import type { CopilotLifecycleState } from '../../domain/copilot_lifecycle';
import { getResultPayload } from '../../data/model/result';

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
export function resolveLifecycleState(
    input: LifecycleStateDecisionInput,
): CopilotLifecycleState | undefined {
    if (!input.isIssue && !input.isPullRequest) return undefined;
    if (hasFailure(input.results)) return 'blocked';

    if (input.isPullRequest) {
        if (input.pullRequestClosed && input.pullRequestMerged) return 'verified';
        const findingState = input.results
            .map(result => getResultPayload(result.payload)?.findingStates)
            .find(isFindingStateCounts);
        if (findingState && (findingState.open > 0 || findingState.reopened > 0)) return 'changes-requested';
        if (findingState && findingState.open === 0 && findingState.reopened === 0) return 'ready';
        if (['opened', 'reopened', 'synchronize'].includes(input.action)) return 'reviewing';
        return undefined;
    }

    if (hasResult(input.results, 'PrepareBranchesUseCase')) return 'in-progress';
    if (hasSuccessfulResult(input.results, 'RecommendStepsUseCase')) return 'planned';
    if (hasExplicitPlanningCommand(input.results)) return 'planned';
    if (input.issueOpened || input.issueDescriptionEdited) return 'analyzing';
    return undefined;
}

function isFindingStateCounts(value: unknown): value is { open: number; reopened: number } {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { open?: unknown }).open === 'number'
        && typeof (value as { reopened?: unknown }).reopened === 'number';
}

function hasExplicitPlanningCommand(results: readonly LifecycleStatePolicyResult[]): boolean {
    return results.some(result => {
        const payload = getResultPayload(result.payload);
        return result.executed
            && result.success
            && typeof payload?.explicitCommand === 'string'
            && ['plan', 'clarify', 'estimate', 'test-plan'].includes(payload.explicitCommand);
    });
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
