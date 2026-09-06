import type { PullRequestReviewComment } from "../../../../ports/pull_request_review_comment_ports";
import { type ExistingByFindingId } from "./types";
export interface BugbotComment {
    id: number;
    body: string | null;
    user?: {
        login?: string;
    };
}
export interface ParsedBugbotFindingComments {
    /** Full bodies for issue-comment read-modify-write operations. */
    issueComments: BugbotComment[];
    existingByFindingId: ExistingByFindingId;
    /** Prompt-bounded PR bodies keyed by canonical finding ID. */
    prFindingIdToBody: Record<string, string>;
}
export declare function parseBugbotFindingComments(issueComments: BugbotComment[], pullRequestCommentsByNumber: ReadonlyMap<number, PullRequestReviewComment[]>, trustedAuthorLogin?: string, reviewThreadStatesByPullRequest?: ReadonlyMap<number, Readonly<Record<string, boolean>>>): ParsedBugbotFindingComments;
export interface PreviousBugbotFinding {
    id: string;
    fullBody: string;
}
/**
 * Prompt budgets are an application safety boundary. A repository can contain
 * many historical findings, and sending every full comment to a model would
 * create unbounded cost and reduce the quality of the current analysis.
 */
export declare const MAX_PREVIOUS_FINDINGS = 100;
export declare const MAX_PREVIOUS_FINDINGS_BLOCK_LENGTH = 48000;
export declare function limitPreviousBugbotFindings(previousFindings: readonly PreviousBugbotFinding[]): PreviousBugbotFinding[];
export declare function collectPreviousBugbotFindings(issueComments: BugbotComment[], existingByFindingId: ExistingByFindingId, prFindingIdToBody: Record<string, string>): PreviousBugbotFinding[];
export declare function buildPreviousFindingsBlock(previousFindings: PreviousBugbotFinding[]): string;
