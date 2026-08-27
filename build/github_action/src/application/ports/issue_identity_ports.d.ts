export interface IssueIdentityQueryPort {
    getId(owner: string, repository: string, issueNumber: number, token: string): Promise<string>;
}
