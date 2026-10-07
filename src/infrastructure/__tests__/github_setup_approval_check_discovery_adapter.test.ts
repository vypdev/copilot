import * as github from '@actions/github';
import { GithubSetupApprovalCheckDiscoveryAdapter } from '../github_setup_approval_check_discovery_adapter';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));

const sha = 'a'.repeat(40);
const owner = 'acme';
const repository = 'project';

function arrange(runs: unknown[], checks: unknown[], jobs: unknown[]): { listWorkflowRunsForRepo: jest.Mock; listForRef: jest.Mock; listJobsForWorkflowRunAttempt: jest.Mock; request: jest.Mock } {
  const listWorkflowRunsForRepo = jest.fn().mockResolvedValue({ data: { workflow_runs: runs.map(run => ({
    event: 'pull_request', created_at: '2026-10-06T00:00:00Z', ...(run as object),
  })) } });
  const listForRef = jest.fn().mockResolvedValue({ data: { check_runs: checks } });
  const listJobsForWorkflowRunAttempt = jest.fn().mockResolvedValue({ data: { jobs } });
  const request = jest.fn().mockResolvedValue({ data: [] });
  (github.getOctokit as jest.Mock).mockReturnValue({ request, rest: {
    actions: { listWorkflowRunsForRepo, listJobsForWorkflowRunAttempt }, checks: { listForRef },
  } });
  return { listWorkflowRunsForRepo, listForRef, listJobsForWorkflowRunAttempt, request };
}

