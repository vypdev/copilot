import type { UnresolvedFindingSummary } from "./types";
export interface BugbotFixIntent {
    isFixRequest: boolean;
    isDoRequest: boolean;
    targetFindingIds: string[];
    isReviewRequest?: boolean;
    requestText?: string;
}
export interface BugbotCommentSources {
    issue: {
        isIssueComment: boolean;
        commentBody?: string;
    };
    pullRequest: {
        isPullRequestReviewComment: boolean;
        commentBody?: string;
    };
}
/** Selects the user-authored comment that can trigger intent detection. */
export declare function selectBugbotCommentBody(sources: BugbotCommentSources): string;
/** Converts bounded finding context into the stable shape consumed by the intent prompt. */
export declare function buildUnresolvedFindingSummaries(findings: ReadonlyArray<{
    id: string;
    fullBody?: string;
}>): UnresolvedFindingSummary[];
/**
 * Validates the agent's structured response and enforces the application invariants:
 * only unresolved, explicitly requested findings can reach the autofix flow.
 */
export declare function parseBugbotFixIntentResponse(response: unknown, unresolvedFindingIds: ReadonlySet<string>): BugbotFixIntent | undefined;
