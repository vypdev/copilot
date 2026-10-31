import { runUpdatePullRequestDescriptionWorkflow } from '../../../../application/usecases/steps/pull_request/update_pull_request_description_workflow';
import { PullRequestLifecycleRepository } from '../pull_request_lifecycle_repository';
import { bindPullRequestDescription } from '../../../../infrastructure/composition/lifecycle_capability_port_binding';
import { readConfigurationBlock, writeConfigurationBlock } from '../../../../manager/description/configuration_markers';
import { decidePullRequestApproval } from '../../../../domain/pull_request_approval';
import { parsePullRequestApprovalPolicy } from '../../../../domain/pull_request_approval_policy';
import { logInfo } from '../../../../application/ports/logging_ports';
import * as github from '@actions/github';
import { PullRequestApprovalRepository } from '../pull_request_approval_repository';
import type { ApprovalEvidence } from '../../../../domain/pull_request_approval';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY, serializePullRequestApprovalPolicy } from '../../../../domain/pull_request_approval_policy';
import { approvalCoverageZip } from './fixtures/approval_coverage_zip_fixture';
import { approvalStaleReviewCases } from '../../../../infrastructure/__tests__/fixtures/approval_stale_review_cases';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));
jest.mock('../../../../application/ports/logging_ports', () => ({ logInfo: jest.fn(), logDebugInfo: jest.fn(), logError: jest.fn() }));
jest.mock('../../../../utils/logger', () => ({ logInfo: jest.fn(), logDebugInfo: jest.fn(), logError: jest.fn() }));

