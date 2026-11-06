import { runPullRequestWorkflow, type PullRequestWorkflowPorts } from '../pull_request_workflow';
import { CloseIssueAfterMergingUseCase } from '../steps/issue/close_issue_after_merging_use_case';
import { ReconcileClosedIssueMetadataUseCase } from '../actions/reconcile_closed_issue_metadata_use_case';
import { ReconcileClosedIssueUseCase } from '../actions/reconcile_closed_issue_use_case';
import { RetireProgressUseCase } from '../actions/retire_progress_use_case';
import { reconcileStatusCard } from '../steps/common/status_card_publication_workflow';
import { replyRequestBodyDigest } from '../../../domain/reply_request_digest';
import type { NativeIssueCompletionFacts } from '../../../domain/issue_completion';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../domain/copilot_lifecycle';
import { StagedRolloutReviewRepository } from '../../../data/repository/pull_request/staged_rollout_review_repository';
import type { IssueCommentPublicationTarget } from '../../ports/issue_lifecycle_ports';
import { buildActionSummary } from '../../policies/action_summary_policy';
import { parsePublicationMarker } from '../../policies/publication_identity_policy';

const owner = 'vypdev';
const repository = 'vaultstadio';
const repo = { nameWithOwner: 'vypdev/vaultstadio' };
const headSha = '82c23eb1ab62f6d3499b431f8f30ba7e08fa5ce1';
const headBranch = 'chore/85-complete-trusted-main-rollout-and-official-runtime-verification-after-pr83';
const issueNumber = 85;
const pullNumber = 108;
const completedLabels = { lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS, protectedLabels: ['chore', 'branched'] };
const mergedAt = '2026-10-27T00:05:06Z';
const botLogin = 'vypbot';

const review = () => ({
    body: 'Copilot-Stage-Rollout: #85', fullDatabaseId: '5660051354', state: 'COMMENTED',
    submittedAt: '2026-10-26T22:38:34Z', lastEditedAt: null as string | null,
    commit: { oid: headSha }, author: { login: 'efraespada', __typename: 'User' },
});

