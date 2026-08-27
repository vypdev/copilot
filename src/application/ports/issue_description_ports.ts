export interface IssueDescriptionQueryPort {
    getDescription(owner: string, repository: string, issueNumber: number, token: string): Promise<string | undefined>;
}

export interface IssueDescriptionCommandPort {
    updateDescription(owner: string, repository: string, issueNumber: number, description: string, token: string): Promise<void>;
}
