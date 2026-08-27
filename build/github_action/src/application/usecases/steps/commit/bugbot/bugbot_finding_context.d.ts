import type { PullRequestReviewComment } from "../../../../ports/pull_request_review_comment_ports";
import { type ExistingByFindingId } from "./types";
export interface BugbotComment {
    id: number;
    body: string | null;
}
export interface ParsedBugbotFindingComments {
    /** Full bodies for issue-comment read-modify-write operations. */
    issueComments: BugbotComment[];
    existingByFindingId: ExistingByFindingId;
    /** Prompt-bounded PR bodies keyed by canonical finding ID. */
    prFindingIdToBody: Record<string, string>;
}
export declare function parseBugbotFindingComments(issueComments: BugbotComment[], pullRequestCommentsByNumber: ReadonlyMap<number, PullRequestReviewComment[]>): ParsedBugbotFindingComments;
export interface PreviousBugbotFinding {
    id: string;
    fullBody: string;
}
export declare function collectPreviousBugbotFindings(issueComments: BugbotComment[], existingByFindingId: ExistingByFindingId, prFindingIdToBody: Record<string, string>): PreviousBugbotFinding[];
export declare function buildPreviousFindingsBlock(previousFindings: PreviousBugbotFinding[]): string;
