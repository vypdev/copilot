export interface PullRequestDescriptionCommandPort {
    updateDescription(owner: string, repository: string, pullRequestNumber: number, description: string, token: string): Promise<void>;
}
