import { readCopilotStatus, type CopilotStatusReadPorts } from '../read_copilot_status_workflow';
import type { CommentAutomationContext } from '../comment_automation_context';
import { buildBugbotStatusCountMarker } from '../../policies/bugbot_status_count_marker_policy';
import { buildBugbotStatusMarker } from '../../policies/bugbot_review_presentation_policy';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';
import { completeBugbotSourceCoverage } from '../../../domain/bugbot/context';

const head = 'a'.repeat(40);
const projection = buildBugbotReviewProjection({ pullRequestNumber: 11, analyzedHeadSha: head,
    findings: [{ id: 'fixed', state: 'fixed' }, { id: 'dismissed', state: 'dismissed' }],
    coverage: { status: 'complete', sources: [] } });
const body = `${buildBugbotStatusMarker(projection)}\n${buildBugbotStatusCountMarker(projection)}`;
function fixture() {
    const context = { trustedBotLogin: 'bot', status: { owner: 'o', repository: 'r', event: 'issue_comment',
        action: 'created', target: 'pull-request', pullRequestNumber: 11, issueLabels: [], pullRequestLabels: [],
        pullRequestDescriptionMode: 'replace' }, bugbot: { review: {
        repository: { owner: 'o', name: 'r', id: 1 }, target: { issueNumber: 7, isPullRequest: true,
            pullRequestNumber: 11, headBranch: 'docs/7', commitBranch: '', baseBranch: 'develop',
            pullRequestAction: '', draft: false }, trigger: { kind: 'issue_comment', headOwner: 'o' },
        trustedAuthorLogin: 'bot', ignorePatterns: [], organizationRules: [],
    } } } as unknown as CommentAutomationContext;
    const ports = {
        getPullRequest: jest.fn().mockResolvedValue({ number: 11, state: 'open', draft: false,
            baseRepository: { owner: 'o', name: 'r', id: 1 }, headRepositoryOwner: 'o', headRepositoryName: 'r',
            headRef: 'docs/7', headSha: head }),
        listIssueComments: jest.fn().mockResolvedValue({ value: [{ id: 1, body, user: { login: 'bot' } }],
            coverage: completeBugbotSourceCoverage('issue-comments', 1, 1) }),
        getPullRequestHeadSha: jest.fn().mockResolvedValue(head),
    } satisfies CopilotStatusReadPorts;
    return { context, ports };
}

describe('read canonical Copilot status', () => {
    it('reports complete current-head counts using only the exact PR and its card', async () => {
        const { context, ports } = fixture();
        const staleCache = { ...context, status: { ...context.status, findingStateEvidence: 'invalid' as const,
            findingStates: { open: 99, reopened: 0, verificationRequired: 0, unknown: 0, resolved: 0 } } };
        const result = await readCopilotStatus(staleCache, 'IssueCommentUseCase', ports);
        expect(result.payload).toMatchObject({ status: { findingStates: {
            open: 0, reopened: 0, verificationRequired: 0, unknown: 0, resolved: 2,
        } } });
        expect(result.payload).toMatchObject({ status: { findingStateEvidence: undefined } });
        expect(ports.getPullRequest).toHaveBeenCalledWith(11);
        expect(ports.listIssueComments).toHaveBeenCalledWith(11);
        expect(ports.getPullRequestHeadSha).toHaveBeenCalledWith(11);
    });
    it('keeps branchless status independent of PR reads', async () => {
        const { context, ports } = fixture();
        const branchless = { ...context, status: { ...context.status, pullRequestNumber: undefined, target: 'issue' as const } };
        expect((await readCopilotStatus(branchless, 'IssueCommentUseCase', ports)).success).toBe(true);
        expect(ports.getPullRequest).not.toHaveBeenCalled();
    });
    it('ignores a bot answer that only mentions the count-marker namespace', async () => {
        const { context, ports } = fixture();
        ports.listIssueComments.mockResolvedValue({ value: [
            { id: 1, body, user: { login: 'bot' } },
            { id: 2, body: 'The copilot-bugbot-state-counts marker stores counts.', user: { login: 'bot' } },
        ], coverage: completeBugbotSourceCoverage('issue-comments', 2, 1) });
        expect((await readCopilotStatus(context, 'IssueCommentUseCase', ports)).payload)
            .toMatchObject({ status: { findingStates: { resolved: 2 } } });
    });
    it.each(['non-PR', 'different-PR'])('rejects an inconsistent %s target before any candidate lookup', async (reason) => {
        const { context, ports } = fixture();
        const mismatched = { ...context, bugbot: { ...context.bugbot, review: { ...context.bugbot.review,
            target: { ...context.bugbot.review.target, isPullRequest: reason !== 'non-PR',
                pullRequestNumber: reason === 'different-PR' ? 12 : 11 } } } };
        await expect(readCopilotStatus(mismatched, 'IssueCommentUseCase', ports)).rejects.toMatchObject({ code: 'workflow.stale' });
        expect(ports.getPullRequest).not.toHaveBeenCalled();
    });
    it('reports readiness evidence unavailable when its read adapter is absent', async () => {
        const { context } = fixture();
        const result = await readCopilotStatus(context, 'IssueCommentUseCase');
        expect(result.payload).toMatchObject({ status: { pullRequestNumber: 11,
            pullRequestReadiness: { readiness: 'unavailable', mode: 'unavailable', code: 'evidence-adapter-unavailable' } } });
        expect(result.steps.join('')).not.toContain('open=0');
    });
    it.each(['missing', 'foreign', 'duplicate', 'malformed', 'older-card', 'partial', 'moved-head', 'wrong-repository'])(
        'fails closed for %s evidence without reporting a clean status', async (reason) => {
            const { context, ports } = fixture();
            const record = { id: 1, body, user: { login: reason === 'foreign' ? 'attacker' : 'bot' } };
            ports.listIssueComments.mockResolvedValue({
                value: reason === 'missing' ? [] : reason === 'duplicate' ? [record, record] : [{ ...record,
                    body: reason === 'malformed' ? body.replace('fixed="1"', 'fixed="bad"')
                        : reason === 'older-card' ? buildBugbotStatusMarker(projection) : body }],
                coverage: { ...completeBugbotSourceCoverage('issue-comments', 1, 1), status: reason === 'partial' ? 'partial' : 'complete' },
            });
            if (reason === 'moved-head') ports.getPullRequestHeadSha.mockResolvedValue('b'.repeat(40));
            if (reason === 'wrong-repository') ports.getPullRequest.mockResolvedValue({ number: 11, state: 'open', draft: false,
                baseRepository: { owner: 'other', name: 'r', id: 2 }, headRepositoryOwner: 'o', headRef: 'docs/7', headSha: head });
            await expect(readCopilotStatus(context, 'IssueCommentUseCase', ports)).rejects.toMatchObject({ code: 'workflow.stale' });
        },
    );
});
