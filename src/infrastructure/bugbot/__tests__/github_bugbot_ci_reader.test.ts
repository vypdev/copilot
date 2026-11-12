import { createGitHubBugbotCiReader } from '../github_bugbot_ci_reader';

const sha = 'a'.repeat(40);
const repository = { owner: 'owner', repo: 'repo' };
const query = { sha, workflow: 'CI', job: 'tests', step: 'Browser suite', pullRequest: 9, revision: 'head' as const };
const run = { id: 10, head_sha: sha, name: 'CI', repository: { full_name: 'owner/repo' },
    event: 'pull_request', pull_requests: [{ number: 9 }], run_attempt: 2, workflow_id: 3,
    status: 'completed', conclusion: 'success' };
const job = { id: 11, name: 'tests', run_id: 10, run_attempt: 2, head_sha: sha, status: 'completed', conclusion: 'success',
    steps: [{ name: 'Browser suite', number: 3, status: 'completed', conclusion: 'skipped' }] };

function fixture(runs = [run], jobs = [job], count = runs.length) {
    const methods = {
        listWorkflowRunsForRepo: jest.fn().mockResolvedValue({ data: { workflow_runs: runs, total_count: count } }),
        listJobsForWorkflowRunAttempt: jest.fn().mockResolvedValue({ data: { jobs, total_count: jobs.length } }),
    };
    return { ...methods, read: createGitHubBugbotCiReader(repository, methods) };
}

it('reads exact workflow attempt and preserves a skipped step despite overall success', async () => {
    const f = fixture([run, { ...run, id: 9, run_attempt: 1 }]);
    const result = await f.read(query);
    expect(f.listWorkflowRunsForRepo).toHaveBeenCalledWith(expect.objectContaining({ head_sha: sha, ...repository }));
    expect(f.listJobsForWorkflowRunAttempt).toHaveBeenCalledWith(expect.objectContaining({ run_id: 10, attempt_number: 2 }));
    expect(result).toMatchObject({ status: 'ci-observed', runId: 10, attempt: 2, jobId: 11,
        lines: expect.arrayContaining([expect.stringContaining('Browser suite: completed, conclusion skipped')]) });
});

it.each([
    ['head', { ...run, head_sha: 'b'.repeat(40) }],
    ['repository', { ...run, repository: { full_name: 'another/repo' } }],
    ['pull request', { ...run, pull_requests: [{ number: 2 }] }],
    ['event', { ...run, event: 'pull_request_target' }],
])('does not use evidence from another %s', async (_label, foreign) => {
    const f = fixture([foreign]);
    await expect(f.read(query)).resolves.toEqual({ status: 'ci-no-match' });
    expect(f.listJobsForWorkflowRunAttempt).not.toHaveBeenCalled();
});

it('reports truncated, ambiguous, missing and inaccessible CI distinctly', async () => {
    await expect(fixture([run], [job], 101).read(query)).resolves.toEqual({ status: 'ci-search-limit' });
    await expect(fixture([run, { ...run, id: 9, workflow_id: 4 }]).read(query)).resolves.toEqual({ status: 'ci-ambiguous' });
    await expect(fixture([run], [job, { ...job, id: 12 }]).read(query)).resolves.toEqual({ status: 'ci-ambiguous' });
    await expect(fixture([run], [{ ...job, run_attempt: 1 }]).read(query)).resolves.toEqual({ status: 'ci-no-match' });
    const f = fixture();
    f.listWorkflowRunsForRepo.mockRejectedValueOnce(new Error('denied'));
    await expect(f.read(query)).resolves.toEqual({ status: 'ci-unavailable' });
});
