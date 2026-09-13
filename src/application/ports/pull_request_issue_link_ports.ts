export interface PullRequestIssueLinkPort {
    isLinked(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<boolean>;
    getDetails(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<PullRequestLinkDetails>;
    updateBaseBranch(owner: string, repository: string, pullRequestNumber: number, baseBranch: string, token: string): Promise<void>;
    updateDescription(owner: string, repository: string, pullRequestNumber: number, description: string, token: string): Promise<void>;
}


export interface PullRequestLinkDetails {
    readonly body: string;
    readonly baseBranch: string;
}

/** Repository-credential-bound PR linkage query and mutation authority. */
export interface BoundPullRequestIssueLinkPort {
    isLinked(pullRequestNumber: number): Promise<boolean>;
    getDetails(pullRequestNumber: number): Promise<PullRequestLinkDetails>;
    updateBaseBranch(pullRequestNumber: number, baseBranch: string): Promise<void>;
    updateDescription(pullRequestNumber: number, description: string): Promise<void>;
}
