import { createHash } from 'node:crypto';
import { createGithubBugbotStatusCardDispatcher } from '../github_bugbot_status_card_dispatch';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';
import { renderBugbotStatusCard } from '../../../application/policies/bugbot_review_presentation_policy';

const mockRead = { rest: {
    repos: { getContent: jest.fn() },
    actions: { getWorkflowRun: jest.fn(), listJobsForWorkflowRun: jest.fn(), getWorkflow: jest.fn(), listWorkflowRuns: jest.fn() },
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
        id: 42, repository: { id: 19 }, display_title: acceptedRun().display_title, run_attempt: 1, head_sha: applied.head_sha, head_branch: 'develop',
        event: 'workflow_dispatch', path: '.github/workflows/copilot_bugbot_status_card.yml', status: 'completed', conclusion: 'success',
    } });
    mockRead.rest.actions.getWorkflow.mockResolvedValue({ data: { id: 8, path: '.github/workflows/copilot_bugbot_status_card.yml' } });
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

const createdAt = '2026-11-19T17:00:00Z';
function acceptedRun(id = 42, override: Record<string, unknown> = {}) {
    const work = JSON.stringify({ version: 1, kind: 'analysis-result', runId: 21, attempt: 2,
        source: { repositoryId: 19, pullNumber: 11, base: baseSha, baseRef: baseRefSha, head: headSha, policy: 'default' },
        verifiedBody: body });
    return { id, repository: { id: 19 }, workflow_id: 8, path: '.github/workflows/copilot_bugbot_status_card.yml',
        event: 'workflow_dispatch', head_branch: 'develop', run_attempt: 1, created_at: createdAt,
        display_title: 'Bugbot status · PR 11 · ' + createHash('sha256').update(work).digest('hex'), ...override };
}
function acceptedWithoutId() {
    mockWrite.request.mockResolvedValue({ status: 204, data: undefined });
    const effect = mockRead.rest.actions.getWorkflowRun.getMockImplementation();
    mockRead.rest.actions.getWorkflowRun.mockImplementation((input: { run_id: number }) => input.run_id === 21
        ? Promise.resolve({ data: { id: 21, repository: { id: 19 }, run_attempt: 2, created_at: createdAt } })
        : effect!(input));
    mockRead.rest.actions.listWorkflowRuns.mockResolvedValue({ data: { total_count: 1, workflow_runs: [acceptedRun()] } });
}
async function failAcknowledgment(dispatcher: NonNullable<Awaited<ReturnType<typeof createGithubBugbotStatusCardDispatcher>>>) {
    const result = expect(dispatcher.terminal.publish(request)).rejects.toThrow('retry acknowledgment');
    await jest.runAllTimersAsync();
    await result;
    expect(mockWrite.request).toHaveBeenCalledTimes(1);
    expect(mockRead.rest.actions.listJobsForWorkflowRun).not.toHaveBeenCalled();
}

afterEach(() => jest.useRealTimers());

it('recovers a unique accepted 204 run bound to the exact handoff operation', async () => {
    acceptedWithoutId();
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await expect(dispatcher!.terminal.publish(request)).resolves.toBe('published');
    const sent = mockWrite.request.mock.calls[0][1].inputs;
    expect(sent.operation).toBe(createHash('sha256').update(sent.work).digest('hex'));
    expect(mockWrite.request).toHaveBeenCalledTimes(1);
    expect(mockRead.rest.actions.getWorkflowRun).toHaveBeenLastCalledWith(expect.objectContaining({ run_id: 42 }));
});

it('fails safely when an accepted dispatch has no matching run', async () => {
    jest.useFakeTimers(); acceptedWithoutId();
    mockRead.rest.actions.listWorkflowRuns.mockResolvedValue({ data: { total_count: 0, workflow_runs: [] } });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await failAcknowledgment(dispatcher!);
    expect(mockRead.rest.actions.listWorkflowRuns).toHaveBeenCalledTimes(6);
});

it('never adopts ambiguous accepted operations', async () => {
    jest.useFakeTimers(); acceptedWithoutId();
    mockRead.rest.actions.listWorkflowRuns.mockResolvedValue({ data: { total_count: 2, workflow_runs: [acceptedRun(), acceptedRun(43)] } });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await failAcknowledgment(dispatcher!);
});

it.each([
    ['workflow', { workflow_id: 9 }], ['ref', { head_branch: 'other' }],
    ['repository', { repository: { id: 20 } }], ['operation', { display_title: 'Bugbot status · PR 11' }],
])('rejects a merely recent run with foreign %s', async (_name, override) => {
    jest.useFakeTimers(); acceptedWithoutId();
    mockRead.rest.actions.listWorkflowRuns.mockResolvedValue({ data: { total_count: 1, workflow_runs: [acceptedRun(42, override)] } });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await failAcknowledgment(dispatcher!);
});

