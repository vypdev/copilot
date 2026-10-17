import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY, parsePullRequestApprovalPolicy, validatePullRequestApprovalPolicy } from '../../../domain/pull_request_approval_policy';

const draft = () => ({ ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, mode: 'guarded',
  testChecks: [], producerAttested: false,
  coverage: { mode: 'numeric', checkName: '', minDiffPercent: 85, artifactWorkflowName: '', reporterAttested: false } });

describe('setup-only unverified numeric approval proposal', () => {
  it('permits a typed draft while target producers are still being selected', () => {
    expect(validatePullRequestApprovalPolicy(draft(), true)).toEqual([]);
  });
  it('rejects that same proposal at the strict runtime and installation boundary', () => {
    expect(validatePullRequestApprovalPolicy(draft()).length).toBeGreaterThan(0);
    expect(() => parsePullRequestApprovalPolicy(JSON.stringify(draft()))).toThrow();
  });
  it.each([-1, 101, 1.5])('retains numeric coverage bounds for incomplete draft %s', minDiffPercent => {
    const proposal = draft(); proposal.coverage.minDiffPercent = minDiffPercent;
    expect(validatePullRequestApprovalPolicy(proposal, true).length).toBeGreaterThan(0);
  });
  it('does not accept a nonempty unbound artifact workflow as pending evidence', () => {
    const proposal = draft(); proposal.coverage.artifactWorkflowName = 'Other workflow';
    expect(validatePullRequestApprovalPolicy(proposal, true).length).toBeGreaterThan(0);
  });
});
