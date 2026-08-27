export interface ThinkCommentSource {
    issueCommentBody?: string;
    pullRequestReviewCommentBody?: string;
    isIssueComment: boolean;
    isPullRequestReviewComment: boolean;
}
export declare function getThinkCommentBody(source: ThinkCommentSource): string;
export declare function extractMentionQuestion(commentBody: string, tokenUser: string): string;
