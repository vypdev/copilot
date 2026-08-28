/**
 * Bugbot types: data structures used across detection, publishing, and autofix.
 * The configured agent computes the diff and returns findings; we never pass a pre-computed diff to it.
 */
/** Single finding from the configured findings agent. */
export interface BugbotFinding {
    id: string;
    title: string;
    description: string;
    file?: string;
    line?: number;
    severity?: string;
    suggestion?: string;
}
export interface ExistingIssueFindingInfo {
    commentId: number;
    resolved: boolean;
}
export interface ExistingPullRequestFindingInfo {
    commentIdentity: string;
    pullRequestNumber: number;
    resolved: boolean;
}
/** Tracks each published destination independently so partial failures remain retryable. */
export interface ExistingFindingInfo {
    issue?: ExistingIssueFindingInfo;
    pullRequest?: ExistingPullRequestFindingInfo;
}
export type ExistingByFindingId = Record<string, ExistingFindingInfo>;
export declare function isExistingFindingFullyResolved(finding: ExistingFindingInfo): boolean;
/** PR metadata used only when publishing findings to GitHub. */
export interface BugbotPrContext {
    prHeadSha: string;
    prFiles: Array<{
        filename: string;
        status: string;
    }>;
    pathToFirstDiffLine: Record<string, number>;
}
/** Unresolved finding with a prompt-bounded comment body. */
export interface UnresolvedFindingWithBody {
    id: string;
    fullBody: string;
}
/** Full context for detection, mutation, publishing, and autofix intent. */
export interface BugbotContext {
    existingByFindingId: ExistingByFindingId;
    /** Full issue-comment bodies reserved for read-modify-write operations. */
    issueComments: Array<{
        id: number;
        body: string | null;
    }>;
    openPrNumbers: number[];
    /** Bounded text sent to the configured findings agent. */
    previousFindingsBlock: string;
    prContext: BugbotPrContext | null;
    /** Bounded bodies used by intent prompts and autofix. */
    unresolvedFindingsWithBody: UnresolvedFindingWithBody[];
}
