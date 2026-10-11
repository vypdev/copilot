import {
    decidePullRequestApproval, decideApprovalChecks, decideApprovalBugbot, decideApprovalCoverage, decideApprovalReviews, isDocumentationOnlyDiff,
    type ApprovalDecision, type ApprovalEvidence,
} from '../../domain/pull_request_approval';
import { parsePullRequestApprovalPolicy } from '../../domain/pull_request_approval_policy';

export type PullRequestReadiness = 'unavailable' | 'pending' | 'blocked' | 'satisfied' | 'not-applicable';
export type ReadinessAction = 'retry' | 'wait' | 'resolve' | 'human-review' | 'observer' | 'select-pr' | 'none';
export interface PullRequestReadinessSnapshot {
    readonly readiness: PullRequestReadiness;
    readonly mode: 'off' | 'recommend' | 'guarded' | 'unavailable';
    readonly headSha: string;
    readonly baseSha: string;
    readonly code: string;
    readonly humanReviewRequired: boolean;
    readonly pullNumber?: number;
    readonly evidence?: Readonly<Record<'ci' | 'coverage' | 'bugbot' | 'reviews', PullRequestReadiness>>;
    readonly action?: ReadinessAction;
}
export interface ReadinessRevision {
    readonly repositoryId: number; readonly pullNumber: number; readonly headSha: string; readonly baseSha: string;
}
const objectId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
export function unavailablePullRequestReadiness(code = 'evidence-unavailable', action: ReadinessAction = 'retry'): PullRequestReadinessSnapshot {
    return Object.freeze({ readiness: 'unavailable', mode: 'unavailable', headSha: '', baseSha: '', code,
        humanReviewRequired: true, action, evidence: Object.freeze({ ci: 'unavailable', coverage: 'unavailable', bugbot: 'unavailable', reviews: 'unavailable' }) });
}
function state(decision: ApprovalDecision | undefined): PullRequestReadiness {
    return !decision || decision.status === 'already-approved' ? 'satisfied'
        : decision.status === 'pending' ? 'pending'
            : decision.code === 'reviews-unavailable' || decision.code === 'bugbot-incomplete' ? 'unavailable'
                : decision.status === 'blocked' ? 'blocked'
                    : decision.code === 'human-approved' ? 'satisfied' : 'not-applicable';
}
/** Uses the existing decision and the same canonical evidence gates, without an observer or a mutation. */
export function projectPullRequestReadiness(rawPolicy: string | undefined, evidence: ApprovalEvidence,
    final: ReadinessRevision & { readonly rawPolicy: string | undefined }): PullRequestReadinessSnapshot {
    let policy;
    try { policy = parsePullRequestApprovalPolicy(rawPolicy); }
    catch { return Object.freeze({ ...unavailablePullRequestReadiness('invalid-policy', 'resolve'), readiness: 'blocked' }); }
    if (!Number.isSafeInteger(evidence.repositoryId) || evidence.repositoryId <= 0 || !Number.isSafeInteger(evidence.pullNumber)
        || evidence.pullNumber <= 0 || !objectId(evidence.headSha) || !objectId(evidence.baseSha)
        || !objectId(final.headSha) || !objectId(final.baseSha)) return unavailablePullRequestReadiness('identity-unavailable');
    const sameTarget = evidence.repositoryId === final.repositoryId && evidence.pullNumber === final.pullNumber;
    if (!sameTarget || evidence.headSha !== final.headSha || evidence.baseSha !== final.baseSha || rawPolicy !== final.rawPolicy) {
        return Object.freeze({ readiness: 'pending', mode: policy.mode, headSha: final.headSha, baseSha: final.baseSha, code: 'superseded',
            humanReviewRequired: true, action: 'wait', evidence: Object.freeze({ ci: 'pending', coverage: 'pending', bugbot: 'pending', reviews: 'pending' }) });
    }
    const ci: PullRequestReadiness = !policy.producerAttested ? 'blocked' : !evidence.mergeCommitVerified || !objectId(evidence.testedMergeSha)
        ? 'pending' : state(decideApprovalChecks(policy, evidence));
    const coverage: PullRequestReadiness = policy.coverage.mode === 'check' ? ci
        : !policy.coverage.reporterAttested ? 'blocked' : !evidence.numericCoverage && !isDocumentationOnlyDiff(evidence.changedPaths)
            ? 'unavailable' : state(decideApprovalCoverage(policy, evidence));
    const bugbot = evidence.bugbotSeverity !== 'info' || evidence.bugbotDryRun ? 'blocked' : state(decideApprovalBugbot(policy, evidence));
    const reviews = state(decideApprovalReviews(policy, evidence));
    const groups = Object.freeze({ ci, coverage, bugbot, reviews });
    if (policy.mode === 'off') return Object.freeze({ readiness: 'not-applicable', mode: 'off', headSha: evidence.headSha,
        baseSha: evidence.baseSha, code: 'disabled', humanReviewRequired: false, action: 'none', evidence: groups });
    const decision = decidePullRequestApproval(policy, evidence);
    let readiness: PullRequestReadiness = decision.status === 'pending' ? 'pending' : decision.status === 'blocked' ? 'blocked'
        : decision.status === 'eligible' || decision.status === 'already-approved' || decision.code === 'recommend-mode' ? 'satisfied' : 'not-applicable';
    if (Object.values(groups).includes('unavailable')) readiness = 'unavailable';
    const action: ReadinessAction = decision.code === 'human-approved' || decision.status === 'already-approved' ? 'none' : readiness === 'unavailable' ? 'retry' : readiness === 'blocked' ? 'resolve' : readiness === 'pending' ? 'wait'
        : readiness === 'satisfied' && policy.mode === 'guarded' ? 'observer' : 'human-review';
    return Object.freeze({ readiness, mode: policy.mode, headSha: evidence.headSha, baseSha: evidence.baseSha,
        code: decision.code, humanReviewRequired: decision.code !== 'human-approved' && (policy.mode !== 'guarded' || (decision.status !== 'already-approved' && decision.status !== 'eligible')), evidence: groups, action });
}
