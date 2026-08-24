/**
 * Watermark appended to comments (issues and PRs) to attribute Copilot.
 * Bugbot comments include commit link and note about auto-update on new commits.
 */
export declare const COPILOT_MARKETPLACE_URL = "https://github.com/marketplace/actions/copilot-github-with-super-powers";
export interface BugbotWatermarkOptions {
    commitSha: string;
    owner: string;
    repo: string;
}
export declare function getCommentWatermark(options?: BugbotWatermarkOptions): string;
/** Removes all trailing Copilot watermarks before a read-modify-write update. */
export declare function stripTrailingCommentWatermarks(comment: string): string;
