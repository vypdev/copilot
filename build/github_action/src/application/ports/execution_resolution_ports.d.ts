export interface ExecutionIssueResolutionContext {
    issueNumber: number;
    singleAction: {
        issue: number;
        isIssue: boolean;
        isPullRequest: boolean;
        isPush: boolean;
    };
    inputs?: Record<string, unknown>;
    owner: string;
    repo: string;
    tokens: {
        token: string;
    };
    issue: {
        number: number;
    };
    pullRequest: {
        head: string;
    };
    commit: {
        branch: string;
    };
    isSingleAction: boolean;
    isIssue: boolean;
    isPullRequest: boolean;
    isPush: boolean;
}
