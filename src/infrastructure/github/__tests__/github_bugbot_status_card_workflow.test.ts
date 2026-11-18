import { runGithubBugbotStatusCardWorkflow } from '../github_bugbot_status_card_workflow';
import { encodeGithubBugbotStatusCardHandoff } from '../github_bugbot_status_card_handoff';
import { buildBugbotProgressCheckMarker } from '../../../application/policies/bugbot_progress_check_observation_policy';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';
import { renderBugbotStatusCard } from '../../../application/policies/bugbot_review_presentation_policy';

const mockApi = { rest: {
    repos: { get: jest.fn() },
    users: { getAuthenticated: jest.fn() },
    actions: { getWorkflowRun: jest.fn(), listWorkflowRuns: jest.fn() },
    checks: { listForRef: jest.fn() },
} };
const mockCurrent = jest.fn();
const mockIssueComments = jest.fn();
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@actions/github', () => ({ getOctokit: () => mockApi }));
jest.mock('../../../data/repository/pull_request/pull_request_lifecycle_repository', () => ({
    PullRequestLifecycleRepository: class { getBugbotSourceBoundPullRequestIdentity = mockCurrent; },
}));
jest.mock('../../composition/bugbot_composition_root', () => ({
    createBugbotCompositionRoot: () => ({
        scm: { context: { listIssueComments: mockIssueComments }, reconciliation: { presentation: {
            comments: { addComment: mockAdd, updateComment: mockUpdate },
        } } },
    }),
}));

const source = { repositoryId: 19, pullNumber: 11, base: 'a'.repeat(40), baseRef: 'b'.repeat(40),
    head: 'c'.repeat(40), policy: 'default' };
const url = 'https://github.com/vypdev/copilot';
const runUrl = url + '/actions/runs/23/attempts/2';
const runRef = 'vypdev/copilot/.github/workflows/copilot_bugbot_status_card.yml@refs/heads/develop';
const run = {
    id: 23, run_attempt: 2, path: '.github/workflows/copilot_pull_request.yml', event: 'pull_request',
    status: 'in_progress', created_at: '2026-11-18T04:20:00Z', repository: { id: 19 }, head_repository: { id: 19 },
    pull_requests: [{ number: 11, head: { sha: source.head, repo: { id: 19 } }, base: { sha: source.base, repo: { id: 19 } } }],
};
const externalId = ['bugbot', source.pullNumber, source.base, source.head, source.policy, 23, 2].join(':');
const summary = buildBugbotProgressCheckMarker({
    stage: 'analyzing', headSha: source.head, baseSha: source.base, baseRefSha: source.baseRef,
    pullNumber: source.pullNumber, elapsedMs: 250000, observedAt: '2026-11-18T04:25:00.000Z', sequence: 8,
    partitions: { completed: 18, total: 50 },
}, externalId);
const oldBody = renderBugbotStatusCard(buildBugbotReviewProjection({
    pullRequestNumber: source.pullNumber, analyzedHeadSha: source.base, verifiedHeadSha: source.base,
    findings: [], coverage: { status: 'complete', sources: [] },
}), 'en-US', { pullRequestUrl: url + '/pull/11', commitUrl: url + '/commit/' + source.base });
const base = { owner: 'vypdev', repository: 'copilot', event: 'workflow_dispatch', ref: 'refs/heads/develop',
    workflowRef: runRef, actor: 'vypbot', token: 'test-writer', evidenceToken: 'test-reader', server: 'https://github.com',
    locale: 'en-US', policy: 'default' };
const progress = { source, runId: 23, attempt: 2, kind: 'progress' as const };

function invoke(request: Parameters<typeof encodeGithubBugbotStatusCardHandoff>[0] = progress,
    overrides: Partial<typeof base> = {}) {
    const wire = encodeGithubBugbotStatusCardHandoff(request)!;
    return runGithubBugbotStatusCardWorkflow({ ...base, ...overrides, inputs: { pullNumber: wire.pull_number, work: wire.work } });
}

beforeEach(() => {
    jest.resetAllMocks();
    mockApi.rest.repos.get.mockResolvedValue({ data: { id: 19, default_branch: 'develop' } });
    mockApi.rest.users.getAuthenticated.mockResolvedValue({ data: { login: 'vypbot' } });
    mockApi.rest.actions.getWorkflowRun.mockResolvedValue({ data: run });
    mockApi.rest.actions.listWorkflowRuns.mockResolvedValue({ data: { total_count: 1, workflow_runs: [run] } });
    mockApi.rest.checks.listForRef.mockResolvedValue({ data: { total_count: 1, check_runs: [
        { id: 38, name: 'Copilot / Review', head_sha: source.head, external_id: externalId,
            details_url: runUrl, status: 'in_progress', app: { slug: 'github-actions' }, output: { summary } },
    ] } });
    mockCurrent.mockResolvedValue({
        number: source.pullNumber, baseSha: source.base, baseRefSha: source.baseRef, headSha: source.head,
        baseRepository: { id: 19, owner: 'vypdev', name: 'copilot' }, headRepositoryOwner: 'vypdev', headRepositoryName: 'copilot',
        state: 'open',
    });
    mockIssueComments.mockResolvedValue({ coverage: { status: 'complete' }, value: [{ id: 55, body: oldBody, user: { login: 'vypbot' } }] });
});