const target = { owner: 'owner', repository: 'repo', repositoryId: 17, pullNumber: 42 };
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const testedMerge = 'c'.repeat(40);
const publicationEvidence = { headSha: head, baseSha: base, baseRef: 'develop', checks: [] } as unknown as ApprovalEvidence;
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
      pulls: { get: jest.fn().mockResolvedValue({ data: { head: { sha: head }, base: { sha: base, ref: 'develop' } } }),
        createReview: jest.fn().mockResolvedValue({ data: { id: 33, commit_id: head, user: { id: 20 }, state: 'APPROVED' } }) },
      users: { getAuthenticated: jest.fn().mockResolvedValue({ data: { id: 20 } }) },
      git: { getRef: jest.fn().mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: base } } }) },
      issues: {
        listComments,
        createComment: jest.fn().mockResolvedValue({}),
        updateComment: jest.fn().mockResolvedValue({}),
      },
    },
    paginate: {
      iterator: jest.fn(async function* (): AsyncGenerator<{ data: unknown }> { yield { data: [] }; }),
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
    head: { sha: head, ref: 'feature/43-improve', repo: { id: 17 } },
    base: { sha: base, ref: 'develop', repo: { id: 17 } },
    mergeable: true, merge_commit_sha: testedMerge,
    user: { id: 10, type: 'User' }, body: 'Fixes #43',
  } });
  const client = {
    ...pat,
    rest: {
      ...pat.rest,
      pulls: { ...pat.rest.pulls, listFiles, listReviews },
      checks: { listForRef },
      actions: { ...pat.rest.actions, listWorkflowRunsForRepo, listJobsForWorkflowRunAttempt,
        listWorkflowRunArtifacts: jest.fn(), downloadArtifact: jest.fn() },
      git: { ...pat.rest.git, getCommit: jest.fn().mockResolvedValue({ data: { parents: mergeParents.map(sha => ({ sha })) } }) },
      repos: { getBranchProtection: jest.fn().mockRejectedValue({ status: 404 }) },
    },
    request: jest.fn().mockResolvedValue({ data: [{ type: 'pull_request', parameters: { dismiss_stale_reviews_on_push: true } }] }),
    paginate: { iterator: jest.fn(async function* (method: unknown, params: { ref?: string; head_sha?: string }): AsyncGenerator<{ data: unknown }> {
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

function evidenceFixture() {
  const pat = evidenceOctokit();
  const original = pat.paginate.iterator.getMockImplementation()!;
  const pages = new Map<unknown, readonly unknown[]>();
  pat.paginate.iterator.mockImplementation(async function* (method, params) {
    const selected = pages.get(method);
    if (selected) for (const data of selected) yield { data };
    else yield* original(method, params);
  });
  (github.getOctokit as jest.Mock).mockReturnValue(pat);
  return { pat, pages, repository: new PullRequestApprovalRepository('pat', settings) };
}

function nativeCheckFixture() {
  const pat = evidenceOctokit();
  const original = pat.paginate.iterator.getMockImplementation()!;
  const listForRef = jest.fn();
  const checks = {
    rest: { checks: { listForRef } },
    paginate: { iterator: jest.fn(async function* (method: unknown, params: { ref?: string; head_sha?: string }) {
      if (method !== listForRef) throw new Error('Unexpected native check operation.');
      yield* original(pat.rest.checks.listForRef, params);
    }) },
  };
  pat.paginate.iterator.mockImplementation(async function* (method, params) {
    if (method === pat.rest.checks.listForRef) throw { status: 403 };
    yield* original(method, params);
  });
  (github.getOctokit as jest.Mock).mockReturnValueOnce(pat).mockReturnValueOnce(checks);
  const repository = new PullRequestApprovalRepository('pat', { ...settings, githubToken: 'job-token' });
  return { pat, checks, repository };
}

function numericFixture() {
  const f = evidenceFixture();
  f.pat.rest.actions.getRepoVariable.mockResolvedValue({ data: { value: serializePullRequestApprovalPolicy({
    ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, mode: 'recommend', producerAttested: true,
    testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
    coverage: { mode: 'numeric', checkName: 'CI Check', minDiffPercent: 80, artifactWorkflowName: 'CI Check', reporterAttested: true },
  }) } });
  const artifact = { id: 60, name: 'copilot-diff-coverage-v1', expired: false, size_in_bytes: 500 };
  const attestation = { version: 1, repositoryId: 17, pullNumber: 42, headSha: head, baseSha: base,
    workflowRunId: 50, workflowRunAttempt: 1, coveredChangedLines: 8, totalChangedLines: 10 };
  f.pages.set(f.pat.rest.actions.listWorkflowRunArtifacts, [{ artifacts: [artifact] }]);
  f.pat.rest.actions.downloadArtifact.mockResolvedValue({ data: approvalCoverageZip(attestation) });
  return { ...f, artifact, attestation };
}

function bugbotCard(statusHead = head, pr = 42, evidenceHead = statusHead, digest = 'deadbeef', count = '0') {
  return `<!-- copilot-bugbot-status schema="1" pr="${pr}" verified_head="${statusHead}" digest="deadbeef" -->\n`
    + `<!-- copilot-bugbot-approval-evidence schema="1" head="${evidenceHead}" digest="${digest}" outcome="complete" coverage="complete" open="${count}" reopened="0" dismissed="0" verification="0" unknown="0" -->`;
}

describe('PullRequestApprovalRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the native check credential for both revisions and retains bot review identity', async () => {
    const f = nativeCheckFixture();
    const evidence = await f.repository.loadEvidence(target);
    expect(evidence.checks).toEqual([expect.objectContaining({
      name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check', headSha: testedMerge,
    })]);
    for (const ref of [head, testedMerge]) {
      expect(f.checks.paginate.iterator).toHaveBeenCalledWith(f.checks.rest.checks.listForRef,
        expect.objectContaining({ owner: 'owner', repo: 'repo', ref, filter: 'all', per_page: 100 }));
    }
    await f.repository.submitApproval(target, head, 'Verified current evidence');
    expect(f.pat.rest.users.getAuthenticated).toHaveBeenCalled();
    expect(f.pat.rest.actions.getRepoVariable).toHaveBeenCalled();
    expect(f.pat.rest.pulls.createReview).toHaveBeenCalledWith(expect.objectContaining({
      commit_id: head, event: 'APPROVE',
    }));
    expect(f.pat.paginate.iterator.mock.calls.some(([method]) => method === f.pat.rest.checks.listForRef)).toBe(false);
  });

  it.each([[head, 'head-checks'], [testedMerge, 'merge-checks']])(
    'fails closed after the native check credential cannot read %s without PAT fallback', async (ref, operation) => {
      const f = nativeCheckFixture();
      const original = f.checks.paginate.iterator.getMockImplementation()!;
      f.checks.paginate.iterator.mockImplementation(async function* (method, params) {
        if (params.ref === ref) throw { status: 403, message: 'PRIVATE-CREDENTIAL' };
        yield* original(method, params);
      });
      await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({
        code: 'authorization.denied', recovery: { variables: { operation, reason: 'http-403' } },
      });
      expect(f.pat.paginate.iterator.mock.calls.some(([method]) => method === f.pat.rest.checks.listForRef)).toBe(false);
      expect(f.pat.rest.pulls.createReview).not.toHaveBeenCalled();
      expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('PRIVATE-CREDENTIAL');
    });

  it('rejects malformed pages from the native check credential', async () => {
    const f = nativeCheckFixture();
    f.checks.paginate.iterator.mockImplementation(async function* () { yield { data: { check_runs: null } }; });
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({
      recovery: { variables: { operation: 'head-checks', reason: 'invalid-page' } },
    });
    expect(f.pat.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it('retains the bounded inventory with the native check credential', async () => {
    const f = nativeCheckFixture();
    f.checks.paginate.iterator.mockImplementation(async function* () { yield { data: { check_runs: Array(3001).fill({}) } }; });
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({
      recovery: { variables: { operation: 'head-checks', reason: 'page-limit' } },
    });
    expect(f.pat.rest.pulls.createReview).not.toHaveBeenCalled();
  });

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
    await expect(new PullRequestApprovalRepository('pat', settings).readPolicy(target)).rejects.toMatchObject({ code: 'authorization.denied', retryable: false, recovery: { variables: { operation: 'policy', reason: 'http-403' } } });
    expect(logInfo).toHaveBeenCalledWith('Approval policy read failed (repository-variable, http-403).');
  });

  it('identifies organization-scope denial without emitting raw provider diagnostics', async () => {
    const pat = patOctokit();
    pat.rest.actions.getRepoVariable.mockRejectedValue({ status: 404 });
    const failure = { status: 403, message: 'PRIVATE-CREDENTIAL', response: { data: 'PRIVATE-POLICY' } };
    pat.rest.actions.getOrgVariable.mockRejectedValue(failure);
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    await expect(new PullRequestApprovalRepository('pat', settings).readPolicy(target)).rejects.toMatchObject({ recovery: { variables: { operation: 'policy', reason: 'http-403' } } });
    expect(logInfo).toHaveBeenCalledWith('Approval policy read failed (organization-variable, http-403).');
    expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('PRIVATE-');
  });
  it.each(['PRIVATE-CREDENTIAL', 499])('contains unrecognized provider status %s in a closed unavailable code', async status => {
    const pat = patOctokit(); const failure = { status, message: 'PRIVATE-CREDENTIAL' };
    pat.rest.actions.getRepoVariable.mockRejectedValue(failure);
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    await expect(new PullRequestApprovalRepository('pat', settings).readPolicy(target)).rejects.toMatchObject({ code: 'provider.contract-invalid', retryable: false, recovery: { variables: { operation: 'policy', reason: 'invalid-response' } } });
    expect(logInfo).toHaveBeenCalledWith('Approval policy read failed (repository-variable, http-unavailable).');
    expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('PRIVATE-');
    expect(pat.rest.actions.getOrgVariable).not.toHaveBeenCalled();
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
    pat.rest.pulls.get.mockResolvedValue({ data: { head: { sha: head }, base: { sha: base, ref: 'develop' } } });
    pat.rest.git.getRef.mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: 'd'.repeat(40) } } });
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

  it('reports genuinely absent policy only after both native scopes return 404', async () => {
    const pat = patOctokit(); pat.rest.actions.getRepoVariable.mockRejectedValue({ status: 404 });
    pat.rest.actions.getOrgVariable.mockRejectedValue({ status: 404 }); (github.getOctokit as jest.Mock).mockReturnValue(pat);
    await expect(new PullRequestApprovalRepository('pat', settings).readPolicy(target)).resolves.toBeUndefined();
    expect(logInfo).not.toHaveBeenCalled();
  });
  it('submits native approval only at the explicitly supplied immutable commit', async () => {
    const pat = patOctokit(); (github.getOctokit as jest.Mock).mockReturnValue(pat);
    expect(await new PullRequestApprovalRepository('pat', settings).submitApproval(target, head, 'Verified current evidence'))
      .toEqual({ id: 33, commitId: head, userId: 20, state: 'APPROVED' });
    expect(pat.rest.pulls.createReview).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', pull_number: 42,
      event: 'APPROVE', commit_id: head, body: 'Verified current evidence' });
  });
  it('keeps missing review acknowledgement identity non-authorizing', async () => {
    const pat = patOctokit(); pat.rest.pulls.createReview.mockResolvedValue({ data: { id: 33, state: 'PENDING' } });
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    expect(await new PullRequestApprovalRepository('pat', settings).submitApproval(target, head, 'Review'))
      .toEqual({ id: 33, commitId: '', userId: 0, state: 'PENDING' });
  });
  it('replays an identical owned assessment without editing or creating another card', async () => {
    const pat = patOctokit(); (github.getOctokit as jest.Mock).mockReturnValue(pat);
    const repository = new PullRequestApprovalRepository('pat', settings);
    const decision = { status: 'pending', code: 'check-missing', detail: 'Waiting.' } as const;
    await repository.publishAssessment(target, publicationEvidence, decision);
    const body = pat.rest.issues.createComment.mock.calls[0][0].body;
    pat.paginate.iterator.mockImplementation(async function* () { yield { data: [{ id: 9, user: { id: 20 }, body }] }; });
    await repository.publishAssessment(target, publicationEvidence, decision);
    expect(pat.rest.issues.createComment).toHaveBeenCalledTimes(1); expect(pat.rest.issues.updateComment).not.toHaveBeenCalled();
  });
  it('updates its prior assessment while preserving a human card with the same marker', async () => {
    const pat = patOctokit(); (github.getOctokit as jest.Mock).mockReturnValue(pat);
    pat.paginate.iterator.mockImplementation(async function* () { yield { data: [
      { id: 9, user: { id: 20 }, body: '<!-- copilot:approval-assessment:v1 --> old' },
      { id: 10, user: { id: 30 }, body: '<!-- copilot:approval-assessment:v1 --> human' },
    ] }; });
    await new PullRequestApprovalRepository('pat', settings).publishAssessment(target, publicationEvidence,
      { status: 'pending', code: 'check-missing', detail: 'Waiting.' }, 33);
    expect(pat.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 9 }));
    expect(pat.rest.issues.createComment).not.toHaveBeenCalled();
  });
  it('updates only the bound owned supplemental check with an already-approved outcome', async () => {
    const pat = patOctokit(); const checks = checkOctokit([{ id: 90, name: 'Copilot / Approval',
      app: { slug: 'github-actions' }, external_id: 'copilot:approval:17:42' }]);
    (github.getOctokit as jest.Mock).mockReturnValueOnce(pat).mockReturnValueOnce(checks);
    await new PullRequestApprovalRepository('pat', { ...settings, githubToken: 'job-token' }).publishAssessment(target,
      publicationEvidence, { status: 'already-approved', code: 'existing-approval', detail: 'Verified approval.' });
    expect(checks.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({ check_run_id: 90, conclusion: 'success' }));
    expect(checks.rest.checks.create).not.toHaveBeenCalled();
  });
  it('never creates or edits a supplemental check after a truncated native check lookup', async () => {
    const pat = patOctokit(); const checks = checkOctokit();
    checks.rest.checks.listForRef.mockResolvedValue({ data: { total_count: 101, check_runs: [] } });
    (github.getOctokit as jest.Mock).mockReturnValueOnce(pat).mockReturnValueOnce(checks);
    await expect(new PullRequestApprovalRepository('pat', { ...settings, githubToken: 'job-token' }).publishAssessment(target,
      publicationEvidence, { status: 'pending', code: 'check-missing', detail: 'Waiting.' })).rejects.toThrow('bounded lookup');
    expect(checks.rest.checks.create).not.toHaveBeenCalled(); expect(checks.rest.checks.update).not.toHaveBeenCalled();
  });
  it('does not verify a synthetic merge whose parentage lookup is denied', async () => {
    const f = evidenceFixture(); f.pat.rest.git.getCommit.mockRejectedValue({ status: 403 });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ mergeCommitVerified: false });
  });
  it('rejects a synthetic merge with an extra unaccounted parent', async () => {
    const pat = evidenceOctokit([base, head, 'd'.repeat(40)]); (github.getOctokit as jest.Mock).mockReturnValue(pat);
    expect(await new PullRequestApprovalRepository('pat', settings).loadEvidence(target)).toMatchObject({ mergeCommitVerified: false });
  });
  it.each(approvalStaleReviewCases)('reads stale review dismissal: $name', async ({ rules, classic, readable = true, dismissesStaleReviews }) => {
    const f = evidenceFixture();
    f.pat.request.mockResolvedValue({ data: rules });
    if (classic !== undefined) f.pat.rest.repos.getBranchProtection.mockResolvedValue({ data: classic });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ rulesReadable: readable, dismissesStaleReviews });
  });

  it('retains classic and ruleset required checks without duplicate names', async () => {
    const f = evidenceFixture(); f.pat.request.mockResolvedValue({ data: [
      { type: 'pull_request', parameters: { dismiss_stale_reviews_on_push: true } },
      { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'CI Check' }, { context: 'Security' }] } },
    ] });
    f.pat.rest.repos.getBranchProtection.mockResolvedValue({ data: { required_pull_request_reviews: { dismiss_stale_reviews: true },
      required_status_checks: { contexts: ['Legacy', 'CI Check'], checks: [{ context: 'CI Check' }] } } });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ rulesReadable: true, dismissesStaleReviews: true,
      requiredChecks: ['Legacy', 'CI Check', 'Security'] });
  });
  it('does not let a classic stale-review rule hide a disabled ruleset rule', async () => {
    const f = evidenceFixture(); f.pat.request.mockResolvedValue({ data: [{ type: 'pull_request', parameters: { dismiss_stale_reviews_on_push: false } }] });
    f.pat.rest.repos.getBranchProtection.mockResolvedValue({ data: { required_pull_request_reviews: { dismiss_stale_reviews: true } } });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ rulesReadable: true, dismissesStaleReviews: false });
  });
  it('keeps denied classic protection unreadable instead of assuming no rules', async () => {
    const f = evidenceFixture(); f.pat.rest.repos.getBranchProtection.mockRejectedValue({ status: 403 });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ rulesReadable: false, dismissesStaleReviews: false, requiredChecks: [] });
  });
  it('rejects an invalid pagination envelope rather than returning complete empty evidence', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.pulls.listFiles, [{ unexpected: [] }]);
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({ code: 'provider.contract-invalid', recovery: { variables: { operation: 'files', reason: 'invalid-page' } } });
  });
  it('rejects inventory beyond the existing 3000-item bound', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.pulls.listReviews, [Array.from({ length: 3001 }, (_, id) => ({ id, state: 'COMMENTED' }))]);
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({ code: 'provider.contract-invalid', recovery: { variables: { operation: 'reviews', reason: 'page-limit' } } });
  });
  it('marks native review history at the provider ceiling incomplete', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.pulls.listReviews, [Array.from({ length: 3000 }, (_, id) => ({ id, state: 'COMMENTED' }))]);
    const evidence = await f.repository.loadEvidence(target);
    expect(evidence.reviewHistoryComplete).toBe(false); expect(evidence.reviews[0]).toEqual({ id: 0, userId: 0,
      state: 'COMMENTED', commitId: '', submittedAt: '' });
  });
  it('retains ignored paths and complete review identities independently of approval eligibility', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.pulls.listReviews, [[{ id: 3, user: { id: 30 }, state: 'APPROVED', commit_id: head, submitted_at: '2026-10-11T10:00:00Z' }]]);
    f.pages.set(f.pat.rest.pulls.listFiles, [[{ filename: 'build/output.js' }]]);
    const repository = new PullRequestApprovalRepository('pat', { ...settings, bugbotIgnorePatterns: ['build/**'] });
    expect(await repository.loadEvidence(target)).toMatchObject({ ignoredChangedPaths: ['build/output.js'], filesComplete: true,
      reviews: [{ id: 3, userId: 30, state: 'APPROVED', commitId: head, submittedAt: '2026-10-11T10:00:00Z' }] });
  });

  it.each(['ArrayBuffer', 'Uint8Array', 'binary string'])('binds decoded numeric coverage from SDK %s to the exact run, attempt and PR revision', async encoding => {
    const f = numericFixture(); const zip = approvalCoverageZip(f.attestation);
    const data = encoding === 'ArrayBuffer' ? Uint8Array.from(zip).buffer : encoding === 'Uint8Array' ? Uint8Array.from(zip) : zip.toString('binary');
    f.pat.rest.actions.downloadArtifact.mockResolvedValue({ data });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ numericCoverage: { headSha: head, baseSha: base, coveredChangedLines: 8, totalChangedLines: 10 } });
    expect(f.pat.rest.actions.downloadArtifact).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', artifact_id: 60, archive_format: 'zip' });
  });
  it.each(['repositoryId', 'pullNumber', 'headSha', 'baseSha', 'workflowRunId', 'workflowRunAttempt'] as const)('rejects numeric attestation substitution of %s', async field => {
    const f = numericFixture(); const replacement = typeof f.attestation[field] === 'string' ? 'd'.repeat(40) : 99;
    f.pat.rest.actions.downloadArtifact.mockResolvedValue({ data: approvalCoverageZip({ ...f.attestation, [field]: replacement }) });
    expect((await f.repository.loadEvidence(target)).numericCoverage).toBeUndefined();
  });
  it.each(['absent', 'duplicate', 'expired', 'oversized'])('does not download a numeric artifact that is %s', async scenario => {
    const f = numericFixture(); const artifacts = scenario === 'absent' ? [] : scenario === 'duplicate' ? [f.artifact, { ...f.artifact, id: 61 }]
      : [{ ...f.artifact, ...(scenario === 'expired' ? { expired: true } : { size_in_bytes: 65537 }) }];
    f.pages.set(f.pat.rest.actions.listWorkflowRunArtifacts, [{ artifacts }]);
    expect((await f.repository.loadEvidence(target)).numericCoverage).toBeUndefined(); expect(f.pat.rest.actions.downloadArtifact).not.toHaveBeenCalled();
  });
  it('keeps numeric evidence unavailable without a matching producer run', async () => {
    const f = numericFixture(); f.pages.set(f.pat.rest.actions.listWorkflowRunsForRepo, [{ workflow_runs: [] }]);
    expect((await f.repository.loadEvidence(target)).numericCoverage).toBeUndefined(); expect(f.pat.rest.actions.downloadArtifact).not.toHaveBeenCalled();
  });
  it('never consumes artifacts from an unfinished producer attempt', async () => {
    const f = numericFixture(); f.pages.set(f.pat.rest.actions.listWorkflowRunsForRepo, [{ workflow_runs: [{ id: 50,
      name: 'CI Check', head_sha: testedMerge, run_attempt: 1, status: 'in_progress', conclusion: null }] }]);
    expect((await f.repository.loadEvidence(target)).numericCoverage).toBeUndefined(); expect(f.pat.rest.actions.downloadArtifact).not.toHaveBeenCalled();
  });
  it('contains denied artifact download without losing independent native evidence', async () => {
    const f = numericFixture(); f.pat.rest.actions.downloadArtifact.mockRejectedValue({ status: 403, message: 'PRIVATE-CREDENTIAL' });
    const evidence = await f.repository.loadEvidence(target);
    expect(evidence.numericCoverage).toBeUndefined(); expect(evidence.mergeCommitVerified).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain('PRIVATE-');
  });
  it('rejects an unsupported SDK download payload', async () => {
    const f = numericFixture(); f.pat.rest.actions.downloadArtifact.mockResolvedValue({ data: { zip: 'PRIVATE-CREDENTIAL' } });
    expect((await f.repository.loadEvidence(target)).numericCoverage).toBeUndefined();
  });
  it('rejects malformed ZIP bytes from an otherwise matching native artifact', async () => {
    const f = numericFixture(); f.pat.rest.actions.downloadArtifact.mockResolvedValue({ data: Buffer.from('not a ZIP') });
    expect((await f.repository.loadEvidence(target)).numericCoverage).toBeUndefined();
  });
  it('collects complete owned Bugbot evidence for exactly the current PR and head', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.issues.listComments, [[{ id: 9, user: { id: 20 }, body: bugbotCard() }]]);
    expect((await f.repository.loadEvidence(target)).bugbot).toEqual({ headSha: head, outcome: 'complete', coverage: 'complete',
      open: 0, reopened: 0, dismissed: 0, verificationRequired: 0, unknown: 0 });
  });
  it.each(['missing evidence marker', 'foreign PR', 'stale status head', 'stale evidence head', 'digest mismatch', 'unsafe count'])('rejects owned Bugbot evidence with %s', async scenario => {
    const f = evidenceFixture();
    const body = scenario === 'missing evidence marker' ? bugbotCard().split('\n')[0]
      : scenario === 'foreign PR' ? bugbotCard(head, 99) : scenario === 'stale status head' ? bugbotCard('d'.repeat(40))
        : scenario === 'stale evidence head' ? bugbotCard(head, 42, 'd'.repeat(40))
          : scenario === 'digest mismatch' ? bugbotCard(head, 42, head, 'feedface') : bugbotCard(head, 42, head, 'deadbeef', '9007199254740992');
    f.pages.set(f.pat.rest.issues.listComments, [[{ id: 9, user: { id: 20 }, body }]]);
    expect((await f.repository.loadEvidence(target)).bugbot).toBeUndefined();
  });
  it('rejects two competing owned Bugbot cards instead of selecting one convenient card', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.issues.listComments, [[
      { id: 9, user: { id: 20 }, body: bugbotCard() }, { id: 10, user: { id: 20 }, body: bugbotCard() },
    ]]);
    expect((await f.repository.loadEvidence(target)).bugbot).toBeUndefined();
  });
  it('does not trust a foreign actor’s otherwise complete Bugbot card', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.issues.listComments, [[{ id: 9, user: { id: 30 }, body: bugbotCard() }]]);
    expect((await f.repository.loadEvidence(target)).bugbot).toBeUndefined();
  });
  it('does not count checks absent from the current native attempt jobs', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.actions.listJobsForWorkflowRunAttempt, [{ jobs: [{ check_run_url: null }] }]);
    expect((await f.repository.loadEvidence(target)).checks).toEqual([]);
  });
  it('selects the latest failed native attempt instead of an older successful run', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.actions.listWorkflowRunsForRepo, [{ workflow_runs: [
      { id: 50, name: 'CI Check', head_sha: testedMerge, run_attempt: 1, status: 'completed', conclusion: 'success' },
      { id: 50, name: 'CI Check', head_sha: testedMerge, run_attempt: 2, status: 'completed', conclusion: 'failure' },
    ] }]);
    expect((await f.repository.loadEvidence(target)).checks).toEqual([expect.objectContaining({ attempt: 2, conclusion: 'failure' })]);
    expect(f.pat.paginate.iterator).toHaveBeenCalledWith(f.pat.rest.actions.listJobsForWorkflowRunAttempt,
      expect.objectContaining({ run_id: 50, attempt_number: 2 }));
  });
  it('never treats a malformed ruleset response as a complete empty ruleset', async () => {
    const f = evidenceFixture(); f.pat.request.mockResolvedValue({ data: { message: 'unexpected provider payload' } });
    f.pat.rest.repos.getBranchProtection.mockResolvedValue({ data: { required_pull_request_reviews: { dismiss_stale_reviews: true } } });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ rulesReadable: false, dismissesStaleReviews: false, requiredChecks: [] });
  });
  it.each([null, 17, { type: '' }])('rejects a malformed native ruleset row %s before trusting classic protection', async row => {
    const f = evidenceFixture(); f.pat.request.mockResolvedValue({ data: [row] });
    f.pat.rest.repos.getBranchProtection.mockResolvedValue({ data: { required_pull_request_reviews: { dismiss_stale_reviews: true } } });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ rulesReadable: false, dismissesStaleReviews: false });
    expect(f.pat.rest.repos.getBranchProtection).not.toHaveBeenCalled();
  });
});

