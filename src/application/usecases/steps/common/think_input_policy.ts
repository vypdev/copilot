export interface ThinkCommentSource {
    issueCommentBody?: string;
    pullRequestReviewCommentBody?: string;
    isIssueComment: boolean;
    isPullRequestReviewComment: boolean;
}

export function getThinkCommentBody(source: ThinkCommentSource): string {
    if (source.isIssueComment) return source.issueCommentBody ?? '';
    if (source.isPullRequestReviewComment) return source.pullRequestReviewCommentBody ?? '';
    return '';
}

export function extractMentionQuestion(commentBody: string, tokenUser: string): string {
    const escapedUsername = tokenUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return commentBody.replace(new RegExp(`@${escapedUsername}`, 'gi'), '').trim();
}