it('reads the authenticated native observation after admission and updates the canonical card', async () => {
    await expect(invoke()).resolves.toBe('updated');
    expect(mockUpdate).toHaveBeenCalledWith(11, 55, expect.stringContaining('18/50 partitions validated'), { commitSha: source.head });
    expect(mockUpdate.mock.calls[0][2].endsWith(oldBody)).toBe(true);
    expect(mockAdd).not.toHaveBeenCalled();
});

it('binds the exact run and check after collecting multiple native pages', async () => {
    const otherRuns = Array.from({ length: 100 }, (_, index) => ({ ...run, id: 1000 + index, pull_requests: [] }));
    const exactCheck = { id: 38, name: 'Copilot / Review', head_sha: source.head, external_id: externalId,
        details_url: runUrl, status: 'in_progress', app: { slug: 'github-actions' }, output: { summary } };
    const otherChecks = Array.from({ length: 100 }, (_, index) =>
        ({ ...exactCheck, id: 1000 + index, external_id: `other-${index}` }));
    mockApi.rest.actions.listWorkflowRuns.mockImplementation(async ({ page }) => ({
        data: { total_count: 101, workflow_runs: page === 1 ? otherRuns : [run] },
    }));
    mockApi.rest.checks.listForRef.mockImplementation(async ({ page }) => ({
        data: { total_count: 101, check_runs: page === 1 ? otherChecks : [exactCheck] },
    }));

    await expect(invoke()).resolves.toBe('updated');
    expect(mockApi.rest.actions.listWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    expect(mockApi.rest.checks.listForRef).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
});

it('refuses inconsistent or overlapping native pages before publishing', async () => {
    const runs = Array.from({ length: 100 }, (_, index) => ({ ...run, id: 1000 + index, pull_requests: [] }));
    mockApi.rest.actions.listWorkflowRuns.mockImplementation(async ({ page }) => ({
        data: { total_count: 101, workflow_runs: page === 1 ? runs : [runs[0]] },
    }));
    await expect(invoke()).resolves.toBe('skipped');
    expect(mockIssueComments).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
});

it('declines a prior run when a native attempt for the same comparison was queued later', async () => {
    const later = { ...run, id: 24, run_attempt: 1, created_at: '2026-11-18T04:22:00Z' };
    mockApi.rest.actions.listWorkflowRuns.mockResolvedValue({ data: { total_count: 2, workflow_runs: [run, later] } });
    await expect(invoke()).resolves.toBe('skipped');
    expect(mockUpdate).not.toHaveBeenCalled();
});

it('declines a non-bot dispatch and a different policy before touching the conversation', async () => {
    await expect(invoke(progress, { actor: 'maintainer' })).resolves.toBe('skipped');
    await expect(invoke(progress, { policy: 'f'.repeat(64) })).resolves.toBe('skipped');
    expect(mockIssueComments).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
});

it('never creates a status card when the provider cannot attest complete conversation coverage', async () => {
    mockIssueComments.mockResolvedValue({ coverage: { status: 'partial' }, value: [] });

    await expect(invoke()).resolves.toBe('skipped');
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
});

it('preserves active native progress when an independent authorized recheck refreshes the verified card', async () => {
    const recheck = { ...run, id: 24, run_attempt: 1, path: '.github/workflows/copilot_issue_comment.yml', event: 'issue_comment' };
    mockApi.rest.actions.getWorkflowRun.mockResolvedValue({ data: recheck });
    const verifiedBody = renderBugbotStatusCard(buildBugbotReviewProjection({
        pullRequestNumber: source.pullNumber, analyzedHeadSha: source.head, verifiedHeadSha: source.head,
        findings: [], coverage: { status: 'complete', sources: [] },
    }), 'en-US', { pullRequestUrl: url + '/pull/11', commitUrl: url + '/commit/' + source.head });
    await expect(invoke({ source, runId: 24, attempt: 1, kind: 'state-refresh', verifiedBody })).resolves.toBe('updated');
    expect(mockUpdate.mock.calls[0][2]).toContain('18/50 partitions validated');
    expect(mockUpdate.mock.calls[0][2].endsWith(verifiedBody)).toBe(true);
});