describe('live native base ref instead of cached PR base metadata', () => {
  it('uses the current base ref and rejects merge proof from the previous base', async () => {
    const f = evidenceFixture();
    const advanced = 'd'.repeat(40);
    f.pat.rest.git.getRef.mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: advanced } } });
    const evidence = await f.repository.loadEvidence(target);
    expect(evidence).toMatchObject({ baseSha: advanced, baseRef: 'develop' });
    expect(evidence.testedMergeSha).toBeUndefined();
    expect(f.pat.rest.git.getRef).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', ref: 'heads/develop' });
  });
  it('rejects numeric coverage for the cached previous base even when a current-head producer succeeded', async () => {
    const f = numericFixture();
    const advanced = 'd'.repeat(40);
    f.pat.rest.git.getRef.mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: advanced } } });
    f.pages.set(f.pat.rest.actions.listWorkflowRunsForRepo, [{ workflow_runs: [{
      id: 50, name: 'CI Check', head_sha: head, run_attempt: 1, status: 'completed', conclusion: 'success',
    }] }]);
    const evidence = await f.repository.loadEvidence(target);
    expect(f.pat.rest.actions.downloadArtifact).toHaveBeenCalled();
    expect(evidence.baseSha).toBe(advanced);
    expect(evidence.numericCoverage).toBeUndefined();
  });
  it('publishes for the verified live base when only the PR metadata cache differs', async () => {
    const pat = patOctokit();
    pat.rest.pulls.get.mockResolvedValue({ data: { head: { sha: head }, base: { ref: 'develop', sha: 'd'.repeat(40) } } });
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    await new PullRequestApprovalRepository('pat', settings).publishAssessment(target, publicationEvidence,
      { status: 'pending', code: 'check-missing', detail: 'Waiting.' });
    expect(pat.rest.issues.createComment).toHaveBeenCalledTimes(1);
  });
  it('withholds assessment writes when the live base advances behind unchanged PR metadata', async () => {
    const pat = patOctokit();
    pat.rest.git.getRef.mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: 'd'.repeat(40) } } });
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    await expect(new PullRequestApprovalRepository('pat', settings).publishAssessment(target, publicationEvidence,
      { status: 'pending', code: 'check-missing', detail: 'Waiting.' })).rejects.toThrow('head or base changed');
    expect(pat.rest.issues.createComment).not.toHaveBeenCalled();
    expect(pat.rest.issues.updateComment).not.toHaveBeenCalled();
  });
  it('rejects a base-branch retarget even when its cached SHA equals the verified original base', async () => {
    const pat = patOctokit();
    pat.rest.pulls.get.mockResolvedValue({ data: { head: { sha: head }, base: { ref: 'release/1', sha: base } } });
    (github.getOctokit as jest.Mock).mockReturnValue(pat);
    await expect(new PullRequestApprovalRepository('pat', settings).publishAssessment(target, publicationEvidence,
      { status: 'pending', code: 'check-missing', detail: 'Waiting.' })).rejects.toThrow('head or base changed');
    expect(pat.rest.issues.createComment).not.toHaveBeenCalled();
  });
  it('fails closed on denied native ref access rather than falling back to cached base evidence', async () => {
    const f = evidenceFixture(); f.pat.rest.git.getRef.mockRejectedValue({ status: 403 });
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({ code: 'authorization.denied', recovery: { variables: { operation: 'base-ref', reason: 'http-403' } } });
    expect(f.pat.rest.pulls.createReview).not.toHaveBeenCalled();
  });
  it.each(['foreign ref', 'non-commit object', 'invalid SHA', 'non-string SHA', 'missing object', 'empty response'])('rejects native base evidence with %s', async scenario => {
    const f = evidenceFixture();
    f.pat.rest.git.getRef.mockResolvedValue({ data: {
      ref: scenario === 'foreign ref' ? 'refs/heads/other' : 'refs/heads/develop',
      object: { type: scenario === 'non-commit object' ? 'tree' : 'commit', sha: scenario === 'invalid SHA' ? 'unverified' : base },
    } });
    if (scenario === 'missing object') f.pat.rest.git.getRef.mockResolvedValue({ data: { ref: 'refs/heads/develop' } } as never);
    if (scenario === 'non-string SHA') f.pat.rest.git.getRef.mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: [base] } } } as never);
    if (scenario === 'empty response') f.pat.rest.git.getRef.mockResolvedValue({ data: null } as never);
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({ code: 'provider.contract-invalid', recovery: { variables: { operation: 'base-ref', reason: 'invalid-response' } } });
    expect(f.pat.rest.pulls.createReview).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 17, 'a'.repeat(1_025), 'develop\n', 'develop\u0000'])('rejects unsafe PR base metadata before any native ref request (%p)', async ref => {
    const f = evidenceFixture();
    const pull = await f.pat.rest.pulls.get();
    f.pat.rest.pulls.get.mockResolvedValue({ data: { ...pull.data, base: { ...pull.data.base, ref } } } as never);
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({ code: 'provider.contract-invalid', recovery: { variables: { operation: 'base-ref', reason: 'invalid-response' } } });
    expect(f.pat.rest.git.getRef).not.toHaveBeenCalled();
  });
});