function fixture() {
    const issue = {
        number: issueNumber,
        state: 'open' as NativeIssueCompletionFacts['state'],
        reason: 'unknown' as NativeIssueCompletionFacts['reason'],
        assignees: ['runtime-operator'],
        body: [
            'Promote the reviewed source to immutable trusted main',
            'Prove the generated caller input and actual official runner placement',
            'Verify the sandbox helper and reject an unsafe or missing helper',
            'Retain scoped signing trust and preserve host state and credentials',
            'Record separate activation approval',
            'Prove actual Java, SDK, browser and Docker identities',
            'Record outcomes for all four configured commands',
            'Prove parent/ref publication and source-history preservation',
            'Retain native post-step and private-profile cleanup evidence',
            'Document failure and rollback without claiming readiness',
        ].map(item => `- [ ] ${item}`).join('\n'),
    };
    let deploymentCompletion: NativeIssueCompletionFacts['deploymentCompletion'];
    const labels = new Set(['35%', 'in-progress', 'state:working', 'chore', 'branched', 'unrelated']);
    const read = jest.fn(async (): Promise<NativeIssueCompletionFacts> => ({
        number: issue.number, state: issue.state, reason: issue.reason, labels: [...labels], deploymentCompletion,
    }));
    const close = jest.fn(async () => { issue.state = 'closed'; issue.reason = 'completed'; return true; });
    const addLabel = jest.fn(async (label: string) => { labels.add(label); });
    const removeLabel = jest.fn(async (label: string) => { labels.delete(label); });
    const forIssue = jest.fn((_number: number) => ({ read, close, addLabel, removeLabel }));
    const readPullRequest = jest.fn(async () => ({ number: pullNumber, state: 'closed' as const, merged: true }));
    const timeline: IssueCommentPublicationTarget[] = [];
    const add = (body: string, login = botLogin) => { timeline.push({ id: timeline.length + 100, body, user: { login } }); };
    const comments = {
        listIssueComments: jest.fn(async () => [...timeline]),
        addComment: jest.fn(async (_number: number, body: string) => add(body)),
        updateComment: jest.fn(async (_number: number, id: number, body: string) => {
            timeline.find(comment => comment.id === id)!.body = body;
        }),
        removeComment: jest.fn(async (_number: number, id: number) => {
            const index = timeline.findIndex(comment => comment.id === id);
            if (index >= 0) timeline.splice(index, 1);
            return 'removed' as const;
        }),
    };
    const pull = {
        number: pullNumber, state: 'MERGED', headRefName: headBranch, headRefOid: headSha,
        headRepository: repo, baseRefName: 'develop', mergedAt,
        body: 'Candidate checks passed.\n\nRefs #85. The trusted-main rollout and official verification are pending.\n\nRelated #84.',
        closingIssuesReferences: { nodes: [{ number: 85, repository: repo }] },
        reviews: { nodes: [review()], pageInfo: { hasNextPage: false, endCursor: null as string | null } },
    };
    const page = () => ({ repository: { ...repo, defaultBranchRef: { name: 'master' }, pullRequest: pull } });
    const graphql = jest.fn(async (_query: string, _variables?: Record<string, unknown>): Promise<unknown> => page());
    const permission = jest.fn(async () => ({ data: { role_name: 'admin', user: { login: 'efraespada', type: 'User' } } }));
    const reviews = new StagedRolloutReviewRepository({
        graphql: async <T>(query: string, variables?: Record<string, unknown>) => await graphql(query, variables) as T,
        rest: { repos: { getCollaboratorPermissionLevel: permission } },
    }, owner, repository);
    const closer = new CloseIssueAfterMergingUseCase({ forIssue, readPullRequest }, {
        publicationTarget: { owner, repository, repositoryUrl: 'https://github.com/vypdev/vaultstadio' },
        reviews, comments,
    });
    const retire = new RetireProgressUseCase({ readIssue: read }, comments, { matches: async witness =>
        timeline.some(comment => comment.id === witness.commentId && comment.user?.login === witness.author
            && replyRequestBodyDigest(comment.body ?? '') === witness.bodyDigest),
    });
    const nativeContext = { issueNumber, locale: 'en-US', trustedBotLogin: botLogin, completionLabels: completedLabels };
    const issueClosed = new ReconcileClosedIssueUseCase(new ReconcileClosedIssueMetadataUseCase({ forIssue }), retire);
    const closeContext = {
        issueNumber, pullRequestNumber: pullNumber, completionLabels: completedLabels,
        stagedRollout: { headSha, botLogin, branchTypes: ['feature', 'bugfix', 'docs', 'chore'], integrationBranch: 'develop', locale: 'en-US' },
    };
    const merge = () => runPullRequestWorkflow({
        action: 'closed', closed: true, merged: true, opened: false, synchronize: false,
        membersOnly: false, actor: 'merger', automaticDescription: false, reviewable: false,
    } as Parameters<typeof runPullRequestWorkflow>[0], 'PullRequestUseCase', {
        workflowSteps: { closeIssueAfterMerging: closer, retireBranchSync: retire },
        sharedContexts: { steps: { closeIssue: closeContext, retireBranchSync: nativeContext } },
    } as unknown as PullRequestWorkflowPorts);
    const summary = (results: Awaited<ReturnType<typeof merge>>, locale = 'en-US') => buildActionSummary({
        owner, repository, issueNumber, pullRequestNumber: pullNumber, eventName: 'pull_request:closed', results,
        locale: { repository: locale, issue: locale, pullRequest: locale },
    });
    return {
        issue, labels, read, close, addLabel, removeLabel, forIssue, timeline, comments, add, pull, graphql, permission,
        closeContext, merge, summary, page, nativeClose: () => issueClosed.invoke(nativeContext),
        setDeploymentPending: () => { deploymentCompletion = 'pending'; },
    };
}