describe('GitHub setup approval check discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-07T12:00:00Z'));
  });
  afterEach(() => jest.restoreAllMocks());

  test('reads one page of the latest 100 runs without GitHub historical search filters', async () => {
    const calls = arrange([], [], []);
    await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret');
    expect(calls.listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(calls.listWorkflowRunsForRepo).toHaveBeenCalledWith({ owner, repo: repository, per_page: 100, page: 1 });
    expect(calls.listForRef).not.toHaveBeenCalled();
  });

  test('ignores historical, future and malformed dates and non-PR events', async () => {
    const calls = arrange(['2026-03-14T11:28:34Z', '2026-07-09T11:59:59Z', '2026-10-07T12:00:01Z', 'invalid', undefined]
      .map((created_at, index) => ({ id: index + 1, name: 'CI', event: 'pull_request', head_sha: sha, run_attempt: 1, status: 'completed', created_at }))
      .concat([{ id: 10, name: 'Push CI', head_sha: sha, run_attempt: 1, status: 'completed', created_at: '2026-10-06T00:00:00Z', event: 'push' }]), [], []);
    expect(await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret'))
      .toEqual({ status: 'no-verifiable-checks', candidates: [] });
    expect(calls.listForRef).not.toHaveBeenCalled();
    expect(calls.listJobsForWorkflowRunAttempt).not.toHaveBeenCalled();
  });

  test('sorts by creation time before the 15-run inspection limit and keeps the newest producer evidence', async () => {
    const calls = arrange(Array.from({ length: 30 }, (_, index) => ({ id: index + 1, name: 'CI', head_sha: sha,
      run_attempt: 1, status: 'completed', created_at: `2026-10-06T00:${String(index).padStart(2, '0')}:00Z` })),
    [{ id: 90, name: 'Tests', app: { id: 12 }, head_sha: sha, conclusion: 'success' }],
    [{ name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/90' }]);
    const result = await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret');
    expect(calls.listJobsForWorkflowRunAttempt.mock.calls.map(([args]) => args.run_id)).toEqual(
      Array.from({ length: 15 }, (_, index) => 30 - index));
    expect(calls.listForRef).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ runUrl: 'https://github.com/acme/project/actions/runs/30',
      observedAt: '2026-10-06T00:29:00Z' });
    expect(result.truncated).toBe(true);
  });

  test('accepts the exact 90-day boundary and never expands a returned page beyond 100 runs', async () => {
    const calls = arrange(Array.from({ length: 101 }, (_, index) => ({ id: index + 1, name: 'CI', head_sha: sha,
      run_attempt: 1, status: 'completed', created_at: index === 100 ? '2026-10-07T12:00:00Z' : '2026-07-09T12:00:00Z' })),
    [{ id: 90, name: 'Tests', app: { id: 12 }, head_sha: sha, conclusion: 'success' }],
    [{ name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/90' }]);
    const result = await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret');
    expect(result.status).toBe('observed');
    expect(calls.listJobsForWorkflowRunAttempt).toHaveBeenCalledTimes(15);
    expect(calls.listJobsForWorkflowRunAttempt.mock.calls.some(([args]) => args.run_id === 101)).toBe(false);
  });

  test('marks only an exact check/App pair required by an active branch ruleset', async () => {
    const calls = arrange(
      [{ id: 42, name: 'CI', head_sha: sha, run_attempt: 1, status: 'completed' }],
      [{ id: 90, name: 'Tests', app: { id: 12 }, head_sha: sha, conclusion: 'success' },
        { id: 91, name: 'Other', app: { id: 99 }, head_sha: sha, conclusion: 'success' }],
      [{ name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/90' },
        { name: 'Other', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/91' }],
    );
    calls.request.mockResolvedValueOnce({ data: [{ type: 'required_status_checks', ruleset_id: 7,
      ruleset_source_type: 'Repository', ruleset_source: 'acme/project',
      parameters: { required_status_checks: [{ context: 'Tests', integration_id: 12 }, { context: 'Other', integration_id: 12 }] } }] });
    const result = await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret', 'develop');
    expect(calls.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/rules/branches/{branch}',
      expect.objectContaining({ branch: 'develop', per_page: 100 }));
    expect(result.candidates[0].requiredByRuleset).toEqual({ branch: 'develop', sourceUrl: 'https://github.com/acme/project/rules/7' });
    expect(result.candidates[1].requiredByRuleset).toBeUndefined();
  });

  test('suggests only exact jobs joined to a completed PR workflow and Check Run App ID', async () => {
    const calls = arrange(
      [{ id: 42, name: 'CI', head_sha: sha, run_attempt: 2, status: 'completed', conclusion: 'success', created_at: '2026-09-29T00:00:00Z' }],
      [{ id: 90, name: 'Tests', app: { id: 12, name: 'GitHub Actions' }, head_sha: sha, conclusion: 'success' },
        { id: 91, name: 'Foreign', app: { id: 34 }, head_sha: sha, conclusion: 'success' }],
      [{ name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/90' }],
    );
    const result = await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret');
    expect(result).toEqual({ status: 'observed', candidates: [{ name: 'Tests', sourceAppId: 12, sourceAppName: 'GitHub Actions', workflowName: 'CI',
      runUrl: 'https://github.com/acme/project/actions/runs/42', headSha: sha, conclusion: 'success', observedAt: '2026-09-29T00:00:00Z' }] });
    expect(calls.listWorkflowRunsForRepo).toHaveBeenCalledWith(expect.objectContaining({ owner, repo: repository, per_page: 100, page: 1 }));
    expect(calls.listForRef).toHaveBeenCalledWith(expect.objectContaining({ ref: sha, filter: 'all' }));
    expect(calls.listJobsForWorkflowRunAttempt).toHaveBeenCalledWith(expect.objectContaining({ run_id: 42, attempt_number: 2 }));
  });

  test('does not invent identities from a job name, skipped workflow or unsafe producer', async () => {
    arrange(
      [{ id: 42, name: 'CI', head_sha: sha, run_attempt: 1, status: 'completed' },
        { id: 43, name: 'Copilot - Approval', head_sha: sha, run_attempt: 1, status: 'completed' },
        { id: 44, name: 'Pending', head_sha: sha, run_attempt: 1, status: 'in_progress' }],
      [{ id: 90, name: 'Tests|fake', app: { id: 12 }, head_sha: sha, conclusion: 'success' },
        { id: 91, name: 'Tests', app: null, head_sha: sha, conclusion: 'success' },
        { id: 92, name: 'Tests', app: { id: 12 }, head_sha: 'b'.repeat(40), conclusion: 'success' },
        { id: 93, name: 'Tests\u202eevil', app: { id: 12 }, head_sha: sha, conclusion: 'success' }],
      [{ name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/90' },
        { name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/91' },
        { name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/92' },
        { name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/93' }],
    );
    expect(await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret')).toEqual({ status: 'no-verifiable-checks', candidates: [] });
  });

  test('distinguishes no recent PR runs from missing permission and provider outage', async () => {
    const empty = arrange([], [], []);
    expect(await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret'))
      .toEqual({ status: 'no-recent-runs', candidates: [] });
    empty.listWorkflowRunsForRepo.mockRejectedValueOnce(Object.assign(new Error('denied'), { status: 403 }));
    expect(await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret'))
      .toEqual({ status: 'permission-denied', candidates: [] });
    empty.listWorkflowRunsForRepo.mockRejectedValueOnce(new Error('offline'));
    expect(await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret'))
      .toEqual({ status: 'unavailable', candidates: [] });
  });

  test('does not claim ruleset evidence when rules are malformed or GitHub denies inspection', async () => {
    const calls = arrange([{ id: 42, name: 'CI', head_sha: sha, run_attempt: 1, status: 'completed' }],
      [{ id: 90, name: 'Tests', app: { id: 12 }, head_sha: sha, conclusion: 'success' }],
      [{ name: 'Tests', check_run_url: 'https://api.github.com/repos/acme/project/check-runs/90' }]);
    calls.request.mockResolvedValueOnce({ data: [{ type: 'required_status_checks', ruleset_id: 0,
      ruleset_source_type: 'Repository', ruleset_source: 'acme/project',
      parameters: { required_status_checks: [{ context: 'Tests', integration_id: 12 }] } }] });
    expect((await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret', 'develop'))
      .candidates[0].requiredByRuleset).toBeUndefined();
    calls.request.mockRejectedValueOnce(Object.assign(new Error('denied'), { status: 403 }));
    expect((await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret', 'develop'))
      .candidates[0].requiredByRuleset).toBeUndefined();
  });

  test('maps a later Check Runs failure to a nonempty error status instead of an empty trusted list', async () => {
    const calls = arrange([{ id: 42, name: 'CI', head_sha: sha, run_attempt: 1, status: 'completed' }], [], []);
    calls.listForRef.mockRejectedValueOnce(Object.assign(new Error('denied'), { status: 403 }));
    expect(await new GithubSetupApprovalCheckDiscoveryAdapter().discover(owner, repository, 'secret'))
      .toEqual({ status: 'permission-denied', candidates: [] });
  });
});
