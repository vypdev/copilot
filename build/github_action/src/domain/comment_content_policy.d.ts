/**
 * Returns whether a comment contains content visible to a GitHub user.
 *
 * HTML comments are metadata and must not be enough to trigger a new
 * `issue_comment` workflow. This policy deliberately does not try to parse
 * Markdown: images and other rich Markdown are valid user-visible content.
 */
export declare function hasVisibleCommentContent(value: unknown): value is string;
