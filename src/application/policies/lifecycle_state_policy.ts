import type { CopilotLifecycleState } from '../../domain/copilot_lifecycle';
import { getResultPayload } from '../../data/model/result';
import type { ApplicationError } from '../../data/model/application_error';
import { projectBugbotResultFindingStates } from './bugbot_result_finding_state_projection_policy';
import { projectBugbotResultTelemetry } from './bugbot_telemetry_projection_policy';
import { countActionableBugbotFindings } from '../../domain/bugbot/review_state';

export type LifecycleChecksEvidence = 'pending' | 'success' | 'failure';
export type LifecycleReviewEvidence = 'approved' | 'changes-requested' | 'commented' | 'dismissed';

export interface LifecycleExternalEvidence {
    readonly checks?: LifecycleChecksEvidence;
    readonly review?: LifecycleReviewEvidence;
}

export type LifecycleExternalEvidenceSource =
    | { readonly kind: 'none' }
    | {
        readonly kind: 'pull-request-review';
        readonly headSha?: string;
        readonly state?: string;
    }
    | {
        readonly kind: 'check-suite' | 'workflow-run';
        readonly headSha?: string;
        readonly status?: string;
        readonly conclusion?: string | null;
    };

export interface LifecycleStatePolicyResult {
    readonly id: string;
    readonly success: boolean;
    readonly executed: boolean;
    readonly steps: readonly string[];
    readonly errors: readonly ApplicationError[];
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
        const findingState = projectBugbotResultFindingStates(input.results);
        if (findingState.status === 'invalid') return 'blocked';
        const reviewTelemetry = projectBugbotResultTelemetry(input.results);
        if (reviewTelemetry.status === 'valid' && reviewTelemetry.telemetry.outcome === 'partial') {
            return 'blocked';
        }
        if (findingState.status === 'valid' && findingState.counts.unknown > 0) return 'blocked';
        if (findingState.status === 'valid' && countActionableBugbotFindings(findingState.counts) > 0) return 'changes-requested';
        if (findingState.status === 'valid') return 'ready';
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
    source: LifecycleExternalEvidenceSource,
    currentPullRequestHeadSha?: string,
): LifecycleExternalEvidence | undefined {
    if (source.kind === 'none') return undefined;
    if (source.kind === 'pull-request-review') {
        if (!isCurrentValidationEvidence(source.headSha, currentPullRequestHeadSha)) return undefined;
        const reviewState = source.state?.trim().toLowerCase();
        if (reviewState === 'approved') return { review: 'approved' };
        if (reviewState === 'changes_requested') return { review: 'changes-requested' };
        if (reviewState === 'dismissed') return { review: 'dismissed' };
        if (reviewState === 'commented') return { review: 'commented' };
        return undefined;
    }
    if (!isCurrentValidationEvidence(source.headSha, currentPullRequestHeadSha)) return undefined;
    return { checks: readChecksEvidence(source.status, source.conclusion) };
}

function isCurrentValidationEvidence(
    evidenceHeadSha: string | undefined,
    currentPullRequestHeadSha: string | undefined,
): boolean {
    if (!evidenceHeadSha || !currentPullRequestHeadSha) return false;
    return evidenceHeadSha.trim() === currentPullRequestHeadSha.trim();
}

function readChecksEvidence(status: string | undefined, conclusion: string | null | undefined): LifecycleChecksEvidence {
    if (status?.trim().toLowerCase() !== 'completed') return 'pending';
    return conclusion?.trim().toLowerCase() === 'success' ? 'success' : 'failure';
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
