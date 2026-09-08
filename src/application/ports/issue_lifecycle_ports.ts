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

export interface IssueCommentPublicationTarget {
    id: number;
    body: string | null;
    user?: { login?: string };
}

/** Read/write boundary used by the generic issue-comment single action. */
export interface IssueCommentPublicationPort {
    addComment(owner: string, repository: string, issueNumber: number, comment: string, token: string): Promise<void>;
    updateComment(owner: string, repository: string, issueNumber: number, commentId: number, comment: string, token: string): Promise<void>;
    listIssueComments(owner: string, repository: string, issueNumber: number, token: string): Promise<IssueCommentPublicationTarget[]>;
}
