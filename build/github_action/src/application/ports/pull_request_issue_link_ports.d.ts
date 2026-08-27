export interface PullRequestIssueLinkPort {
    isLinked(url: string): Promise<boolean>;
    updateBaseBranch(owner: string, repository: string, pullRequestNumber: number, baseBranch: string, token: string): Promise<void>;
    updateDescription(owner: string, repository: string, pullRequestNumber: number, description: string, token: string): Promise<void>;
}
