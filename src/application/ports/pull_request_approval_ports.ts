import type { ApprovalDecision, ApprovalEvidence } from '../../domain/pull_request_approval';

export interface ApprovalObservationTarget {
    readonly owner: string;
    readonly repository: string;
    readonly repositoryId: number;
    readonly pullNumber: number;
}

export interface ApprovalPostedReview {
    readonly id: number;
    readonly commitId: string;
    readonly userId: number;
    readonly state: string;
}

/** Semantic provider operations; the use case never sees Octokit response DTOs. */
export interface PullRequestApprovalPort {
    readPolicy(target: ApprovalObservationTarget): Promise<string | undefined>;
    loadEvidence(target: ApprovalObservationTarget): Promise<ApprovalEvidence>;
    submitApproval(target: ApprovalObservationTarget, headSha: string, body: string): Promise<ApprovalPostedReview>;
    publishAssessment(target: ApprovalObservationTarget, evidence: ApprovalEvidence, decision: ApprovalDecision, reviewId?: number): Promise<void>;
}
