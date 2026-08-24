export interface ManagedBranchPreparationDecisionInput {
    availableBranches: readonly string[];
    issueNumber: number;
    formattedIssueTitle: string;
    targetBranchType: string;
    developmentBranch: string;
    managedBranchTypes: readonly string[];
    currentParentBranch?: string;
}
export type ManagedBranchPreparationDecision = {
    kind: "already-exists";
    targetBranchName: string;
} | {
    kind: "create";
    targetBranchName: string;
    baseBranchName: string;
    isRename: boolean;
    parentBranch: string;
};
export declare function decideManagedBranchPreparation(input: ManagedBranchPreparationDecisionInput): ManagedBranchPreparationDecision;
