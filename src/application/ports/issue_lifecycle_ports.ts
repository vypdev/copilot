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

/** Repository-credential-bound comment publication authority. */
export interface BoundIssueNotificationPort {
    addComment(issueNumber: number, comment: string): Promise<void>;
}

/** Native issue-state authority without conversation publication capability. */
export interface BoundIssueReopenPort {
    openIssue(issueNumber: number): Promise<boolean>;
}

/** Native issue-state authority without conversation publication capability. */
export interface BoundIssueStatePort {
    closeIssue(issueNumber: number): Promise<boolean>;
}

/** Repository-credential-bound issue closure and notification authority. */
export interface BoundIssueClosurePort extends BoundIssueNotificationPort {
    closeIssue(issueNumber: number): Promise<boolean>;
}

/** Repository-credential-bound comment update authority. */
export interface BoundIssueCommentUpdatePort {
    updateComment(issueNumber: number, commentId: number, comment: string): Promise<void>;
}

export interface IssueCommentPublicationTarget {
    id: number;
    body: string | null;
    user?: { login?: string };
}

export interface IssueCommentQueryPort {
    listIssueComments(owner: string, repository: string, issueNumber: number, token: string): Promise<IssueCommentPublicationTarget[]>;
}

/** Repository-credential-bound read-only issue comment access. */
export interface BoundIssueCommentQueryPort {
    listIssueComments(issueNumber: number): Promise<readonly IssueCommentPublicationTarget[]>;
}

/** Read/write boundary used by the generic issue-comment single action. */
export interface IssueCommentPublicationPort extends IssueCommentQueryPort {
    addComment(owner: string, repository: string, issueNumber: number, comment: string, token: string): Promise<void>;
    updateComment(owner: string, repository: string, issueNumber: number, commentId: number, comment: string, token: string): Promise<void>;
}

export interface BoundIssueCommentPublicationPort extends BoundIssueCommentQueryPort {
    addComment(issueNumber: number, comment: string): Promise<void>;
    updateComment(issueNumber: number, commentId: number, comment: string): Promise<void>;
}
