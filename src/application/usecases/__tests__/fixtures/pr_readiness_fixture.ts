import type { ApprovalEvidence } from '../../../../domain/pull_request_approval';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY, serializePullRequestApprovalPolicy, type PullRequestApprovalPolicy } from '../../../../domain/pull_request_approval_policy';
import type { CommentAutomationContext } from '../../comment_automation_context';
import { completeBugbotSourceCoverage } from '../../../../domain/bugbot/context';
import { buildBugbotReviewProjection } from '../../../../domain/bugbot/review_projection';
import { buildBugbotStatusMarker } from '../../../policies/bugbot_review_presentation_policy';
import { buildBugbotStatusCountMarker } from '../../../policies/bugbot_status_count_marker_policy';
export const READINESS_HEAD = 'a'.repeat(40), READINESS_BASE = 'b'.repeat(40), READINESS_MERGE = 'c'.repeat(40);
export function readinessPolicy(mode: 'off' | 'recommend' | 'guarded' = 'guarded', extra: Partial<PullRequestApprovalPolicy> = {}) {
    return serializePullRequestApprovalPolicy({ ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, mode, producerAttested: true,
        testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
        coverage: { mode: 'check', checkName: 'CI Check' }, ...extra });
}
export function readinessEvidence(extra: Partial<ApprovalEvidence> = {}): ApprovalEvidence {
    return { repositoryId: 1, pullNumber: 11, headSha: READINESS_HEAD, baseSha: READINESS_BASE, testedMergeSha: READINESS_MERGE,
        mergeCommitVerified: true, baseRef: 'develop', targetRole: 'development', branchKind: 'feature', linkedIssue: true,
        open: true, draft: false, sameRepository: true, authorId: 10, authorIsBot: false, botUserId: 20,
        changedPaths: ['src/feature.ts'], filesComplete: true, rulesReadable: true, dismissesStaleReviews: true, requiredChecks: ['CI Check'],
        checks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check', headSha: READINESS_HEAD,
            conclusion: 'success', status: 'completed', runId: 50, attempt: 1 }],
        bugbot: { headSha: READINESS_HEAD, outcome: 'complete', coverage: 'complete', open: 0, reopened: 0, dismissed: 0, verificationRequired: 0, unknown: 0 },
        bugbotSeverity: 'info', bugbotDryRun: false, reviews: [], reviewHistoryComplete: true, ...extra };
}
export function readinessFixture() {
    const projection = buildBugbotReviewProjection({ pullRequestNumber: 11, analyzedHeadSha: READINESS_HEAD,
        findings: [], coverage: { status: 'complete', sources: [] } });
    const context = { actor: 'participant', trustedBotLogin: 'bot', membersOnly: true, userComment: '/copilot status',
        status: { owner: 'o', repository: 'r', event: 'issue_comment', action: 'created', target: 'pull-request', pullRequestNumber: 11,
            issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'replace' },
        bugbot: { review: { repository: { owner: 'o', name: 'r', id: 1 },
            target: { issueNumber: 7, isPullRequest: true, pullRequestNumber: 11, headBranch: 'feature/7', baseBranch: 'develop', draft: false },
            trigger: { kind: 'issue_comment', headOwner: 'o' }, ignorePatterns: [], organizationRules: [] } },
    } as unknown as CommentAutomationContext;
    const ports = { serverOrigin: 'https://github.com',
        getPullRequest: jest.fn().mockResolvedValue({ number: 11, state: 'open', draft: false,
            baseRepository: { owner: 'o', name: 'r', id: 1 }, headRepositoryOwner: 'o', headRepositoryName: 'r', headRef: 'feature/7', headSha: READINESS_HEAD }),
        listIssueComments: jest.fn().mockResolvedValue({ value: [{ id: 1, user: { login: 'bot' }, body: `${buildBugbotStatusMarker(projection)}\n${buildBugbotStatusCountMarker(projection)}` }],
            coverage: completeBugbotSourceCoverage('issue-comments', 1, 1) }),
        getPullRequestHeadSha: jest.fn().mockResolvedValue(READINESS_HEAD),
        readLinkedPullRequests: jest.fn().mockResolvedValue({ state: 'available', repositoryId: 1, issueNumber: 7, numbers: [11] }),
        approval: { readPolicy: jest.fn().mockResolvedValue(readinessPolicy()), loadEvidence: jest.fn().mockResolvedValue(readinessEvidence()),
            readRevision: jest.fn().mockResolvedValue({ repositoryId: 1, pullNumber: 11, headSha: READINESS_HEAD, baseSha: READINESS_BASE }) },
    };
    return { context, ports };
}
export function readinessIssueFixture() {
    const f = readinessFixture();
    return { ...f, context: { ...f.context, status: { ...f.context.status, target: 'issue' as const, issueNumber: 7, pullRequestNumber: undefined },
        bugbot: { ...f.context.bugbot, review: { ...f.context.bugbot.review, target: { ...f.context.bugbot.review.target, isPullRequest: false } } } } };
}
