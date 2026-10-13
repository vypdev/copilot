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
    it('supports a projected snapshot when the optional canonical read capability is absent', async () => {
        const { context } = fixture();
        const result = await readCopilotStatus(context, 'IssueCommentUseCase');
        expect(result.payload).toMatchObject({ status: { pullRequestNumber: 11 } });
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

describe('status after current native reads', () => {
    function nativeFixture() {
        const f = fixture();
        const current = { number: 7, state: 'closed' as const, reason: 'completed' as const, labels: ['SDD', '55%'] };
        const native = { readIssue: jest.fn().mockResolvedValue(current), readPullRequest: jest.fn().mockResolvedValue({ number: 11, state: 'closed', merged: true }) };
        const issueContext = { ...f.context, status: { ...f.context.status, target: 'issue' as const, issueNumber: 7,
            pullRequestNumber: undefined, lifecycle: 'in-progress', waitingFor: 'maintainer' } };
        return { ...f, current, native, issueContext };
    }
    it('reads current completed state even when the queued event described an open issue', async () => {
        const f = nativeFixture(); const result = await readCopilotStatus(f.issueContext, 'Status', f.ports, undefined, f.native);
        expect(result.payload).toMatchObject({ status: { lifecycle: 'completed', waitingFor: undefined, issueLabels: ['SDD', '55%'] } });
        expect(f.native.readIssue).toHaveBeenCalledWith(7); expect(f.native.readPullRequest).not.toHaveBeenCalled();
    });
    it('replaces old closed context after a current reopening', async () => {
        const f = nativeFixture(); f.native.readIssue.mockResolvedValue({ ...f.current, state: 'open', reason: 'reopened', labels: ['state:working'] });
        const result = await readCopilotStatus({ ...f.issueContext, status: { ...f.issueContext.status, lifecycle: 'completed' } }, 'Status', undefined, undefined, f.native);
        expect(result.payload).toMatchObject({ status: { lifecycle: 'in-progress' } });
    });
    it('rejects a foreign native issue without reading independent evidence', async () => {
        const f = nativeFixture(); f.native.readIssue.mockResolvedValue({ ...f.current, number: 8 });
        await expect(readCopilotStatus(f.issueContext, 'Status', f.ports, undefined, f.native)).rejects.toMatchObject({ code: 'workflow.stale' });
        expect(f.ports.getPullRequest).not.toHaveBeenCalled();
    });
    it('does not convert a denied native read into apparent terminal success', async () => {
        const f = nativeFixture(); f.native.readIssue.mockRejectedValue(new Error('native read denied'));
        await expect(readCopilotStatus(f.issueContext, 'Status', undefined, undefined, f.native)).rejects.toThrow('native read denied');
    });
    it('retains verified historical SDD projection alongside native completion', async () => {
        const f = nativeFixture(); const sha = 'b'.repeat(40);
        const context = { ...f.issueContext, sdd: { issueNumber: 7 } as never,
            status: { ...f.issueContext.status, sddReadiness: { state: 'not-required' as const, required: false } } };
        const sdd = { serverOrigin: 'https://github.com', read: jest.fn().mockResolvedValue({ state: 'published', path: 'specs/history.md',
            verified: { path: 'specs/history.md', firstSha: sha, currentSha: sha }, historical: true }) };
        expect((await readCopilotStatus(context, 'Status', undefined, sdd, f.native)).payload)
            .toMatchObject({ status: { lifecycle: 'completed', sddReadiness: { state: 'ready', historical: true, commitSha: sha } } });
    });
    it.each([
        [{ state: 'unavailable' }, 'unavailable'],
        [{ state: 'absent' }, 'unavailable'],
        [{ state: 'invalid' }, 'unverified'],
        [{ state: 'published', path: 'specs/history.md' }, 'unverified'],
    ])('does not invent historical proof for terminal issue evidence %j', async (evidence, state) => {
        const f = nativeFixture();
        const context = { ...f.issueContext, sdd: { issueNumber: 7 } as never,
            status: { ...f.issueContext.status, sddReadiness: { state: 'unavailable' as const, required: true } } };
        const sdd = { read: jest.fn().mockResolvedValue(evidence) };
        const result = await readCopilotStatus(context, 'Status', undefined, sdd, f.native);
        expect(result.payload).toMatchObject({ status: { lifecycle: 'completed', sddReadiness: { state } } });
        expect((result.payload as { status: { sddReadiness: { historical?: boolean } } }).status.sddReadiness.historical).toBeUndefined();
    });
    it.each([true, false])('reports a currently closed PR with merged=%s independently of an obsolete open-head card', async merged => {
        const f = nativeFixture(); f.native.readPullRequest.mockResolvedValue({ number: 11, state: 'closed', merged });
        const result = await readCopilotStatus(f.context, 'Status', f.ports, undefined, f.native);
        expect(result.payload).toMatchObject({ status: { lifecycle: merged ? 'merged' : 'closed', findingStates: undefined } });
        expect(f.ports.listIssueComments).not.toHaveBeenCalled(); expect(f.native.readIssue).not.toHaveBeenCalled();
    });
    it('keeps the current open PR projection when adding independently verified finding counts', async () => {
        const f = nativeFixture(); f.native.readPullRequest.mockResolvedValue({ number: 11, state: 'open', merged: false });
        const cached = { ...f.context, status: { ...f.context.status, lifecycle: 'merged', pullRequestLabels: ['state:reviewing'] } };
        expect((await readCopilotStatus(cached, 'Status', f.ports, undefined, f.native)).payload)
            .toMatchObject({ status: { lifecycle: 'reviewing', findingStates: { resolved: 2 } } });
    });
    it('keeps native subject reads out of push status', async () => {
        const f = nativeFixture(); const context = { ...f.issueContext, status: { ...f.issueContext.status, target: 'push' as const } };
        await readCopilotStatus(context, 'Status', undefined, undefined, f.native);
        expect(f.native.readIssue).not.toHaveBeenCalled(); expect(f.native.readPullRequest).not.toHaveBeenCalled();
    });
    it('rejects changed closure reason at the final native fence', async () => {
        const f = nativeFixture(); f.native.readIssue.mockResolvedValueOnce(f.current).mockResolvedValue({ ...f.current, reason: 'not_planned' });
        await expect(readCopilotStatus(f.issueContext, 'Status', undefined, undefined, f.native)).rejects.toMatchObject({ code: 'workflow.stale' });
    });
    it('rejects a PR closed during count collection even when its head SHA did not move', async () => {
        const f = nativeFixture(); f.native.readPullRequest.mockResolvedValueOnce({ number: 11, state: 'open', merged: false })
            .mockResolvedValue({ number: 11, state: 'closed', merged: true });
        await expect(readCopilotStatus(f.context, 'Status', f.ports, undefined, f.native)).rejects.toMatchObject({ code: 'workflow.stale' });
    });

});
