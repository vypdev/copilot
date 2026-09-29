import * as github from '@actions/github';
import { GithubSetupApprovalCheckDiscoveryAdapter } from '../github_setup_approval_check_discovery_adapter';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));

const sha = 'a'.repeat(40);
const owner = 'acme';
const repository = 'project';

function arrange(runs: unknown[], checks: unknown[], jobs: unknown[]): { listWorkflowRunsForRepo: jest.Mock; listForRef: jest.Mock; listJobsForWorkflowRunAttempt: jest.Mock; request: jest.Mock } {
  const listWorkflowRunsForRepo = jest.fn().mockResolvedValue({ data: { workflow_runs: runs } });
  const listForRef = jest.fn().mockResolvedValue({ data: { check_runs: checks } });
  const listJobsForWorkflowRunAttempt = jest.fn().mockResolvedValue({ data: { jobs } });
  const request = jest.fn().mockResolvedValue({ data: [] });
  (github.getOctokit as jest.Mock).mockReturnValue({ request, rest: {
    actions: { listWorkflowRunsForRepo, listJobsForWorkflowRunAttempt }, checks: { listForRef },
  } });
  return { listWorkflowRunsForRepo, listForRef, listJobsForWorkflowRunAttempt, request };
}

describe('GitHub setup approval check discovery', () => {
  beforeEach(() => jest.clearAllMocks());

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
    expect(calls.listWorkflowRunsForRepo).toHaveBeenCalledWith(expect.objectContaining({ owner, repo: repository, event: 'pull_request', per_page: 20 }));
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
