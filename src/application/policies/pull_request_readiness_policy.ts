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
        humanReviewRequired: false, action, evidence: Object.freeze({ ci: 'unavailable', coverage: 'unavailable', bugbot: 'unavailable', reviews: 'unavailable' }) });
}
/** A verified disabled policy is independent of whether optional native facts were readable. */
export function disabledPullRequestReadiness(): PullRequestReadinessSnapshot {
    return Object.freeze({ ...unavailablePullRequestReadiness(), readiness: 'not-applicable', mode: 'off', code: 'disabled',
        humanReviewRequired: false, action: 'none' });
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
    if (!Number.isSafeInteger(final.repositoryId) || final.repositoryId <= 0 || !Number.isSafeInteger(final.pullNumber)
        || final.pullNumber <= 0) return unavailablePullRequestReadiness('identity-unavailable');
    let policy;
    try {
        const finalPolicy = parsePullRequestApprovalPolicy(final.rawPolicy);
        if (finalPolicy.mode === 'off' && rawPolicy !== final.rawPolicy) return disabledPullRequestReadiness();
        policy = parsePullRequestApprovalPolicy(rawPolicy);
    }
    catch { return Object.freeze({ ...unavailablePullRequestReadiness('invalid-policy', 'resolve'), readiness: 'blocked' }); }
    if (policy.mode === 'off' && rawPolicy !== final.rawPolicy) return unavailablePullRequestReadiness('policy-superseded');
    if (!Number.isSafeInteger(evidence.repositoryId) || evidence.repositoryId <= 0 || !Number.isSafeInteger(evidence.pullNumber)
        || evidence.pullNumber <= 0 || !objectId(evidence.headSha) || !objectId(evidence.baseSha)
        || !objectId(final.headSha) || !objectId(final.baseSha)) return policy.mode === 'off' ? disabledPullRequestReadiness() : unavailablePullRequestReadiness('identity-unavailable');
    const sameTarget = evidence.repositoryId === final.repositoryId && evidence.pullNumber === final.pullNumber;
    if (!sameTarget || evidence.headSha !== final.headSha || evidence.baseSha !== final.baseSha || rawPolicy !== final.rawPolicy) {
        if (policy.mode === 'off') return disabledPullRequestReadiness();
        return Object.freeze({ readiness: 'pending', mode: policy.mode, headSha: final.headSha, baseSha: final.baseSha, code: 'superseded',
            humanReviewRequired: false, action: 'wait', evidence: Object.freeze({ ci: 'pending', coverage: 'pending', bugbot: 'pending', reviews: 'pending' }) });
    }
    const checkBoundary: PullRequestReadiness | undefined = !policy.producerAttested ? 'blocked'
        : !evidence.mergeCommitVerified || !objectId(evidence.testedMergeSha) ? 'pending' : undefined;
    const ci: PullRequestReadiness = checkBoundary ?? state(decideApprovalChecks(policy, evidence));
    const coverage: PullRequestReadiness = policy.coverage.mode === 'check'
        ? checkBoundary ?? state(decideApprovalChecks({ ...policy,
            testChecks: policy.testChecks.filter(check => check.name === policy.coverage.checkName),
        }, { ...evidence, requiredChecks: [policy.coverage.checkName] }))
        : !policy.coverage.reporterAttested ? 'blocked' : !evidence.numericCoverage && !isDocumentationOnlyDiff(evidence.changedPaths)
            ? 'unavailable' : state(decideApprovalCoverage(policy, evidence));
    const bugbot = evidence.bugbotSeverity !== 'info' || evidence.bugbotDryRun ? 'blocked' : state(decideApprovalBugbot(policy, evidence));
    const reviews = state(decideApprovalReviews(policy, evidence));
    const groups = Object.freeze({ ci, coverage, bugbot, reviews });
    if (policy.mode === 'off') return Object.freeze({ readiness: 'not-applicable', mode: 'off', headSha: evidence.headSha,
        baseSha: evidence.baseSha, code: 'disabled', humanReviewRequired: false, action: 'none', evidence: groups });
    const decision = decidePullRequestApproval(policy, evidence);
    let readiness: PullRequestReadiness = decision.status === 'pending' ? 'pending' : decision.status === 'blocked' ? 'blocked'
        : decision.status === 'eligible' || decision.status === 'already-approved' || decision.code === 'recommend-mode' || decision.code === 'human-approved' ? 'satisfied' : 'not-applicable';
    if (!evidence.filesComplete || Object.values(groups).includes('unavailable')) readiness = 'unavailable';
    const action: ReadinessAction = decision.code === 'human-approved' || decision.status === 'already-approved' ? 'none' : readiness === 'unavailable' ? 'retry' : readiness === 'blocked' ? 'resolve' : readiness === 'pending' ? 'wait'
        : readiness === 'satisfied' && policy.mode === 'guarded' ? 'observer' : 'human-review';
    return Object.freeze({ readiness, mode: policy.mode, headSha: evidence.headSha, baseSha: evidence.baseSha,
        code: evidence.filesComplete ? decision.code : 'evidence-unavailable', humanReviewRequired: readiness === 'satisfied' && policy.mode === 'recommend' && decision.code !== 'human-approved', evidence: groups, action });
}
