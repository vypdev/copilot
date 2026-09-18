import * as github from '@actions/github';
import { GithubSetupApprovalReadinessAdapter } from '../setup_approval_readiness_adapter';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));

const configuration = {
  ...createDefaultSetupConfiguration(),
  pullRequestApproval: {
    ...createDefaultSetupConfiguration().pullRequestApproval,
    mode: 'guarded' as const,
    producerAttested: true,
    testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
    coverage: { mode: 'check' as const, checkName: 'CI Check' },
  },
};

function client() {
  return {
    request: jest.fn().mockResolvedValue({ data: [{ type: 'pull_request', parameters: { dismiss_stale_reviews: true } }] }),
    rest: {
      repos: {
        getBranchProtection: jest.fn().mockRejectedValue({ status: 404 }),
        get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        getContent: jest.fn().mockRejectedValue({ status: 404 }),
      },
      actions: { listRepoWorkflows: jest.fn() },
    },
    paginate: jest.fn().mockResolvedValue([
      { name: 'Copilot - Pull Request', state: 'active' },
      { name: 'CI Check', state: 'active' },
    ]),
  };
}

describe('GitHub approval readiness inspection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('finds safe branch rules and active declared producer workflows without mutating GitHub', async () => {
    const octokit = client();
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const facts = await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration);
    expect(facts).toEqual({
      defaultBranchWorkflow: 'missing',
      rules: [{ role: 'development', branch: configuration.repository.developmentBranch,
        readable: true, dismissesStaleReviews: true, approvalCheckCycle: false }],
      missingWorkflowNames: [],
    });
    expect(octokit.rest.repos.getContent).toHaveBeenCalledWith(expect.objectContaining({ ref: 'main' }));
  });

  it('detects a self-required approval Check and disabled CI producer', async () => {
    const octokit = client();
    octokit.request.mockResolvedValue({ data: [
      { type: 'pull_request', parameters: { dismiss_stale_reviews: true } },
      { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'Copilot / Approval' }] } },
    ] });
    octokit.paginate.mockResolvedValue([
      { name: 'Copilot - Pull Request', state: 'active' },
      { name: 'CI Check', state: 'disabled_manually' },
    ]);
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const facts = await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration);
    expect(facts.rules[0].approvalCheckCycle).toBe(true);
    expect(facts.missingWorkflowNames).toEqual(['CI Check']);
  });

  it('treats denied rule inspection as unreadable instead of assuming a safe branch', async () => {
    const octokit = client();
    octokit.request.mockRejectedValue({ status: 403 });
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const facts = await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration);
    expect(facts.rules[0]).toMatchObject({ readable: false, dismissesStaleReviews: false });
  });

  it('accepts only the exact trusted local-action observer in the source repository', async () => {
    const octokit = client();
    const source = readFileSync(join(__dirname, '..', '..', '..', 'setup', 'source-workflows', 'copilot_pull_request_approval.yml'), 'utf8');
    octokit.rest.repos.getContent.mockResolvedValue({ data: { type: 'file', content: Buffer.from(source).toString('base64') } });
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const matching = await new GithubSetupApprovalReadinessAdapter().inspect('vypdev', 'copilot', 'setup-pat', configuration);
    expect(matching.defaultBranchWorkflow).toBe('matching');
    octokit.rest.repos.getContent.mockResolvedValue({ data: { type: 'file', content: Buffer.from(source.replace('persist-credentials: false', 'persist-credentials: true')).toString('base64') } });
    const drifted = await new GithubSetupApprovalReadinessAdapter().inspect('vypdev', 'copilot', 'setup-pat', configuration);
    expect(drifted.defaultBranchWorkflow).toBe('drift');
  });
});
