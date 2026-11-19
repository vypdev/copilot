import { createGithubBugbotStatusCardDispatcher } from '../github_bugbot_status_card_dispatch';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';
import { renderBugbotStatusCard } from '../../../application/policies/bugbot_review_presentation_policy';

const mockRead = { rest: {
    repos: { getContent: jest.fn() },
    actions: { getWorkflowRun: jest.fn(), listJobsForWorkflowRun: jest.fn() },
} };
const mockWrite = { request: jest.fn() };
const mockCurrent = jest.fn();
jest.mock('@actions/github', () => ({ getOctokit: (token: string) => token === 'read-token' ? mockRead : mockWrite }));
jest.mock('../../../data/repository/pull_request/pull_request_lifecycle_repository', () => ({
    PullRequestLifecycleRepository: class { getBugbotSourceBoundPullRequestIdentity = mockCurrent; },
}));

const binding = { owner: 'vypdev', repository: 'copilot', repositoryId: 19, defaultBranch: 'develop',
    token: 'write-token', evidenceToken: 'read-token', event: 'pull_request', policy: 'default' };
const environment = { GITHUB_RUN_ID: '21', GITHUB_RUN_ATTEMPT: '2', GITHUB_REPOSITORY: 'vypdev/copilot' };
const baseSha = 'a'.repeat(40);
const baseRefSha = 'b'.repeat(40);
const headSha = 'c'.repeat(40);
const url = 'https://github.com/vypdev/copilot';
const body = renderBugbotStatusCard(buildBugbotReviewProjection({
    pullRequestNumber: 11, analyzedHeadSha: headSha, verifiedHeadSha: headSha,
    findings: [], coverage: { status: 'complete', sources: [] },
}), 'en-US', { pullRequestUrl: url + '/pull/11', commitUrl: url + '/commit/' + headSha });
const request = { pullRequestNumber: 11, headSha, baseSha, baseRefSha, body };
const applied = {
    name: 'Publish Bugbot status card', head_sha: 'd'.repeat(40), conclusion: 'success',
    steps: [{ name: 'Publish canonical comment', conclusion: 'success' }],
};

beforeEach(() => {
    jest.resetAllMocks();
    mockRead.rest.repos.getContent.mockResolvedValue({ data: {
        type: 'file', encoding: 'base64', content: Buffer.from("COPILOT_BUGBOT_STATUS_CARD_WORKFLOW: 'write-v1'").toString('base64'),
    } });
    mockCurrent.mockResolvedValue({ number: 11, baseSha, baseRefSha, headSha, baseRepository: { id: 19 },
        headRepositoryOwner: 'vypdev', headRepositoryName: 'copilot', state: 'open' });
    mockWrite.request.mockResolvedValue({ data: { workflow_run_id: 42 } });
    mockRead.rest.actions.getWorkflowRun.mockResolvedValue({ data: {
        id: 42, repository: { id: 19 }, head_sha: applied.head_sha, head_branch: 'develop',
        event: 'workflow_dispatch', path: '.github/workflows/copilot_bugbot_status_card.yml', status: 'completed', conclusion: 'success',
    } });
    mockRead.rest.actions.listJobsForWorkflowRun.mockResolvedValue({ data: { jobs: [applied], total_count: 1 } });
});

it('honors the existing terminal route when the default branch does not have the publisher', async () => {
    mockRead.rest.repos.getContent.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({ data: [{ name: 'copilot_pull_request.yml' }] });
    await expect(createGithubBugbotStatusCardDispatcher(binding, environment)).resolves.toBeUndefined();
    expect(mockWrite.request).not.toHaveBeenCalled();
});

it('does not confuse an inaccessible file with an absent workflow', async () => {
    mockRead.rest.repos.getContent.mockRejectedValue({ status: 404 });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await expect(dispatcher!.terminal.publish(request)).rejects.toThrow('did not acknowledge publication');
    expect(mockWrite.request).not.toHaveBeenCalled();
});

it('sends a typed handoff to the default branch and waits for the exact write step', async () => {
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    expect(await dispatcher!.terminal.publish(request)).toBe('published');
    expect(mockWrite.request).toHaveBeenCalledWith(expect.stringContaining('/dispatches'), expect.objectContaining({
        ref: 'develop', return_run_details: true, inputs: expect.objectContaining({ pull_number: '11' }),
    }));
    const payload = mockWrite.request.mock.calls[0][1];
    expect(JSON.parse(payload.inputs.work)).toMatchObject({
        runId: 21, attempt: 2, kind: 'analysis-result', verifiedBody: body,
        source: { repositoryId: 19, pullNumber: 11, base: baseSha, baseRef: baseRefSha, head: headSha, policy: 'default' },
    });
    expect(mockRead.rest.actions.listJobsForWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ run_id: 42 }));
});

it('reads a private PR with the publication credential while native evidence retains its narrower token', async () => {
    mockCurrent.mockImplementation(async (_owner, _repo, _number, token) => {
        if (token !== binding.token) throw Object.assign(new Error('Pull requests read permission required'), { status: 403 });
        return { number: 11, baseSha, baseRefSha, headSha, baseRepository: { id: 19 },
            headRepositoryOwner: 'vypdev', headRepositoryName: 'copilot', state: 'open' };
    });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await expect(dispatcher!.terminal.publish(request)).resolves.toBe('published');
    expect(mockRead.rest.actions.getWorkflowRun).toHaveBeenCalled();
});

it('does not acknowledge a successful run when the publishing step was skipped', async () => {
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    mockRead.rest.actions.listJobsForWorkflowRun.mockResolvedValue({ data: {
        jobs: [{ ...applied, steps: [{ name: 'Publish canonical comment', conclusion: 'skipped' }] }], total_count: 1,
    } });
    await expect(dispatcher!.terminal.publish(request)).rejects.toThrow('did not acknowledge publication');
});

it('does not wake a writer with a stale head or an unrecognized workflow installation', async () => {
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await expect(dispatcher!.terminal.publish({ ...request, headSha: baseSha })).rejects.toThrow('did not acknowledge publication');
    await expect(dispatcher!.terminal.publish({ ...request, baseRefSha: baseSha })).rejects.toThrow('did not acknowledge publication');
    mockRead.rest.repos.getContent.mockRejectedValue({ status: 403 });
    const unknown = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await expect(unknown!.terminal.publish(request)).rejects.toThrow('did not acknowledge publication');
    expect(mockWrite.request).not.toHaveBeenCalled();
});

it('wakes progress with identifiers only and never waits for a comment from the detection session', async () => {
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await dispatcher!.wake({ stage: 'analyzing', pullNumber: 11, baseSha, baseRefSha, headSha, sequence: 2,
        observedAt: '2026-11-18T03:00:00.000Z', elapsedMs: 2000 });
    const payload = mockWrite.request.mock.calls[0][1];
    expect(JSON.parse(payload.inputs.work)).toMatchObject({ kind: 'progress', source: { head: headSha }, runId: 21, attempt: 2 });
    expect(JSON.parse(payload.inputs.work)).not.toHaveProperty('verifiedBody');
    expect(mockRead.rest.actions.getWorkflowRun).not.toHaveBeenCalled();
});
