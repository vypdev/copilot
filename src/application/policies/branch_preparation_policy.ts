export interface ManagedBranchPreparationDecisionInput {
  availableBranches: readonly string[];
  issueNumber: number;
  formattedIssueTitle: string;
  targetBranchType: string;
  developmentBranch: string;
  managedBranchTypes: readonly string[];
  currentParentBranch?: string;
}

export type ManagedBranchPreparationDecision =
  | { kind: "already-exists"; targetBranchName: string }
  | {
      kind: "create";
      targetBranchName: string;
      baseBranchName: string;
      isRename: boolean;
      parentBranch: string;
    };

export function decideManagedBranchPreparation(
  input: ManagedBranchPreparationDecisionInput,
): ManagedBranchPreparationDecision {
  const targetBranchName = `${input.targetBranchType}/${input.issueNumber}-${input.formattedIssueTitle}`;

  if (input.availableBranches.includes(targetBranchName)) {
    return { kind: "already-exists", targetBranchName };
  }

  const previousBranch = findPreviousIssueBranch(
    input.availableBranches,
    input.issueNumber,
    input.managedBranchTypes,
  );
  const isRename = previousBranch !== undefined;
  const baseBranchName = previousBranch ?? input.developmentBranch;
  const parentBranch =
    isRename && input.currentParentBranch !== undefined
      ? input.currentParentBranch
      : baseBranchName;

  return {
    kind: "create",
    targetBranchName,
    baseBranchName,
    isRename,
    parentBranch,
  };
}

function findPreviousIssueBranch(
  branches: readonly string[],
  issueNumber: number,
  branchTypes: readonly string[],
): string | undefined {
  for (const branchType of branchTypes) {
    const prefix = `${branchType}/${issueNumber}-`;
    const matchingBranch = branches.find((branch) => branch.startsWith(prefix));
    if (matchingBranch !== undefined) return matchingBranch;
  }
  return undefined;
}
