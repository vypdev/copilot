import { BUGBOT_MAX_COMMENTS } from '../../../../policies/bugbot_constants';
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
export function applyCommentLimit(
    findings: BugbotFinding[],
    maxComments: number = BUGBOT_MAX_COMMENTS
): ApplyLimitResult {
    if (findings.length <= maxComments) {
        return { toPublish: findings, overflowCount: 0, overflowTitles: [] };
    }
    const toPublish = findings.slice(0, maxComments);
    const overflow = findings.slice(maxComments);
    return {
        toPublish,
        overflowCount: overflow.length,
        overflowTitles: overflow.map((f) => f.title?.trim() || f.id).filter(Boolean),
    };
}
