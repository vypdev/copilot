export interface IssueClosurePort {
    closeIssue(owner: string, repository: string, issueNumber: number, token: string): Promise<boolean>;
    addComment(owner: string, repository: string, issueNumber: number, comment: string, token: string): Promise<void>;
}

export interface IssueNotificationPort {
    openIssue(owner: string, repository: string, issueNumber: number, token: string): Promise<boolean>;
    addComment(owner: string, repository: string, issueNumber: number, comment: string, token: string): Promise<void>;
}

export interface IssueCommentUpdatePort {
    updateComment(owner: string, repository: string, issueNumber: number, commentId: number, comment: string, token: string): Promise<void>;
}
