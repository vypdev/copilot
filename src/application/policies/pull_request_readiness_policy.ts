import { decidePullRequestApproval, type ApprovalDecision, type ApprovalEvidence } from '../../domain/pull_request_approval';
import { parsePullRequestApprovalPolicy, type PullRequestApprovalPolicy } from '../../domain/pull_request_approval_policy';

export type PullRequestReadiness = 'unavailable' | 'pending' | 'blocked' | 'satisfied' | 'not-applicable';

export interface PullRequestReadinessSnapshot {
    readonly readiness: PullRequestReadiness;
    readonly mode: 'off' | 'recommend' | 'guarded' | 'unavailable';
    readonly headSha: string;
    readonly baseSha: string;
    readonly code: string;
    readonly humanReviewRequired: boolean;
}

/** Projects the canonical approval policy into a read-only user-facing status. */
export function projectPullRequestReadiness(
    rawPolicy: string | undefined,
    evidence: ApprovalEvidence,
    final: { readonly repositoryId: number; readonly pullNumber: number; readonly headSha: string; readonly baseSha: string; readonly rawPolicy: string | undefined },
): PullRequestReadinessSnapshot {
    let policy: PullRequestApprovalPolicy;
    try { policy = parsePullRequestApprovalPolicy(rawPolicy); }
    catch { return { readiness: 'unavailable', mode: 'off', headSha: evidence.headSha, baseSha: evidence.baseSha, code: 'policy-unavailable', humanReviewRequired: false }; }
    const sameTarget = evidence.repositoryId === final.repositoryId && evidence.pullNumber === final.pullNumber;
    if (!sameTarget || evidence.headSha !== final.headSha || evidence.baseSha !== final.baseSha || rawPolicy !== final.rawPolicy) {
        return { readiness: 'pending', mode: policy.mode, headSha: final.headSha, baseSha: final.baseSha, code: 'superseded', humanReviewRequired: true };
    }
    if (policy.mode === 'off') return { readiness: 'not-applicable', mode: policy.mode, headSha: evidence.headSha, baseSha: evidence.baseSha, code: 'disabled', humanReviewRequired: false };
    const decision: ApprovalDecision = decidePullRequestApproval(policy, evidence);
    const readiness = decision.status === 'pending' ? 'pending'
        : decision.status === 'blocked' ? 'blocked'
            : decision.status === 'eligible' || decision.status === 'already-approved'
                || decision.status === 'recommend' && decision.code === 'recommend-mode' ? 'satisfied'
                : 'not-applicable';
    return { readiness, mode: policy.mode, headSha: evidence.headSha, baseSha: evidence.baseSha,
        code: decision.code, humanReviewRequired: policy.mode !== 'guarded' || decision.status !== 'already-approved' };
}
