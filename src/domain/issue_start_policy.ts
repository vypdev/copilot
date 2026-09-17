import type { IssueWorkflowKind } from './issue_workflow_profile';

/** Fixed workflow signals. Their names are part of the installed issue contract. */
export const ISSUE_START_LABEL = 'in-progress';
export const BRANCH_READY_LABEL = 'branched';
export const SDD_REQUIRED_LABEL = 'SDD';
export const CONTRACT_CHANGE_LABEL = 'contract-change';

export interface IssueStartInput {
  readonly kind?: IssueWorkflowKind;
  readonly labels: readonly string[];
  readonly issueManagedBranches: boolean;
  readonly preBranchSdd: boolean;
}

export interface IssueStartDecision {
  readonly started: boolean;
  readonly branchRequired: boolean;
  readonly sddRequired: boolean;
  readonly helpRequired: boolean;
}

/** Resolves work from admitted issue facts, never from a user-applied output label. */
export function decideIssueStart(input: IssueStartInput): IssueStartDecision {
  if (input.preBranchSdd && !input.issueManagedBranches) {
    throw new Error('pre-branch-sdd requires issue-managed-branches.');
  }
  const labels = new Set(input.labels.map(label => label.trim().toLowerCase()));
  const started = input.kind !== undefined && labels.has(ISSUE_START_LABEL);
  const helpRequired = started && input.kind === 'help';
  const branchRequired = started && input.kind !== 'help' && input.issueManagedBranches;
  return Object.freeze({
    started,
    branchRequired,
    sddRequired: branchRequired && input.preBranchSdd
      && (input.kind === 'feature' || labels.has(CONTRACT_CHANGE_LABEL)),
    helpRequired,
  });
}

export interface BranchReadinessInput {
  readonly linkedBranchExists: boolean;
  readonly sddRequired: boolean;
  readonly sddPublished: boolean;
  readonly revisionPending?: boolean;
}

/** A label is a projection of verified remote facts, not evidence itself. */
export function branchIsReady(input: BranchReadinessInput): boolean {
  return input.linkedBranchExists
    && (!input.sddRequired || input.sddPublished)
    && !input.revisionPending;
}
