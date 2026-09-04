export interface ThinkCommentSource {
    issueCommentBody?: string;
    pullRequestReviewCommentBody?: string;
    isIssueComment: boolean;
    isPullRequestReviewComment: boolean;
}
export declare function getThinkCommentBody(source: ThinkCommentSource): string;
export declare function extractMentionQuestion(commentBody: string, tokenUser: string): string;
/** Matches GitHub usernames case-insensitively without matching a larger username. */
export declare function containsBotMention(commentBody: string, tokenUser: string): boolean;