describe('staged rollout through the merged pull request workflow', () => {
    it('rollout-I735-C01 closes and reconciles an ordinary merged PR', async () => {
        const f = fixture();
        f.pull.reviews.nodes = [];
        expect((await f.merge())[0].success).toBe(true);
        expect(f.close).toHaveBeenCalledTimes(1);
        expect(f.issue).toMatchObject({ state: 'closed', reason: 'completed' });
        expect([...f.labels]).toEqual(['chore', 'branched', 'unrelated', '100%']);
        expect(f.comments.addComment).not.toHaveBeenCalled();
    });

    it('rollout-I735-C02 keeps the VaultStadio checklist and assignee on the original open issue', async () => {
        const f = fixture();
        const before = structuredClone(f.issue);
        const results = await f.merge();
        expect(results[0]).toMatchObject({ success: true, payload: { state: 'pending', headSha, commentId: 100 } });
        expect(f.issue).toEqual(before);
        expect(f.close).not.toHaveBeenCalled();
        expect(f.addLabel).not.toHaveBeenCalled();
        expect([...f.labels]).toContain('35%');
        expect(f.timeline).toHaveLength(1);
        expect(f.timeline[0].body).toContain('## Rollout pending');
        expect(f.timeline[0].body).toContain('Complete this issue’s acceptance checklist');
        expect(f.timeline[0].body).toContain('https://github.com/vypdev/vaultstadio/pull/108');
        expect(f.timeline[0].body).toContain('pullrequestreview-5660051354');
        expect(f.summary(results)).toContain('https://github.com/vypdev/vaultstadio/issues/85#issuecomment-100');
        expect(f.summary(results, 'es-ES')).toContain('Rollout pendiente');
    });

    it('rollout-I735-C03 shows the same-job recovery action after a denied write', async () => {
        const f = fixture();
        f.comments.addComment.mockRejectedValueOnce(new Error('denied PRIVATE_PROVIDER_TEXT'));
        const results = await f.merge();
        expect(results[0]).toMatchObject({ success: false, payload: { state: 'registration-failed' } });
        expect(f.issue.state).toBe('open');
        expect(f.close).not.toHaveBeenCalled();
        const summary = f.summary(results);
        expect(summary).toContain('The PR merged and acceptance remains in the issue');
        expect(summary).toContain('Re-run failed jobs for this workflow run');
        expect(summary).not.toContain('PRIVATE_PROVIDER_TEXT');
    });

    it('rollout-I735-C04 adopts the existing card after a lost create response', async () => {
        const f = fixture();
        f.comments.addComment.mockImplementationOnce(async (_number, body) => {
            f.add(body);
            throw new Error('response lost');
        });
        expect((await f.merge())[0].success).toBe(false);
        expect((await f.merge())[0]).toMatchObject({ success: true, executed: false, payload: { state: 'pending', commentId: 100 } });
        expect(f.timeline).toHaveLength(1);
        expect(f.comments.addComment).toHaveBeenCalledTimes(1);
        expect(f.issue.state).toBe('open');
    });

    it('rollout-I735-C05 duplicate delivery has no new publication or completion effects', async () => {
        const f = fixture();
        await f.merge();
        expect((await f.merge())[0]).toMatchObject({ success: true, executed: false });
        expect(f.comments.addComment).toHaveBeenCalledTimes(1);
        expect(f.comments.updateComment).not.toHaveBeenCalled();
        expect(f.close).not.toHaveBeenCalled();
    });

    it('also keeps the issue open when a later merge has an existing rollout card', async () => {
        const f = fixture();
        await f.merge();
        f.pull.reviews.nodes = [];
        expect((await f.merge())[0]).toMatchObject({ success: true, payload: { state: 'pending' } });
        expect(f.close).not.toHaveBeenCalled();
    });

    it('rollout-I735-C06 free PR prose and a quoted review have no authorization effect', async () => {
        const f = fixture();
        f.pull.body += '\n\nCopilot-Stage-Rollout: #85';
        f.pull.reviews.nodes = [{ ...review(), body: '> Copilot-Stage-Rollout: #85' }];
        await f.merge();
        expect(f.close).toHaveBeenCalledTimes(1);
        expect(f.permission).not.toHaveBeenCalled();
    });

    it.each(['Copilot-Stage-Rollout #85', 'Copilot-Stage-Rollout: #84'])(
        'rollout-I735-C07 holds %s without writing completion metadata',
        async body => {
            const f = fixture();
            f.pull.reviews.nodes[0].body = body;
            expect((await f.merge())[0]).toMatchObject({ success: false, payload: { state: 'held', reason: 'invalid-declaration' } });
            expect(f.close).not.toHaveBeenCalled();
            expect(f.addLabel).not.toHaveBeenCalled();
            expect(f.comments.addComment).not.toHaveBeenCalled();
        },
    );

    it('holds conflicting declarations without choosing a reviewer', async () => {
        const f = fixture();
        f.pull.reviews.nodes.push({ ...review(), fullDatabaseId: '5660051355' });
        expect((await f.merge())[0].payload).toMatchObject({ state: 'held', reason: 'conflicting-declarations' });
        expect(f.permission).not.toHaveBeenCalled();
    });

    it.each(['write role', 'application bot', 'authenticated automation account'])('rollout-I735-C08 rejects %s', async scenario => {
        const f = fixture();
        if (scenario === 'write role') f.permission.mockResolvedValueOnce({ data: { role_name: 'write', user: { login: 'efraespada', type: 'User' } } });
        if (scenario === 'application bot') f.pull.reviews.nodes[0].author.__typename = 'Bot';
        if (scenario === 'authenticated automation account') f.pull.reviews.nodes[0].author.login = botLogin;
        expect((await f.merge())[0].payload).toMatchObject({ state: 'held', reason: 'unauthorized' });
        expect(f.issue.state).toBe('open');
    });

    it.each(['commit', 'event-head', 'late', 'edited', 'dismissed', 'pending'] as const)(
        'rollout-I735-C09 rejects invalid native review evidence (%s)',
        async scenario => {
            const f = fixture();
            const current = f.pull.reviews.nodes[0];
            if (scenario === 'commit') current.commit.oid = 'b'.repeat(40);
            if (scenario === 'event-head') f.closeContext.stagedRollout.headSha = 'b'.repeat(40);
            if (scenario === 'late') current.submittedAt = mergedAt;
            if (scenario === 'edited') current.lastEditedAt = '2026-10-26T23:42:00Z';
            if (scenario === 'dismissed') current.state = 'DISMISSED';
            if (scenario === 'pending') current.state = 'PENDING';
            expect((await f.merge())[0].payload).toMatchObject({ state: 'held', reason: 'invalid-review' });
            expect(f.permission).not.toHaveBeenCalled();
        },
    );

    it('rollout-I735-C10 does not use unrelated references as mutation targets', async () => {
        const f = fixture();
        f.pull.body += '\n\nCloses #84';
        expect((await f.merge())[0].payload).toMatchObject({ state: 'pending', issueNumber });
        expect(f.forIssue.mock.calls).toEqual([[issueNumber]]);
        expect(f.comments.addComment.mock.calls[0][0]).toBe(issueNumber);
    });

    it('rollout-I735-C11 removes stale 100% and prevents an older progress card from replacing pending status', async () => {
        const f = fixture();
        f.labels.add('100%');
        await f.merge();
        const body = f.timeline[0].body;
        expect(f.labels.has('100%')).toBe(false);
        const result = await reconcileStatusCard({ owner, repository, botLogin, intent: {
            kind: 'status', locale: 'en-US', digest: 'abcdabcd',
            identity: { topic: 'progress', target: { kind: 'issue', number: issueNumber }, key: 'work' },
            sourceVersion: `head:${headSha}`, projection: { kind: 'progress', progress: 100, summary: 'Older implementation estimate' },
            sourceGuard: { kind: 'branch-head', branch: headBranch, sha: headSha },
        } }, f.comments, { getBranchHeadSha: async () => headSha, isIssueOpen: async () => true });
        expect(result).toMatchObject({ effect: 'unchanged', reason: 'stale-source' });
        expect(f.timeline).toHaveLength(1);
        expect(f.timeline[0].body).toBe(body);
    });

    it('rollout-I735-C12 native completion preserves evidence and archives the staged card', async () => {
        const f = fixture();
        await f.merge();
        f.add('Operational evidence: trusted source, activation approval, and official verification run.', 'maintainer');
        const acceptance = f.issue.body;
        f.issue.state = 'closed';
        f.issue.reason = 'completed';
        expect((await f.nativeClose()).every(result => result.success)).toBe(true);
        expect(f.issue.body).toBe(acceptance);
        expect(f.labels.has('100%')).toBe(true);
        expect(f.timeline[0].body).toContain('## Rollout archived');
        expect(parsePublicationMarker(f.timeline[0].body)?.sourceVersion).toMatch(/^closed:completed:/);
        expect(f.timeline[1].body).toContain('Operational evidence');
    });

    it.each(['closed', 'reopened'] as const)('rollout-I735-C13 replay preserves native %s state', async state => {
        const f = fixture();
        await f.merge();
        f.issue.state = state === 'closed' ? 'closed' : 'open';
        f.issue.reason = state === 'closed' ? 'completed' : 'reopened';
        await f.merge();
        expect(f.issue.reason).toBe(state === 'closed' ? 'completed' : 'reopened');
        expect(f.close).not.toHaveBeenCalled();
        expect(f.comments.addComment).toHaveBeenCalledTimes(1);
        expect(f.timeline).toHaveLength(1);
    });

    it.each(['fork', 'default', 'other-base', 'release', 'closing-keyword', 'inline-keyword'])('rollout-I735-C14 holds unsupported %s scope', async scenario => {
        const f = fixture();
        if (scenario === 'fork') f.pull.headRepository = { nameWithOwner: 'someone/vaultstadio' };
        if (scenario === 'default') f.pull.baseRefName = 'master';
        if (scenario === 'other-base') f.pull.baseRefName = 'unrelated';
        if (scenario === 'release') f.pull.headRefName = 'release/85-release';
        if (scenario === 'closing-keyword') f.pull.body += '\n\nCloses #85';
        if (scenario === 'inline-keyword') f.pull.body += '\n\nThe preparatory change fixes #85.';
        expect((await f.merge())[0].payload).toMatchObject({ state: 'held', reason: 'unsupported-scope' });
        expect(f.issue.state).toBe('open');
    });

    it('converges simultaneous staged deliveries on one owned card', async () => {
        const f = fixture();
        const results = await Promise.all([f.merge(), f.merge()]);
        expect(results.some(([result]) => result.success)).toBe(true);
        expect(f.timeline).toHaveLength(1);
        expect(f.close).not.toHaveBeenCalled();
    });

    it('refuses a forged card by another author and uses ordinary completion', async () => {
        const f = fixture();
        await f.merge();
        f.timeline[0].user = { login: 'outsider' };
        f.pull.reviews.nodes = [];
        await f.merge();
        expect(f.close).toHaveBeenCalledTimes(1);
        expect(f.comments.updateComment).not.toHaveBeenCalled();
    });

    it.each(['closed', 'reopened', 'deployment-pending'] as const)(
        'honors native %s observed while verifying an ordinary merge',
        async change => {
            const f = fixture();
            f.pull.reviews.nodes = [];
            f.graphql.mockImplementationOnce(async () => {
                if (change === 'closed') { f.issue.state = 'closed'; f.issue.reason = 'completed'; }
                if (change === 'reopened') f.issue.reason = 'reopened';
                if (change === 'deployment-pending') f.setDeploymentPending();
                return f.page();
            });
            await f.merge();
            expect(f.close).not.toHaveBeenCalled();
            expect(f.labels.has('100%')).toBe(change === 'closed');
        },
    );

    it('preserves native state when the issue closes during staged registration', async () => {
        const f = fixture();
        f.permission.mockImplementationOnce(async () => {
            f.issue.state = 'closed';
            f.issue.reason = 'completed';
            return { data: { role_name: 'maintain', user: { login: 'efraespada', type: 'User' } } };
        });
        expect((await f.merge())[0].payload).toMatchObject({ state: 'registration-failed' });
        expect(f.comments.addComment).not.toHaveBeenCalled();
        expect(f.close).not.toHaveBeenCalled();
    });

    it('retries stale percentage removal without republishing an already registered card', async () => {
        const f = fixture();
        f.labels.add('100%');
        f.removeLabel.mockRejectedValueOnce(new Error('label write failed'));
        expect((await f.merge())[0].payload).toMatchObject({ state: 'registration-failed' });
        expect((await f.merge())[0].payload).toMatchObject({ state: 'pending', commentId: 100 });
        expect(f.timeline).toHaveLength(1);
        expect(f.labels.has('100%')).toBe(false);
    });

    it.each(['missing actor', 'invalid login', 'missing ID', 'unsafe ID', 'bad timestamp', 'bad head', 'missing bot'])(
        'rejects incomplete or invalid declaration evidence (%s)',
        async change => {
            const f = fixture();
            const current = f.pull.reviews.nodes[0];
            if (change === 'missing actor') Object.assign(current, { author: null });
            if (change === 'invalid login') current.author.login = 'some[bot]';
            if (change === 'missing ID') Object.assign(current, { fullDatabaseId: null });
            if (change === 'unsafe ID') current.fullDatabaseId = 'review?bad';
            if (change === 'bad timestamp') Object.assign(current, { submittedAt: null });
            if (change === 'bad head') f.pull.headRefOid = 'bad';
            if (change === 'missing bot') f.closeContext.stagedRollout.botLogin = '';
            expect((await f.merge())[0].payload).toMatchObject({ state: 'held' });
            expect(f.issue.state).toBe('open');
            expect(f.permission).not.toHaveBeenCalled();
        },
    );

    it('holds a provider failure and identifies how to recover verification', async () => {
        const f = fixture();
        f.graphql.mockRejectedValueOnce(new Error('access denied'));
        const results = await f.merge();
        expect(results[0].payload).toMatchObject({ state: 'held', reason: 'evidence-unavailable' });
        expect(f.summary(results)).toContain('Restore access to the evidence and re-run failed jobs');
        expect(f.close).not.toHaveBeenCalled();
    });

    it('looks beyond the first review page before deciding that a PR has no declaration', async () => {
        const f = fixture();
        f.graphql.mockResolvedValueOnce({ repository: { ...repo, defaultBranchRef: { name: 'master' }, pullRequest: {
            ...f.pull, reviews: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'next-page' } },
        } } });
        expect((await f.merge())[0].payload).toMatchObject({ state: 'pending' });
        expect(f.graphql.mock.calls).toHaveLength(2);
        expect(f.graphql).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ cursor: 'next-page' }));
    });

    it('holds a repeated pagination cursor instead of assuming ordinary completion', async () => {
        const f = fixture();
        f.pull.reviews = { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'repeated' } };
        expect((await f.merge())[0].payload).toMatchObject({ state: 'held', reason: 'evidence-unavailable' });
        expect(f.close).not.toHaveBeenCalled();
    });
});
