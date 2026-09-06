import type { CopilotLifecycleState } from '../../domain/copilot_lifecycle';
import { getResultPayload } from '../../data/model/result';
import type { ExecutionInputs } from '../../data/model/execution_inputs';

export type LifecycleChecksEvidence = 'pending' | 'success' | 'failure';
export type LifecycleReviewEvidence = 'approved' | 'changes-requested' | 'commented' | 'dismissed';
export const LIFECYCLE_VALIDATION_WORKFLOWS = ['CI Check'] as const;

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
export function resolveLifecycleState(
    input: LifecycleStateDecisionInput,
): CopilotLifecycleState | undefined {
    if (!input.isIssue && !input.isPullRequest) return undefined;
    if (hasFailure(input.results)) return 'blocked';

    if (input.isPullRequest) {
        if (input.pullRequestClosed && input.pullRequestMerged) return 'verified';
        if (input.externalEvidence?.checks === 'failure') return 'blocked';
        if (input.externalEvidence?.review === 'changes-requested') return 'changes-requested';
        const findingState = input.results
            .map(result => getResultPayload(result.payload)?.findingStates)
            .find(isFindingStateCounts);
        if (findingState && (findingState.open > 0 || findingState.reopened > 0)) return 'changes-requested';
        if (findingState && findingState.open === 0 && findingState.reopened === 0) return 'ready';
        if (input.externalEvidence?.checks === 'pending') return 'reviewing';
        if (input.externalEvidence?.review === 'approved') return 'ready';
        if (input.externalEvidence?.checks === 'success') return 'reviewing';
        if (input.externalEvidence?.review !== undefined) return 'reviewing';
        if (['opened', 'reopened', 'synchronize'].includes(input.action)) return 'reviewing';
        return undefined;
    }

    if (hasResult(input.results, 'PrepareBranchesUseCase')) return 'in-progress';
    if (hasSuccessfulResult(input.results, 'RecommendStepsUseCase')) return 'planned';
    if (hasExplicitPlanningCommand(input.results)) return 'planned';
    return undefined;
}

/** Extracts only stable review/check facts from GitHub event payloads. */
export function readLifecycleExternalEvidence(
    inputs: ExecutionInputs | undefined,
    currentPullRequestHeadSha?: string,
): LifecycleExternalEvidence | undefined {
    if (!inputs) return undefined;
    if (inputs.eventName === 'pull_request_review') {
        const reviewState = inputs.review?.state?.trim().toLowerCase();
        if (reviewState === 'approved') return { review: 'approved' };
        if (reviewState === 'changes_requested') return { review: 'changes-requested' };
        if (reviewState === 'dismissed') return { review: 'dismissed' };
        if (reviewState === 'commented') return { review: 'commented' };
        return undefined;
    }
    if (inputs.eventName === 'check_suite') {
        if (!isCurrentValidationEvidence(
            inputs.check_suite?.workflow_name,
            inputs.check_suite?.head_sha,
            currentPullRequestHeadSha,
        )) return undefined;
        return { checks: readChecksEvidence(inputs.check_suite?.status, inputs.check_suite?.conclusion) };
    }
    if (inputs.eventName === 'workflow_run') {
        if (!isCurrentValidationEvidence(
            inputs.workflow_run?.name,
            inputs.workflow_run?.head_sha,
            currentPullRequestHeadSha,
        )) return undefined;
        return { checks: readChecksEvidence(inputs.workflow_run?.status, inputs.workflow_run?.conclusion) };
    }
    return undefined;
}

function isCurrentValidationEvidence(
    workflowName: string | undefined,
    evidenceHeadSha: string | undefined,
    currentPullRequestHeadSha: string | undefined,
): boolean {
    if (!workflowName || !evidenceHeadSha || !currentPullRequestHeadSha) return false;
    const normalizedName = workflowName.trim().toLowerCase();
    return LIFECYCLE_VALIDATION_WORKFLOWS.some(name => name.toLowerCase() === normalizedName)
        && evidenceHeadSha.trim() === currentPullRequestHeadSha.trim();
}

function readChecksEvidence(status: string | undefined, conclusion: string | null | undefined): LifecycleChecksEvidence {
    if (status?.trim().toLowerCase() !== 'completed') return 'pending';
    return conclusion?.trim().toLowerCase() === 'success' ? 'success' : 'failure';
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
