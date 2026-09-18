import { ObservePullRequestApprovalUseCase } from '../observe_pull_request_approval_use_case';
import type { ApprovalEvidence } from '../../../../domain/pull_request_approval';
import type { PullRequestApprovalPort } from '../../../ports/pull_request_approval_ports';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const policy = JSON.stringify({
  version: 1, mode: 'guarded', targetRoles: ['development'], branchKinds: ['feature'],
  requireLinkedIssue: true, additionalExcludedPaths: [],
  producerAttested: true,
  testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
  coverage: { mode: 'check', checkName: 'CI Check' },
  allowHumanDismissed: false, skipWhenHumanApproved: true,
});
const target = { owner: 'owner', repository: 'repo', repositoryId: 1, pullNumber: 42 };

function evidence(): ApprovalEvidence {
  return {
    repositoryId: 1, pullNumber: 42, headSha: head, baseSha: base, testedMergeSha: 'c'.repeat(40),
    mergeCommitVerified: true, baseRef: 'develop',
    targetRole: 'development', branchKind: 'feature', linkedIssue: true,
    open: true, draft: false, sameRepository: true, authorId: 10, authorIsBot: false, botUserId: 20,
    changedPaths: ['src/feature.ts'], filesComplete: true,
    rulesReadable: true, dismissesStaleReviews: true, requiredChecks: ['CI Check'],
    checks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check', headSha: head,
      conclusion: 'success', status: 'completed', runId: 50, attempt: 1 }],
    bugbot: { headSha: head, outcome: 'complete', coverage: 'complete', open: 0,
      reopened: 0, dismissed: 0, verificationRequired: 0, unknown: 0 },
    bugbotSeverity: 'info', bugbotDryRun: false, reviews: [], reviewHistoryComplete: true,
  };
}

function port(overrides: Partial<PullRequestApprovalPort> = {}): PullRequestApprovalPort {
  return {
    readPolicy: jest.fn().mockResolvedValue(policy),
    loadEvidence: jest.fn().mockResolvedValue(evidence()),
    submitApproval: jest.fn().mockResolvedValue({ id: 7, commitId: head, userId: 20, state: 'APPROVED' }),
    publishAssessment: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const approved = { id: 7, userId: 20, state: 'APPROVED', commitId: head, submittedAt: '2026-01-01T00:00:00Z' };

describe('ObservePullRequestApprovalUseCase', () => {
  it('does nothing when the runtime policy is absent', async () => {
    const gateway = port({ readPolicy: jest.fn().mockResolvedValue(undefined) });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.status).toBe('off');
    expect(gateway.loadEvidence).not.toHaveBeenCalled();
    expect(gateway.submitApproval).not.toHaveBeenCalled();
  });
  it('blocks an invalid policy without PR mutation', async () => {
    const gateway = port({ readPolicy: jest.fn().mockResolvedValue('{') });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.code).toBe('invalid-policy');
    expect(gateway.submitApproval).not.toHaveBeenCalled();
  });
  it('posts once only after readback confirms the exact native review', async () => {
    const loadEvidence = jest.fn().mockResolvedValueOnce(evidence())
      .mockResolvedValueOnce(evidence())
      .mockResolvedValueOnce({ ...evidence(), reviews: [approved] });
    const gateway = port({ loadEvidence });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.code).toBe('approved');
    expect(result.reviewId).toBe(7);
    expect(gateway.submitApproval).toHaveBeenCalledTimes(1);
    expect(gateway.submitApproval).toHaveBeenCalledWith(target, head, expect.stringContaining('copilot:guarded-approval:v1'));
    expect(gateway.publishAssessment).toHaveBeenCalledWith(target, expect.objectContaining({ headSha: head }), expect.objectContaining({ code: 'approved' }), 7);
  });
  it('supersedes a revision or policy change before the review POST', async () => {
    const gateway = port({
      loadEvidence: jest.fn().mockResolvedValueOnce(evidence()).mockResolvedValueOnce({ ...evidence(), baseSha: 'c'.repeat(40) }),
    });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.code).toBe('superseded');
    expect(gateway.submitApproval).not.toHaveBeenCalled();
  });
  it('reports a failed pre-submit reread without posting an approval', async () => {
    const gateway = port({
      loadEvidence: jest.fn().mockResolvedValueOnce(evidence()).mockRejectedValueOnce(new Error('forbidden')),
    });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.code).toBe('pre-submit-unavailable');
    expect(gateway.submitApproval).not.toHaveBeenCalled();
  });
  it('does not repeat a previously approved exact head', async () => {
    const gateway = port({ loadEvidence: jest.fn().mockResolvedValue({ ...evidence(), reviews: [approved] }) });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.status).toBe('already-approved');
    expect(gateway.submitApproval).not.toHaveBeenCalled();
  });
  it('recovers an ambiguous POST timeout by reading the accepted review', async () => {
    const gateway = port({
      loadEvidence: jest.fn().mockResolvedValueOnce(evidence()).mockResolvedValueOnce(evidence())
        .mockResolvedValueOnce({ ...evidence(), reviews: [approved] }),
      submitApproval: jest.fn().mockRejectedValue(new Error('timeout')),
    });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.code).toBe('approved');
    expect(result.reviewId).toBe(7);
  });
  it('does not report approval when the native review was dismissed before readback', async () => {
    const gateway = port({
      loadEvidence: jest.fn().mockResolvedValueOnce(evidence()).mockResolvedValueOnce(evidence())
        .mockResolvedValueOnce({ ...evidence(), reviews: [{ ...approved, state: 'DISMISSED' }] }),
    });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.code).toBe('publication-unknown');
  });
  it('preserves a confirmed native review when card publication fails', async () => {
    const gateway = port({
      loadEvidence: jest.fn().mockResolvedValueOnce(evidence()).mockResolvedValueOnce(evidence())
        .mockResolvedValueOnce({ ...evidence(), reviews: [approved] }),
      publishAssessment: jest.fn().mockRejectedValue(new Error('card failure')),
    });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result).toMatchObject({ reviewId: 7, publication: 'failed', decision: { code: 'approved' } });
  });
  it('rejects a mismatched bound repository before any publication', async () => {
    const gateway = port({ loadEvidence: jest.fn().mockResolvedValue({ ...evidence(), repositoryId: 2 }) });
    const result = await new ObservePullRequestApprovalUseCase(gateway).execute(target);
    expect(result.decision.code).toBe('target-mismatch');
    expect(gateway.publishAssessment).not.toHaveBeenCalled();
  });
});
