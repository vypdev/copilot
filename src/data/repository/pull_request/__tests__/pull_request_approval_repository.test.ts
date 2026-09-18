import * as github from '@actions/github';
import { PullRequestApprovalRepository } from '../pull_request_approval_repository';
import type { ApprovalEvidence } from '../../../../domain/pull_request_approval';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));

const target = { owner: 'owner', repository: 'repo', repositoryId: 17, pullNumber: 42 };
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const testedMerge = 'c'.repeat(40);
const publicationEvidence = { headSha: head, baseSha: base, checks: [] } as unknown as ApprovalEvidence;
const settings = {
  mainBranch: 'main', developmentBranch: 'develop',
  branchPrefixes: { feature: 'feature', bugfix: 'bugfix', documentation: 'docs', chore: 'chore' },
  bugbotSeverity: 'info', bugbotDryRun: false, bugbotIgnorePatterns: [],
};

function patOctokit() {
  const getRepoVariable = jest.fn().mockResolvedValue({ data: { value: 'repository' } });
  const getOrgVariable = jest.fn().mockResolvedValue({ data: { value: 'organization' } });
  const listComments = jest.fn();
  const client = {
    rest: {
      actions: { getRepoVariable, getOrgVariable },
      pulls: { get: jest.fn().mockResolvedValue({ data: { head: { sha: head }, base: { sha: base } } }) },
      users: { getAuthenticated: jest.fn().mockResolvedValue({ data: { id: 20 } }) },
      issues: {
        listComments,
        createComment: jest.fn().mockResolvedValue({}),
        updateComment: jest.fn().mockResolvedValue({}),
      },
    },
    paginate: {
      iterator: jest.fn(async function* () { yield { data: [] }; }),
    },
  };
  return client;
}

function checkOctokit(checkRuns: unknown[] = []) {
  return { rest: { checks: {
    listForRef: jest.fn().mockResolvedValue({ data: { total_count: checkRuns.length, check_runs: checkRuns } }),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  } } };
}

function evidenceOctokit(mergeParents = [base, head], attempt = 1, runConclusion?: string) {
  const pat = patOctokit();
  pat.rest.actions.getRepoVariable.mockResolvedValue({ data: { value: JSON.stringify({
    version: 1, mode: 'guarded', targetRoles: ['development'], branchKinds: ['feature'],
    requireLinkedIssue: true, additionalExcludedPaths: [],
    producerAttested: true,
    testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
    coverage: { mode: 'check', checkName: 'CI Check' },
    allowHumanDismissed: false, skipWhenHumanApproved: true,
  }) } });
  const listFiles = jest.fn();
  const listReviews = jest.fn();
  const listForRef = jest.fn();
  const listWorkflowRunsForRepo = jest.fn();
  const listJobsForWorkflowRunAttempt = jest.fn();
  pat.rest.pulls.get.mockResolvedValue({ data: {
    number: 42, state: 'open', draft: false, changed_files: 1,
    head: { sha: head, ref: 'feature/42-improve', repo: { id: 17 } },
    base: { sha: base, ref: 'develop', repo: { id: 17 } },
    mergeable: true, merge_commit_sha: testedMerge,
    user: { id: 10, type: 'User' }, body: 'Fixes #42',
  } });
  const client = {
    ...pat,
    rest: {
      ...pat.rest,
      pulls: { ...pat.rest.pulls, listFiles, listReviews },
      checks: { listForRef },
      actions: { ...pat.rest.actions, listWorkflowRunsForRepo, listJobsForWorkflowRunAttempt },
      git: { getCommit: jest.fn().mockResolvedValue({ data: { parents: mergeParents.map(sha => ({ sha })) } }) },
      repos: { getBranchProtection: jest.fn().mockRejectedValue({ status: 404 }) },
    },
    request: jest.fn().mockResolvedValue({ data: [{ type: 'pull_request', parameters: { dismiss_stale_reviews: true } }] }),
    paginate: { iterator: jest.fn(async function* (method: unknown, params: { ref?: string; head_sha?: string }) {
      if (method === listFiles) yield { data: [{ filename: 'src/feature.ts' }] };
      else if (method === listReviews || method === pat.rest.issues.listComments) yield { data: [] };
      else if (method === listForRef) yield { data: { check_runs: params.ref === testedMerge ? [{
        id: 70, name: 'CI Check', app: { id: 15368 }, head_sha: testedMerge,
        status: 'completed', conclusion: 'success', check_suite: { id: 9 },
      }, ...(attempt === 2 ? [{
        id: 71, name: 'CI Check', app: { id: 15368 }, head_sha: testedMerge,
        status: 'completed', conclusion: 'failure', check_suite: { id: 9 },
      }] : [])] : [] } };
      else if (method === listWorkflowRunsForRepo) yield { data: { workflow_runs: params.head_sha === testedMerge ? [{
        id: 50, name: 'CI Check', head_sha: testedMerge, check_suite_id: 9, run_attempt: attempt,
        status: 'completed', conclusion: runConclusion ?? (attempt === 2 ? 'failure' : 'success'),
      }] : [] } };
      else if (method === listJobsForWorkflowRunAttempt) yield { data: { jobs: [{
        check_run_url: `https://api.github.com/repos/owner/repo/check-runs/${attempt === 2 ? 71 : 70}`,
      }] } };
    }) },
  };
  return client;
}

