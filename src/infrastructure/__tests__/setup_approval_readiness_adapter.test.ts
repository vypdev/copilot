import * as github from '@actions/github';
import { GithubSetupApprovalReadinessAdapter } from '../setup_approval_readiness_adapter';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approvalStaleReviewCases } from './fixtures/approval_stale_review_cases';
import { renderApprovalObserverWorkflow } from '../../domain/setup_approval_workflow';

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
    request: jest.fn().mockResolvedValue({ data: [{ type: 'pull_request', parameters: { dismiss_stale_reviews_on_push: true } }] }),
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

  it.each(approvalStaleReviewCases)('inspects stale review dismissal: $name', async ({ rules, classic, readable = true, dismissesStaleReviews }) => {
    const octokit = client();
    octokit.request.mockResolvedValue({ data: rules });
    if (classic !== undefined) octokit.rest.repos.getBranchProtection.mockResolvedValue({ data: classic });
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const facts = await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration);
    expect(facts.rules[0]).toMatchObject({ readable, dismissesStaleReviews });
  });

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
      { type: 'pull_request', parameters: { dismiss_stale_reviews_on_push: true } },
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

  it('does not accept ruleset evidence when classic protection inspection is denied', async () => {
    const octokit = client();
    octokit.rest.repos.getBranchProtection.mockRejectedValue({ status: 403 });
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const facts = await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration);
    expect(facts.rules[0]).toMatchObject({ readable: false, dismissesStaleReviews: false });
  });

  it('inspects the main target and detects a classic self-required approval check', async () => {
    const octokit = client();
    octokit.rest.repos.getBranchProtection.mockResolvedValue({ data: {
      required_pull_request_reviews: { dismiss_stale_reviews: true },
      required_status_checks: { checks: [{ context: 'Copilot / Approval' }] },
    } });
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const facts = await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', {
      ...configuration, pullRequestApproval: { ...configuration.pullRequestApproval, targetRoles: ['main'] },
    });
    expect(facts.rules).toEqual([{ role: 'main', branch: configuration.repository.mainBranch,
      readable: true, dismissesStaleReviews: true, approvalCheckCycle: true }]);
  });

  it('retains independent branch evidence when workflow inspection is unavailable', async () => {
    const octokit = client();
    octokit.paginate.mockRejectedValue(new Error('offline'));
    octokit.rest.repos.getContent.mockRejectedValue('offline');
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const facts = await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration);
    expect(facts).toMatchObject({ defaultBranchWorkflow: 'unavailable',
      missingWorkflowNames: ['Copilot - Pull Request', 'CI Check'], rules: [{ readable: true, dismissesStaleReviews: true }] });
  });

  it.each([[], { type: 'dir' }, { type: 'file' }])('rejects an observer response without file contents: %j', async data => {
    const octokit = client();
    octokit.rest.repos.getContent.mockResolvedValue({ data });
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    const facts = await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration);
    expect(facts.defaultBranchWorkflow).toBe('drift');
  });

  it('compares the distributed observer with the configured workflow instead of accepting drift', async () => {
    const octokit = client();
    const source = readFileSync(join(__dirname, '..', '..', '..', 'setup', 'workflows', 'copilot_pull_request_approval.yml'), 'utf8');
    const expected = renderApprovalObserverWorkflow(source, configuration.pullRequestApproval);
    octokit.rest.repos.getContent.mockResolvedValue({ data: { type: 'file', content: Buffer.from(expected).toString('base64') } });
    (github.getOctokit as jest.Mock).mockReturnValue(octokit);
    expect((await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration)).defaultBranchWorkflow).toBe('matching');
    octokit.rest.repos.getContent.mockResolvedValue({ data: { type: 'file', content: Buffer.from(`${expected}\n# drift`).toString('base64') } });
    expect((await new GithubSetupApprovalReadinessAdapter().inspect('owner', 'repo', 'setup-pat', configuration)).defaultBranchWorkflow).toBe('drift');
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