describe('read-only doctor policy source', () => {
  it('returns the repository source and does not read an organization fallback', async () => {
    const client = patOctokit(); jest.mocked(github.getOctokit).mockReturnValue(client as never);
    const read = await new PullRequestApprovalRepository('fixture-token', settings).readPolicyEvidence(target);
    expect(read).toEqual({ status: 'available', source: 'repository', value: 'repository' });
    expect(Object.isFrozen(read)).toBe(true);
    expect(client.rest.actions.getOrgVariable).not.toHaveBeenCalled();
  });
  it('returns the organization source only after verified repository absence', async () => {
    const client = patOctokit(); client.rest.actions.getRepoVariable.mockRejectedValue({ status: 404 });
    jest.mocked(github.getOctokit).mockReturnValue(client as never);
    expect(await new PullRequestApprovalRepository('fixture-token', settings).readPolicyEvidence(target)).toEqual({ status: 'available', source: 'organization', value: 'organization' });
  });
  it('establishes effective absence only after both trusted reads establish absence', async () => {
    const client = patOctokit(); client.rest.actions.getRepoVariable.mockRejectedValue({ status: 404 }); client.rest.actions.getOrgVariable.mockRejectedValue({ status: 404 });
    jest.mocked(github.getOctokit).mockReturnValue(client as never);
    expect(await new PullRequestApprovalRepository('fixture-token', settings).readPolicyEvidence(target)).toEqual({ status: 'absent' });
  });
  it('retains unavailable repository policy instead of falling back after a denied read', async () => {
    const client = patOctokit(); client.rest.actions.getRepoVariable.mockRejectedValue({ status: 403, message: 'private provider diagnostic' });
    jest.mocked(github.getOctokit).mockReturnValue(client as never);
    expect(await new PullRequestApprovalRepository('fixture-token', settings).readPolicyEvidence(target)).toEqual({ status: 'unavailable' });
    expect(client.rest.actions.getOrgVariable).not.toHaveBeenCalled();
  });
  it('retains unavailable effective policy when organization lookup fails', async () => {
    const client = patOctokit(); client.rest.actions.getRepoVariable.mockRejectedValue({ status: 404 }); client.rest.actions.getOrgVariable.mockRejectedValue({ status: 403 });
    jest.mocked(github.getOctokit).mockReturnValue(client as never);
    expect(await new PullRequestApprovalRepository('fixture-token', settings).readPolicyEvidence(target)).toEqual({ status: 'unavailable' });
  });
  it.each([null, 'x'.repeat(65_537)])('rejects malformed or unbounded provider values without an organization fallback', async value => {
    const client = patOctokit(); client.rest.actions.getRepoVariable.mockResolvedValue({ data: { value } } as never);
    jest.mocked(github.getOctokit).mockReturnValue(client as never);
    expect(await new PullRequestApprovalRepository('fixture-token', settings).readPolicyEvidence(target)).toEqual({ status: 'unavailable' });
    await expect(new PullRequestApprovalRepository('fixture-token', settings).readPolicy(target)).rejects.toMatchObject({
      code: 'provider.contract-invalid', retryable: false, recovery: { variables: { operation: 'policy', reason: 'invalid-response' } },
    });
    expect(client.rest.actions.getOrgVariable).not.toHaveBeenCalled();
  });
});

