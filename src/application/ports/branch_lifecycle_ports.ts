export interface BranchListQueryPort {
    getListOfBranches(owner: string, repository: string, token: string): Promise<string[]>;
}

export interface BranchLifecyclePort extends BranchListQueryPort {
    removeBranch(owner: string, repository: string, branch: string, token: string): Promise<boolean>;
}

/** Repository-credential-bound branch listing and deletion authority. */
export interface BoundBranchLifecyclePort {
    getListOfBranches(): Promise<readonly string[]>;
    removeBranch(branch: string): Promise<boolean>;
}

export interface BranchNamePort {
    formatBranchName(issueTitle: string, issueNumber: number): string;
}
