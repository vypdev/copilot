import type { BugbotFinding } from "./types";
export interface ApplyLimitResult {
    /** Findings to publish as individual comments (up to maxComments). */
    toPublish: BugbotFinding[];
    /** Number of findings not published as individual comments. */
    overflowCount: number;
    /** Titles of overflow findings (for the summary comment). */
    overflowTitles: string[];
}
/**
 * Applies the max-comments limit: returns the first N findings to publish individually,
 * and overflow count + titles for a single "revisar en local" summary comment.
 */
export declare function applyCommentLimit(findings: BugbotFinding[], maxComments?: number): ApplyLimitResult;
