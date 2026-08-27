export interface BranchListQueryPort {
    getListOfBranches(owner: string, repository: string, token: string): Promise<string[]>;
}

export interface BranchLifecyclePort extends BranchListQueryPort {
    removeBranch(owner: string, repository: string, branch: string, token: string): Promise<boolean>;
}

export interface BranchNamePort {
    formatBranchName(issueTitle: string, issueNumber: number): string;
}
