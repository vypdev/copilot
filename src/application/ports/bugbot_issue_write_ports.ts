export interface BugbotIssueCommentCreatePort {
  addComment(
    owner: string,
    repository: string,
    issueNumber: number,
    comment: string,
    token: string,
    options?: { commitSha?: string },
  ): Promise<void>;
}

export interface BugbotIssueCommentUpdatePort {
  updateComment(
    owner: string,
    repository: string,
    issueNumber: number,
    commentId: number,
    comment: string,
    token: string,
    options?: { commitSha?: string },
  ): Promise<void>;
}

export interface BugbotIssueCommentWritePort
  extends BugbotIssueCommentCreatePort, BugbotIssueCommentUpdatePort {}

export interface BoundBugbotIssueCommentCreatePort {
  addComment(
    issueNumber: number,
    comment: string,
    options?: { commitSha?: string },
  ): Promise<void>;
}

export interface BoundBugbotIssueCommentUpdatePort {
  updateComment(
    issueNumber: number,
    commentId: number,
    comment: string,
    options?: { commitSha?: string },
  ): Promise<void>;
}

export interface BoundBugbotIssueCommentWritePort
  extends BoundBugbotIssueCommentCreatePort, BoundBugbotIssueCommentUpdatePort {}
