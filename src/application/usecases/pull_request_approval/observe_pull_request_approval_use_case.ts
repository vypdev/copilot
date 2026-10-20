import { ApplicationError } from '../../errors/application_error';
import { approvalDiagnosticError, approvalEvidenceError } from '../../errors/approval_evidence_error';
import { decidePullRequestApproval, type ApprovalDecision, type ApprovalEvidence } from '../../../domain/pull_request_approval';
import { parsePullRequestApprovalPolicy } from '../../../domain/pull_request_approval_policy';
import type { ApprovalObservationTarget, PullRequestApprovalPort } from '../../ports/pull_request_approval_ports';

export interface ApprovalObservationResult {
    readonly failure?: ApplicationError;
    readonly decision: ApprovalDecision;
    readonly headSha?: string;
    readonly evidence?: ApprovalEvidence;
    readonly mode?: 'off' | 'recommend' | 'guarded';
    readonly reviewId?: number;
    readonly publication: 'not-applicable' | 'published' | 'failed';
}

/** Read-first replay and exact-revision guard around the non-atomic GitHub review API. */
export class ObservePullRequestApprovalUseCase {
    constructor(private readonly port: PullRequestApprovalPort) {}

    async execute(target: ApprovalObservationTarget): Promise<ApprovalObservationResult> {
        let policy;
        let rawPolicy: string | undefined;
        try {
            rawPolicy = await this.port.readPolicy(target);
        } catch {
            return {
                decision: { status: 'blocked', code: 'policy-unavailable', detail: 'The installed PR approval policy could not be read from GitHub. Verify the runtime PAT can read Actions Variables, then rerun the observer. Existing PRs and reviews are unchanged.' },
                publication: 'not-applicable',
            };
        }
        try {
            policy = parsePullRequestApprovalPolicy(rawPolicy);
        } catch {
            return {
                decision: { status: 'blocked', code: 'invalid-policy', detail: 'The installed PR approval policy is invalid; run copilot doctor.' },
                publication: 'not-applicable',
            };
        }
        if (policy.mode === 'off') {
            return { decision: { status: 'off', code: 'disabled', detail: 'Automatic approval is disabled.' }, mode: 'off', publication: 'not-applicable' };
        }
        let initial: ApprovalEvidence;
        try {
            initial = await this.port.loadEvidence(target);
        } catch (cause) {
            return {
                failure: evidenceFailure(cause),
                decision: { status: 'blocked', code: 'evidence-unavailable', detail: 'GitHub approval evidence could not be read; rerun this observer.' },
                publication: 'not-applicable',
            };
        }
        if (initial.repositoryId !== target.repositoryId || initial.pullNumber !== target.pullNumber) {
            return { decision: { status: 'blocked', code: 'target-mismatch', detail: 'The resolved PR does not match the bound repository and number.' }, publication: 'not-applicable' };
        }
        let failure = initial.diagnostics?.[0] ? approvalDiagnosticError(initial.diagnostics[0]) : undefined;
        let decision: ApprovalDecision = failure
            ? { status: 'blocked', code: 'evidence-unavailable', detail: 'Approval evidence is unavailable; inspect the causal diagnostic in the observer Job Summary.' }
            : decidePullRequestApproval(policy, initial);
        let reviewId: number | undefined;
        if (decision.status === 'eligible') {
            let current: ApprovalEvidence | undefined;
            let currentPolicy: string | undefined;
            try {
                current = await this.port.loadEvidence(target);
                currentPolicy = await this.port.readPolicy(target);
            } catch (cause) {
                failure = evidenceFailure(cause);
                current = undefined;
                decision = { status: 'blocked', code: 'pre-submit-unavailable', detail: 'Current approval evidence could not be reread before submission.' };
            }
            if (current?.diagnostics?.length) {
                failure = approvalDiagnosticError(current.diagnostics[0]);
                current = undefined;
                decision = { status: 'blocked', code: 'pre-submit-unavailable', detail: 'Current evidence is unavailable; inspect the observer diagnostic.' };
            }
            if (current && currentPolicy !== rawPolicy) {
                decision = { status: 'pending', code: 'superseded', detail: 'The approval policy changed before submission; recheck the current head.' };
            } else if (current && !sameRevisionAndEvidence(initial, current)) {
                decision = { status: 'pending', code: 'superseded', detail: 'PR revision, policy, or approval evidence changed before submission; recheck the current head.' };
            } else if (current) {
                decision = decidePullRequestApproval(policy, current);
                if (decision.status === 'eligible') {
                    try {
                        const posted = await this.port.submitApproval(target, current.headSha, approvalReviewBody(current.headSha));
                        reviewId = posted.id;
                    } catch {
                        // A transport error can occur after GitHub accepted the review. Never retry the POST blind.
                    }
                    try {
                        const readback = await this.port.loadEvidence(target);
                        const botReviews = readback.reviews.filter(review => review.userId === current.botUserId)
                            .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt) || right.id - left.id);
                        const observed = botReviews.find(review => review.state === 'APPROVED' && review.commitId === current.headSha);
                        if (observed && observed.userId === current.botUserId
                            && observed.state === 'APPROVED' && observed.commitId === current.headSha
                            && !botReviews.some(review => review.state === 'DISMISSED' && review.commitId === current.headSha)
                            && readback.headSha === current.headSha && readback.baseSha === current.baseSha) {
                            reviewId = observed.id;
                            decision = { status: 'already-approved', code: 'approved', detail: 'The bot approved this revision; GitHub still applies the configured branch rules.' };
                        } else {
                            decision = { status: 'pending', code: 'publication-unknown', detail: 'GitHub may have accepted the review; rerun to read it before any new submission.' };
                        }
                    } catch {
                        decision = { status: 'pending', code: 'publication-unknown', detail: 'GitHub may have accepted the review; rerun to read it before any new submission.' };
                    }
                }
            }
        }
        try {
            // The adapter guards the current head again before editing the single card.
            await this.port.publishAssessment(target, initial, decision, reviewId);
            return { decision, ...(failure ? { failure } : {}), headSha: initial.headSha, evidence: initial, mode: policy.mode,
                ...(reviewId ? { reviewId } : {}), publication: 'published' };
        } catch {
            return { decision, ...(failure ? { failure } : {}), headSha: initial.headSha, evidence: initial, mode: policy.mode,
                ...(reviewId ? { reviewId } : {}), publication: 'failed' };
        }
    }
}

function sameRevisionAndEvidence(left: ApprovalEvidence, right: ApprovalEvidence): boolean {
    return left.repositoryId === right.repositoryId
        && left.pullNumber === right.pullNumber
        && left.headSha === right.headSha
        && left.baseSha === right.baseSha
        && JSON.stringify(left) === JSON.stringify(right);
}

function approvalReviewBody(headSha: string): string {
    return `<!-- copilot:guarded-approval:v1 head="${headSha}" -->\nCopilot approved this revision (${headSha.slice(0, 7)}) after its configured CI and coverage gates passed and Bugbot reported no blocking findings. GitHub still applies branch rules. Configure a separate human-review requirement if needed; a bot approval may count toward a generic approval minimum.`;
}

function evidenceFailure(cause: unknown): ApplicationError {
    return cause instanceof ApplicationError && cause.recovery?.id === 'approval-evidence-read-failed'
        ? cause : approvalEvidenceError('evidence', 'transport-unavailable');
}