describe('causal evidence collection diagnostics (#619)', () => {
  it.each([
    ['files', 'pull-requests-read'], ['reviews', 'pull-requests-read'], ['comments', 'issues-read'],
    ['head-checks', 'checks-read'], ['merge-checks', 'checks-read'],
    ['head-runs', 'actions-read'], ['merge-runs', 'actions-read'], ['jobs', 'actions-read'],
  ])('retains the failed %s operation without provider text', async (operation, permission) => {
    const f = evidenceFixture(); const original = f.pat.paginate.iterator.getMockImplementation()!;
    const methods: Record<string, unknown> = { files: f.pat.rest.pulls.listFiles, reviews: f.pat.rest.pulls.listReviews,
      comments: f.pat.rest.issues.listComments, 'head-checks': f.pat.rest.checks.listForRef,
      'merge-checks': f.pat.rest.checks.listForRef, 'head-runs': f.pat.rest.actions.listWorkflowRunsForRepo,
      'merge-runs': f.pat.rest.actions.listWorkflowRunsForRepo, jobs: f.pat.rest.actions.listJobsForWorkflowRunAttempt };
    f.pat.paginate.iterator.mockImplementation(async function* (method, params) {
      const matchesRef = !operation.startsWith('head-') && !operation.startsWith('merge-')
        || (params.ref ?? params.head_sha) === (operation.startsWith('head-') ? head : testedMerge);
      if (method === methods[operation] && matchesRef) throw { status: 403, message: 'SECRET', response: { data: 'SECRET' } };
      yield* original(method, params);
    });
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({ code: 'authorization.denied', retryable: false,
      recovery: { variables: { operation, permission, reason: 'http-403' } } });
  });
  it('reports malformed pages as schema failures, not transient transport', async () => {
    const f = evidenceFixture(); f.pages.set(f.pat.rest.pulls.listFiles, [{ unexpected: 'SECRET' }]);
    await expect(f.repository.loadEvidence(target)).rejects.toMatchObject({ code: 'provider.contract-invalid',
      recovery: { variables: { operation: 'files', reason: 'invalid-page' } } });
  });
  it('records a rules denial while preserving independently read evidence', async () => {
    const f = evidenceFixture(); f.pat.request.mockRejectedValue({ status: 403, message: 'SECRET' });
    const evidence = await f.repository.loadEvidence(target);
    expect(evidence).toMatchObject({ headSha: head, rulesReadable: false,
      diagnostics: [{ operation: 'rules', reason: 'http-403', permission: 'metadata-read' }] });
    expect(JSON.stringify(evidence)).not.toContain('SECRET');
  });
  it('treats a legitimate classic protection 404 as absence, without a failure', async () => {
    const f = evidenceFixture();
    expect((await f.repository.loadEvidence(target)).diagnostics).toBeUndefined();
  });
  it('identifies the coverage artifact download denial', async () => {
    const f = numericFixture(); f.pat.rest.actions.downloadArtifact.mockRejectedValue({ status: 403, message: 'SECRET' });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ diagnostics: [
      { operation: 'coverage-download', reason: 'http-403', permission: 'actions-read' },
    ] });
  });
  it('identifies invalid coverage ZIP/schema separately from a download failure', async () => {
    const f = numericFixture(); f.pat.rest.actions.downloadArtifact.mockResolvedValue({ data: Buffer.from('SECRET') });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ diagnostics: [
      { operation: 'coverage-parse', reason: 'artifact-invalid', permission: 'actions-read' },
    ] });
  });
  it('accepts completed merge-ref CI when cached PR base metadata is historical', async () => {
    const f = evidenceFixture(); const pull = await f.pat.rest.pulls.get();
    f.pat.rest.pulls.get.mockResolvedValue({ data: { ...pull.data, base: { ...pull.data.base, sha: 'd'.repeat(40) } } });
    expect(await f.repository.loadEvidence(target)).toMatchObject({ baseSha: base, testedMergeSha: testedMerge,
      mergeCommitVerified: true, checks: [expect.objectContaining({ runId: 50, conclusion: 'success' })] });
  });
});


