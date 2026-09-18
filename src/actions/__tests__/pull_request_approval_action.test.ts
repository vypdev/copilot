import * as github from '@actions/github';
import * as core from '@actions/core';
import { getGithubActionInput } from '../github_action_input';
import { ObservePullRequestApprovalUseCase } from '../../application/usecases/pull_request_approval/observe_pull_request_approval_use_case';
import { runPullRequestApprovalAction } from '../pull_request_approval_action';

const mockExecute = jest.fn().mockResolvedValue({
  decision: { status: 'pending', code: 'check-missing', detail: 'Waiting.' }, publication: 'published',
});

jest.mock('@actions/github', () => ({
  context: {
    payload: { repository: { id: 17 } }, repo: { owner: 'owner', repo: 'repo' },
    eventName: 'workflow_dispatch', actor: 'maintainer',
  },
  getOctokit: jest.fn(),
}));
jest.mock('@actions/core', () => ({
  info: jest.fn(), summary: { addRaw: jest.fn(), write: jest.fn() },
}));
jest.mock('../github_action_input', () => ({ getGithubActionInput: jest.fn() }));
jest.mock('../../application/usecases/pull_request_approval/observe_pull_request_approval_use_case', () => ({
  ObservePullRequestApprovalUseCase: jest.fn(),
}));
jest.mock('../../data/repository/pull_request/pull_request_approval_repository', () => ({
  PullRequestApprovalRepository: jest.fn().mockImplementation(() => ({})),
}));

function context(): { payload: Record<string, unknown>; repo: { owner: string; repo: string }; eventName: string; actor: string } {
  return github.context as unknown as ReturnType<typeof context>;
}

describe('trusted PR approval Action route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    context().payload = { repository: { id: 17 } };
    context().eventName = 'workflow_dispatch';
    context().actor = 'maintainer';
    (getGithubActionInput as jest.Mock).mockImplementation((name: string) => name === 'pr-approval-pr-number' ? '42' : '');
    (ObservePullRequestApprovalUseCase as jest.Mock).mockImplementation(() => ({ execute: mockExecute }));
    (core.summary.addRaw as jest.Mock).mockReturnValue(core.summary);
    (core.summary.write as jest.Mock).mockResolvedValue(undefined);
    (github.getOctokit as jest.Mock).mockReturnValue({ rest: { repos: {
      getCollaboratorPermissionLevel: jest.fn().mockResolvedValue({ data: { permission: 'write' } }),
    } } });
    mockExecute.mockResolvedValue({ decision: { status: 'pending', code: 'check-missing', detail: 'Waiting.' }, publication: 'published' });
  });

  it('requires an immutable repository ID in the event payload', async () => {
    context().payload = {};
    await expect(runPullRequestApprovalAction('pat')).rejects.toThrow('bound repository ID');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('requires a positive manual PR number and repository write permission', async () => {
    (getGithubActionInput as jest.Mock).mockReturnValue('0');
    await expect(runPullRequestApprovalAction('pat')).rejects.toThrow('positive PR number');
    (getGithubActionInput as jest.Mock).mockReturnValue('42');
    const octokit = github.getOctokit('pat');
    (octokit.rest.repos.getCollaboratorPermissionLevel as jest.Mock).mockResolvedValue({ data: { permission: 'read' } });
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    await expect(runPullRequestApprovalAction('pat')).rejects.toThrow('repository write permission');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rechecks one authorized manual PR', async () => {
    await runPullRequestApprovalAction('pat');
    expect(mockExecute).toHaveBeenCalledWith({ owner: 'owner', repository: 'repo', repositoryId: 17, pullNumber: 42 });
    expect(core.summary.write).toHaveBeenCalledTimes(1);
  });

  it('writes the recovery summary and fails when assessment publication is lost', async () => {
    mockExecute.mockResolvedValue({
      decision: { status: 'already-approved', code: 'approved', detail: 'Approved.' },
      reviewId: 19,
      publication: 'failed',
    });
    await expect(runPullRequestApprovalAction('pat')).rejects.toThrow('PR(s) 42');
    expect(core.summary.write).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a review post has an unknown result', async () => {
    mockExecute.mockResolvedValue({
      decision: { status: 'pending', code: 'publication-unknown', detail: 'Unknown.' },
      publication: 'published',
    });
    await expect(runPullRequestApprovalAction('pat')).rejects.toThrow('PR(s) 42');
    expect(core.summary.write).toHaveBeenCalledTimes(1);
  });

  it('uses one unambiguous workflow_run PR association as a wakeup', async () => {
    context().eventName = 'workflow_run';
    context().payload = { repository: { id: 17 }, action: 'completed', workflow_run: {
      head_repository: { id: 17 }, pull_requests: [{ number: 42 }], head_sha: 'a'.repeat(40),
    } };
    await runPullRequestApprovalAction('pat');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('skips an ambiguous or foreign workflow_run association', async () => {
    context().eventName = 'workflow_run';
    context().payload = { repository: { id: 17 }, action: 'completed', workflow_run: {
      head_repository: { id: 17 }, pull_requests: [{ number: 42 }, { number: 43 }], head_sha: 'a'.repeat(40),
    } };
    await runPullRequestApprovalAction('pat');
    expect(mockExecute).not.toHaveBeenCalled();
    context().payload = { repository: { id: 17 }, action: 'completed', workflow_run: {
      head_repository: { id: 18 }, pull_requests: [{ number: 42 }], head_sha: 'a'.repeat(40),
    } };
    await runPullRequestApprovalAction('pat');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('resolves an unassociated pull_request CI wakeup by its test-merge SHA', async () => {
    const mergeSha = 'c'.repeat(40);
    context().eventName = 'workflow_run';
    context().payload = { repository: { id: 17 }, action: 'completed', workflow_run: {
      head_repository: { id: 17 }, pull_requests: [], head_sha: mergeSha,
    } };
    (github.getOctokit as jest.Mock).mockReturnValue({ paginate: { iterator: jest.fn(async function* () {
      yield { data: [{ number: 42, head: { sha: 'a'.repeat(40), repo: { id: 17 } }, merge_commit_sha: mergeSha }] };
    }) }, rest: { pulls: { list: jest.fn() } } });
    await runPullRequestApprovalAction('pat');
    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ pullNumber: 42 }));
  });
});
