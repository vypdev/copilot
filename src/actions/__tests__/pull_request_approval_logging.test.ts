import * as core from '@actions/core';
import * as github from '@actions/github';
import { runPullRequestApprovalAction } from '../pull_request_approval_action';
import { resetApplicationLogger } from '../../application/ports/logging_ports';
import { clearAccumulatedLogs, getAccumulatedLogsAsText } from '../../utils/logger';
const repoVariable = jest.fn(), orgVariable = jest.fn();
jest.mock('@actions/github', () => ({ context: { payload: { repository: { id: 17 } }, repo: { owner: 'owner', repo: 'repo' },
  eventName: 'workflow_dispatch', actor: 'maintainer' }, getOctokit: jest.fn() }));
jest.mock('@actions/core', () => ({ info: jest.fn(), summary: { addRaw: jest.fn(), write: jest.fn() } }));
jest.mock('../github_action_input', () => ({ getGithubActionInput: (name: string) => name === 'pr-approval-pr-number' ? '42' : '' }));
describe('dedicated observer diagnostics through the actual SDK and runtime logger', () => {
  beforeEach(() => {
    jest.clearAllMocks(); resetApplicationLogger(); clearAccumulatedLogs();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    (core.summary.addRaw as jest.Mock).mockReturnValue(core.summary);
    (core.summary.write as jest.Mock).mockResolvedValue(undefined);
    (github.getOctokit as jest.Mock).mockReturnValue({ rest: {
      repos: { getCollaboratorPermissionLevel: jest.fn().mockResolvedValue({ data: { permission: 'write' } }) },
      actions: { getRepoVariable: repoVariable, getOrgVariable: orgVariable },
    } });
  });
  afterEach(() => { resetApplicationLogger(); clearAccumulatedLogs(); jest.restoreAllMocks(); });
  it.each([
    { scope: 'repository-variable', status: 403, code: 'http-403', org: false },
    { scope: 'organization-variable', status: 403, code: 'http-403', org: true },
    { scope: 'repository-variable', status: undefined, code: 'http-unavailable', org: false },
  ])('reports only the closed $scope / $code diagnostic on its independent lifecycle', async ({ scope, status, code, org }) => {
    const cause = Object.assign(new Error('private-provider-message token-secret'), { status,
      response: { data: 'private-response' } });
    repoVariable.mockRejectedValue(org ? { status: 404 } : cause); orgVariable.mockRejectedValue(cause);
    await expect(runPullRequestApprovalAction('runtime-pat')).rejects.toMatchObject({ recovery: { variables: { operation: 'policy', reason: status === 403 ? 'http-403' : 'transport-unavailable' } } });
    const expected = `Approval policy read failed (${scope}, ${code}).`;
    expect(console.log).toHaveBeenCalledWith(expected);
    expect(getAccumulatedLogsAsText()).toContain(expected);
    expect(getAccumulatedLogsAsText()).not.toContain('private');
    expect(getAccumulatedLogsAsText()).not.toContain('token-secret');
    const summary = (core.summary.addRaw as jest.Mock).mock.calls.map(call => call[0]).join('');
    expect(summary).toContain('policy-unavailable'); expect(summary).toContain('Assessment: not-applicable');
    expect(summary).not.toContain('private');
    expect(repoVariable).toHaveBeenCalledTimes(1);
    expect(orgVariable).toHaveBeenCalledTimes(org ? 1 : 0);
  });
});