it('retains accepted dispatch state when lookup permissions are unavailable', async () => {
    jest.useFakeTimers(); acceptedWithoutId();
    mockRead.rest.actions.listWorkflowRuns.mockRejectedValue({ status: 403 });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await failAcknowledgment(dispatcher!);
    expect(mockRead.rest.actions.listWorkflowRuns).toHaveBeenCalledTimes(1);
});

it.each(['getWorkflow', 'getWorkflowRun', 'listWorkflowRuns'] as const)('retries a transient %s failure without repeating the accepted POST', async method => {
    jest.useFakeTimers(); acceptedWithoutId();
    const port = mockRead.rest.actions[method];
    port.mockRejectedValueOnce({ status: 503 });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    const result = expect(dispatcher!.terminal.publish(request)).resolves.toBe('published');
    await jest.runAllTimersAsync(); await result;
    expect(port.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockWrite.request).toHaveBeenCalledTimes(1);
});

it('replays acknowledgment after accepted dispatch without another POST or a false receipt', async () => {
    jest.useFakeTimers(); acceptedWithoutId();
    mockRead.rest.actions.listWorkflowRuns.mockRejectedValueOnce({ status: 403 });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await failAcknowledgment(dispatcher!);
    await expect(dispatcher!.terminal.publish(request)).resolves.toBe('published');
    expect(mockWrite.request).toHaveBeenCalledTimes(1);
});

it('rejects a direct ID for a different handoff even when workflow and ref match', async () => {
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    mockRead.rest.actions.getWorkflowRun.mockResolvedValue({ data: { ...acceptedRun(), display_title: 'foreign', status: 'completed', conclusion: 'success' } });
    await expect(dispatcher!.terminal.publish(request)).rejects.toThrow('retry acknowledgment');
    expect(mockRead.rest.actions.listJobsForWorkflowRun).not.toHaveBeenCalled();
});

it('recovers the one matching operation on a later complete page', async () => {
    acceptedWithoutId();
    const other = Array.from({ length: 100 }, (_, index) => acceptedRun(100 + index, { display_title: 'unrelated' }));
    mockRead.rest.actions.listWorkflowRuns.mockImplementation(({ page }: { page: number }) => Promise.resolve({ data: {
        total_count: 101, workflow_runs: page === 1 ? other : [acceptedRun()],
    } }));
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await expect(dispatcher!.terminal.publish(request)).resolves.toBe('published');
    expect(mockRead.rest.actions.listWorkflowRuns).toHaveBeenCalledTimes(2);
});

it('refuses a matching operation in an incomplete listing', async () => {
    jest.useFakeTimers(); acceptedWithoutId();
    mockRead.rest.actions.listWorkflowRuns.mockResolvedValue({ data: { total_count: 2, workflow_runs: [acceptedRun()] } });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await failAcknowledgment(dispatcher!);
});

it('does not redispatch after a lost POST response and concurrent acknowledgment retries', async () => {
    acceptedWithoutId();
    mockWrite.request.mockRejectedValueOnce({ status: 502 });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await expect(dispatcher!.terminal.publish(request)).rejects.toThrow('retry acknowledgment');
    await expect(Promise.all([dispatcher!.terminal.publish(request), dispatcher!.terminal.publish(request)]))
        .resolves.toEqual(['published', 'published']);
    expect(mockWrite.request).toHaveBeenCalledTimes(1);
    expect(mockRead.rest.actions.listWorkflowRuns).toHaveBeenCalledTimes(1);
});

it('refuses recovery when the origin attempt is replaced', async () => {
    jest.useFakeTimers(); acceptedWithoutId();
    mockRead.rest.actions.getWorkflowRun.mockResolvedValue({ data: { id: 21, repository: { id: 19 }, run_attempt: 3, created_at: createdAt } });
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    await failAcknowledgment(dispatcher!);
    expect(mockRead.rest.actions.listWorkflowRuns).not.toHaveBeenCalled();
});

it('dispatches distinct progress sequences while acknowledging a replay without another wake', async () => {
    const dispatcher = await createGithubBugbotStatusCardDispatcher(binding, environment);
    const observation = { stage: 'analyzing' as const, pullNumber: 11, baseSha, baseRefSha, headSha,
        observedAt: '2026-11-19T17:00:00Z', elapsedMs: 1, sequence: 2 };
    await dispatcher!.wake(observation);
    await dispatcher!.wake({ ...observation, sequence: 3 });
    await dispatcher!.wake({ ...observation, sequence: 3 });
    expect(mockWrite.request).toHaveBeenCalledTimes(2);
    const first = mockWrite.request.mock.calls[0][1].inputs;
    const second = mockWrite.request.mock.calls[1][1].inputs;
    expect(first.work).toBe(second.work);
    expect(first.operation).not.toBe(second.operation);
    expect(first.operation).toBe('2:' + createHash('sha256').update(first.work).digest('hex'));
});
