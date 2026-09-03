export interface PullRequestDescriptionDetails {
    readonly body: string;
    readonly headBranch: string;
    readonly baseBranch: string;
}
export interface PullRequestDescriptionCommandPort {
    updateDescription(owner: string, repository: string, pullRequestNumber: number, description: string, token: string): Promise<void>;
    /** Optional read capability used by explicit commands from issue comments. */
    getDetails?(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<PullRequestDescriptionDetails>;
}
