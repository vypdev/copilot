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

/** Matches GitHub usernames case-insensitively without matching a larger username. */
export function containsBotMention(commentBody: string, tokenUser: string): boolean {
    const normalizedUser = tokenUser.trim().replace(/^@/u, '');
    if (!normalizedUser) return false;
    const escapedUsername = normalizedUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9_-])@${escapedUsername}(?=$|[^A-Za-z0-9_-])`, 'iu').test(commentBody);
}
