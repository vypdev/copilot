export interface PullRequestBranchQueryPort {
    getOpenPullRequestNumbersByHeadBranch(owner: string, repository: string, branch: string, token: string): Promise<number[]>;
}

export interface BoundPullRequestBranchQueryPort {
    getOpenPullRequestNumbersByHeadBranch(branch: string): Promise<readonly number[]>;
}
