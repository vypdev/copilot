export interface GithubCommentTargetInput {
    readonly eventName?: string;
    readonly issue?: { readonly pull_request?: unknown };
}

/** Identifies GitHub's `issue_comment` transport when its target is an exact PR. */
export function isPullRequestConversationComment(
    input: GithubCommentTargetInput | undefined,
): boolean {
    if (input?.eventName !== 'issue_comment') return false;
    const marker = input.issue?.pull_request;
    return typeof marker === 'object' && marker !== null && !Array.isArray(marker);
}
