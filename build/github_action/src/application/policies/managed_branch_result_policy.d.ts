export interface ManagedBranchCreationPayload {
    baseBranchName: string;
    baseBranchUrl: string;
    newBranchName: string;
    newBranchUrl: string;
}
export interface ManagedBranchPresentationInput {
    owner: string;
    repo: string;
    developmentBranch: string;
    baseBranchName: string;
    baseBranchUrl: string;
    branchName: string;
    newBranchUrl: string;
    isRename: boolean;
    commitPrefix?: string;
}
export interface ManagedBranchPresentation {
    step: string;
    reminders: string[];
}
export declare function readManagedBranchCreationPayload(payload: unknown): ManagedBranchCreationPayload | undefined;
export declare function buildManagedBranchPresentation(input: ManagedBranchPresentationInput): ManagedBranchPresentation;