describe('PullRequestApprovalRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prefers a repository policy Variable over organization scope', async () => {
    const pat = patOctokit();
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    const repository = new PullRequestApprovalRepository('pat', settings);
    await expect(repository.readPolicy(target)).resolves.toBe('repository');
    expect(pat.rest.actions.getOrgVariable).not.toHaveBeenCalled();
  });

  it('uses organization policy only when repository scope is absent', async () => {
    const pat = patOctokit();
    pat.rest.actions.getRepoVariable.mockRejectedValue({ status: 404 });
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    await expect(new PullRequestApprovalRepository('pat', settings).readPolicy(target)).resolves.toBe('organization');
  });

  it('does not interpret denied Variable access as disabled approval', async () => {
    const pat = patOctokit();
    pat.rest.actions.getRepoVariable.mockRejectedValue({ status: 403 });
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    await expect(new PullRequestApprovalRepository('pat', settings).readPolicy(target)).rejects.toEqual({ status: 403 });
  });

  it('creates one assessment and a separately identified supplemental Check', async () => {
    const pat = patOctokit();
    const checks = checkOctokit();
    (github.getOctokit as jest.Mock).mockReturnValueOnce(pat).mockReturnValueOnce(checks);
    const repository = new PullRequestApprovalRepository('pat', { ...settings, githubToken: 'job-token' });
    await repository.publishAssessment(target, publicationEvidence, { status: 'blocked', code: 'unsafe-rules', detail: 'Rule is unsafe.' });
    expect(pat.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(checks.rest.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Copilot / Approval', head_sha: head, external_id: 'copilot:approval:17:42', conclusion: 'failure',
    }));
  });

  it('does not overwrite another workflow’s same-name Check Run', async () => {
    const pat = patOctokit();
    const checks = checkOctokit([{ id: 90, name: 'Copilot / Approval', app: { slug: 'github-actions' }, external_id: 'another-owner' }]);
    (github.getOctokit as jest.Mock).mockReturnValueOnce(pat).mockReturnValueOnce(checks);
    const repository = new PullRequestApprovalRepository('pat', { ...settings, githubToken: 'job-token' });
    await repository.publishAssessment(target, publicationEvidence, { status: 'pending', code: 'check-missing', detail: 'Waiting.' });
    expect(checks.rest.checks.update).not.toHaveBeenCalled();
    expect(checks.rest.checks.create).toHaveBeenCalledTimes(1);
  });

  it('refuses an ambiguous or unbounded Check Run identity', async () => {
    const pat = patOctokit();
    const owned = { id: 90, name: 'Copilot / Approval', app: { slug: 'github-actions' }, external_id: 'copilot:approval:17:42' };
    const checks = checkOctokit([owned, { ...owned, id: 91 }]);
    (github.getOctokit as jest.Mock).mockReturnValueOnce(pat).mockReturnValueOnce(checks);
    const repository = new PullRequestApprovalRepository('pat', { ...settings, githubToken: 'job-token' });
    await expect(repository.publishAssessment(target, publicationEvidence, { status: 'blocked', code: 'unsafe-rules', detail: 'Unsafe.' }))
      .rejects.toThrow('ambiguous');
    expect(checks.rest.checks.update).not.toHaveBeenCalled();
  });

  it('never edits an assessment for a superseded PR head or base', async () => {
    const pat = patOctokit();
    pat.rest.pulls.get.mockResolvedValue({ data: { head: { sha: 'c'.repeat(40) }, base: { sha: base } } });
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    const repository = new PullRequestApprovalRepository('pat', settings);
    await expect(repository.publishAssessment(target, publicationEvidence, { status: 'pending', code: 'superseded', detail: 'Changed.' }))
      .rejects.toThrow('head or base changed');
    expect(pat.rest.issues.createComment).not.toHaveBeenCalled();
    pat.rest.pulls.get.mockResolvedValue({ data: { head: { sha: head }, base: { sha: 'd'.repeat(40) } } });
    await expect(repository.publishAssessment(target, publicationEvidence, { status: 'pending', code: 'superseded', detail: 'Changed.' }))
      .rejects.toThrow('head or base changed');
    expect(pat.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('binds pull_request CI on a synthetic merge to the exact current base and head', async () => {
    const pat = evidenceOctokit();
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    const snapshot = await new PullRequestApprovalRepository('pat', settings).loadEvidence(target);
    expect(snapshot).toMatchObject({ mergeCommitVerified: true, testedMergeSha: testedMerge });
    expect(snapshot.checks).toEqual([expect.objectContaining({
      name: 'CI Check', headSha: testedMerge, sourceAppId: 15368, workflowName: 'CI Check',
    })]);
  });

  it('rejects a synthetic merge with stale or mismatched parents', async () => {
    const pat = evidenceOctokit([base, 'd'.repeat(40)]);
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    const snapshot = await new PullRequestApprovalRepository('pat', settings).loadEvidence(target);
    expect(snapshot.mergeCommitVerified).toBe(false);
    expect(snapshot.testedMergeSha).toBeUndefined();
    expect(snapshot.checks).toEqual([]);
  });

  it('uses only check runs belonging to the current workflow retry attempt', async () => {
    const pat = evidenceOctokit([base, head], 2);
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    const snapshot = await new PullRequestApprovalRepository('pat', settings).loadEvidence(target);
    expect(snapshot.checks).toEqual([expect.objectContaining({
      name: 'CI Check', conclusion: 'failure', attempt: 2,
    })]);
  });

  it('does not treat a successful job in a failed workflow run as passing CI', async () => {
    const pat = evidenceOctokit([base, head], 1, 'failure');
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    const snapshot = await new PullRequestApprovalRepository('pat', settings).loadEvidence(target);
    expect(snapshot.checks[0].conclusion).toBe('failure');
  });
});