describe('description publication and actual approval evidence agree', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each([
    { name: 'closing intent with retained native relation', prose: 'Closes #43.', linked: true, native: [43] },
    { name: 'closing intent before native relation exists with protected changes', prose: 'Fixes #43', linked: true, native: [], protected: true },
    { name: 'staged reference despite retained native relation', prose: 'Refs #43', linked: false, native: [43] },
    { name: 'quoted code despite retained native relation', prose: '```text\nCloses #43\n```', linked: false, native: [43] },
    { name: 'wrong repository despite retained native relation', prose: 'Closes foreign/repo#43', linked: false, native: [43] },
    { name: 'wrong issue despite retained native relation', prose: 'Closes #44', linked: false, native: [43] },
    { name: 'self issue identity', prose: 'Closes #42', linked: false, native: [42], self: true },
    { name: 'foreign native head identity', prose: 'Closes #43', linked: false, native: [43], foreign: true },
  ])('keeps $name consistent through two real publications', async scenario => {
    const client = evidenceOctokit();
    const issueNumber = scenario.self ? 42 : 43;
    const headRef = `feature/${issueNumber}-improve`;
    const configuration = { schemaVersion: 3, branchType: 'feature', workingBranch: headRef, parentBranch: 'develop' };
    let body = writeConfigurationBlock(scenario.prose, JSON.stringify(configuration))!;
    const initial = (await client.rest.pulls.get()).data;
    client.rest.pulls.get.mockImplementation(async () => ({ data: { ...initial, body,
      head: { ...initial.head, ref: headRef, repo: { id: scenario.foreign ? 99 : 17, name: 'repo', owner: { login: scenario.foreign ? 'foreign' : 'owner' } } },
      base: { ...initial.base, repo: { id: 17, name: 'repo', owner: { login: 'owner' } } } } }));
    const update = jest.fn(async (input: { body: string }) => { body = input.body; return { data: {} }; });
    const graphql = jest.fn().mockResolvedValue({ repository: { pullRequest: { closingIssuesReferences: {
      nodes: scenario.native.map(number => ({ number, repository: { nameWithOwner: 'owner/repo' } })),
    } } } });
    const provider = Object.assign(client, { graphql });
    Object.assign(client.rest.pulls, { update });
    const originalPages = client.paginate.iterator.getMockImplementation()!;
    client.paginate.iterator.mockImplementation(async function* (method, params) {
      if (method === client.rest.pulls.listFiles) yield { data: [{ filename: scenario.protected ? '.github/workflows/ci.yml' : 'src/feature.ts' }] };
      else yield* originalPages(method, params);
    });
    (github.getOctokit as jest.Mock).mockReturnValue(provider);
    const repository = new PullRequestApprovalRepository('fixture-no-authority', settings);
    const publisher = new PullRequestLifecycleRepository({ getClient: () => provider as never });
    const port = bindPullRequestDescription(publisher,
      { owner: 'owner', repository: 'repo', token: 'fixture-no-authority' },
      { getBoundedBugbotReviewDiffSnapshot: jest.fn().mockResolvedValue({ snapshot: { changes: [
        { filename: 'src/feature.ts', status: 'modified', additions: 1, deletions: 0, patch: '+return true;' },
      ] }, coverage: { status: 'complete' } }) });
    const query = jest.fn().mockResolvedValue({ outputLocale: 'en-US', overview: 'This corrects the owned operation.',
      whatChangedHeading: 'What changed', changes: ['Correct the returned result.', 'Keep the existing interface.'],
      validationHeading: null, validation: null, reviewNotesHeading: null, reviewNotes: null, closesLinkedIssue: false });
    const request = { trigger: 'automatic' as const, context: { eventName: 'pull_request', issueNumber,
      pullRequest: { number: 42, headBranch: headRef, baseBranch: 'develop', creator: 'owned-author', body,
        headSha: head, headRepository: 'owner/repo' }, mode: 'replace' as const, membersOnly: false,
      agentConfiguration: { provider: 'codex' as const, model: 'fixture' }, targetLocale: 'en-US' } };
    const readNative = async () => (await provider.graphql()).repository.pullRequest.closingIssuesReferences.nodes;
    const nativeBefore = await readNative();
    expect((await repository.loadEvidence(target)).linkedIssue).toBe(scenario.linked);
    let firstPublished = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await runUpdatePullRequestDescriptionWorkflow(request, 'update-description', {
        pullRequestDescriptionCommandPort: port, issueDescriptionQueryPort: { getDescription: async () => 'Owned issue.' },
        organizationMembersPort: { getAllMembers: async () => [] }, aiRepository: { query },
      });
      if (scenario.foreign) {
        expect(result[0].errors[0].code).toBe('workflow.stale');
      } else {
        expect(result[0].success).toBe(true);
        // The normal host configuration persistence follows description publication.
        // Use its actual marker writer, then the real provider-bound publication path.
        await publisher.updateDescription('owner', 'repo', 42, writeConfigurationBlock(body, JSON.stringify(configuration))!, 'fixture-no-authority');
        expect(body.includes(`Closes #${issueNumber}`)).toBe(scenario.linked);
      }
      const block = readConfigurationBlock(body);
      expect(block.kind === 'present' && JSON.parse(block.content)).toEqual(configuration);
      const evidence = await repository.loadEvidence(target);
      expect(evidence.linkedIssue).toBe(scenario.linked);
      const policy = parsePullRequestApprovalPolicy(await repository.readPolicy(target));
      const decision = decidePullRequestApproval(policy, evidence);
      if (scenario.protected) expect(decision.code).toBe('protected-path');
      else if (scenario.foreign) expect(decision.code).toBe('unsupported-pr');
      else if (!scenario.linked) expect(decision.code).toBe('scope');
      else expect(decision.code).not.toBe('scope');
      expect(await readNative()).toEqual(nativeBefore);
      if (attempt === 0) firstPublished = body;
      else expect(body).toBe(firstPublished);
    }
    expect(update).toHaveBeenCalledTimes(scenario.foreign ? 0 : 4);
    expect(query).toHaveBeenCalledTimes(scenario.foreign ? 0 : 2);
    expect(JSON.stringify(query.mock.calls)).not.toContain('fixture-no-authority');
    expect(provider.graphql).toHaveBeenCalledTimes(3);
    expect(client.rest.pulls.createReview).not.toHaveBeenCalled();
  });
  it('keeps a missing provider body outside closing approval scope', async () => {
    const client = evidenceOctokit();
    const initial = (await client.rest.pulls.get()).data;
    client.rest.pulls.get.mockResolvedValue({ data: { ...initial, body: null } });
    (github.getOctokit as jest.Mock).mockReturnValue(client);
    const repository = new PullRequestApprovalRepository('fixture-no-authority', settings);
    const evidence = await repository.loadEvidence(target);
    expect(evidence.linkedIssue).toBe(false);
    expect(decidePullRequestApproval(parsePullRequestApprovalPolicy(await repository.readPolicy(target)), evidence).code).toBe('scope');
    expect(client.rest.pulls.createReview).not.toHaveBeenCalled();
  });

});
