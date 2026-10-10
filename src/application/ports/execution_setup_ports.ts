export interface ExecutionIssueSetupPort {
    isPullRequest(owner: string, repository: string, issueNumber: number, token: string): Promise<boolean>;
    isIssue(owner: string, repository: string, issueNumber: number, token: string): Promise<boolean>;
    getHeadBranch(owner: string, repository: string, issueNumber: number, token: string): Promise<string | undefined>;
    getLabels(owner: string, repo: string, issueNumber: number, token: string): Promise<string[]>;
    getTitle(owner: string, repo: string, issueNumber: number, token: string): Promise<string | undefined>;
    getDescription(owner: string, repo: string, issueNumber: number, token: string): Promise<string | undefined>;
    updateDescription(owner: string, repo: string, issueNumber: number, description: string, token: string): Promise<void>;
}
