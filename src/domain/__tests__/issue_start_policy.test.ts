import {
  BRANCH_READY_LABEL,
  ISSUE_START_LABEL,
  branchIsReady,
  decideIssueStart,
} from '../issue_start_policy';
import type { IssueWorkflowKind } from '../issue_workflow_profile';

const kinds: readonly IssueWorkflowKind[] = [
  'feature', 'bugfix', 'documentation', 'chore', 'hotfix', 'release', 'help',
];

describe('decideIssueStart', () => {
  it.each(kinds)('%s waits for the same start label', kind => {
    const decision = decideIssueStart({ kind, labels: [BRANCH_READY_LABEL], issueManagedBranches: true, preBranchSdd: true });
    expect(decision).toEqual({ started: false, branchRequired: false, sddRequired: false, helpRequired: false });
  });

  it.each(kinds)('%s starts when in-progress is present', kind => {
    const decision = decideIssueStart({ kind, labels: [ISSUE_START_LABEL], issueManagedBranches: true, preBranchSdd: false });
    expect(decision.started).toBe(true);
    expect(decision.branchRequired).toBe(kind !== 'help');
    expect(decision.helpRequired).toBe(kind === 'help');
  });

  it('requires an SDD for features and explicitly marked behavior changes', () => {
    expect(decideIssueStart({ kind: 'feature', labels: [ISSUE_START_LABEL], issueManagedBranches: true, preBranchSdd: true }).sddRequired).toBe(true);
    expect(decideIssueStart({ kind: 'bugfix', labels: [ISSUE_START_LABEL, 'contract-change'], issueManagedBranches: true, preBranchSdd: true }).sddRequired).toBe(true);
    expect(decideIssueStart({ kind: 'chore', labels: [ISSUE_START_LABEL], issueManagedBranches: true, preBranchSdd: true }).sddRequired).toBe(false);
    expect(decideIssueStart({ kind: 'help', labels: [ISSUE_START_LABEL, 'contract-change'], issueManagedBranches: true, preBranchSdd: true }).sddRequired).toBe(false);
  });

  it('allows started branchless planning when issue branches are disabled', () => {
    expect(decideIssueStart({ kind: 'feature', labels: [ISSUE_START_LABEL], issueManagedBranches: false, preBranchSdd: false }))
      .toEqual({ started: true, branchRequired: false, sddRequired: false, helpRequired: false });
  });

  it('rejects SDD generation without Action-managed branches', () => {
    expect(() => decideIssueStart({ kind: 'feature', labels: [ISSUE_START_LABEL], issueManagedBranches: false, preBranchSdd: true }))
      .toThrow('pre-branch-sdd requires issue-managed-branches.');
  });

  it('does not start an unadmitted issue', () => {
    expect(decideIssueStart({ labels: [ISSUE_START_LABEL], issueManagedBranches: true, preBranchSdd: false }).started).toBe(false);
  });
});

describe('branchIsReady', () => {
  it('requires the linked remote branch and any required published SDD', () => {
    expect(branchIsReady({ linkedBranchExists: false, sddRequired: false, sddPublished: false })).toBe(false);
    expect(branchIsReady({ linkedBranchExists: true, sddRequired: false, sddPublished: false })).toBe(true);
    expect(branchIsReady({ linkedBranchExists: true, sddRequired: true, sddPublished: false })).toBe(false);
    expect(branchIsReady({ linkedBranchExists: true, sddRequired: true, sddPublished: true })).toBe(true);
    expect(branchIsReady({ linkedBranchExists: true, sddRequired: true, sddPublished: true, revisionPending: true })).toBe(false);
  });
});
