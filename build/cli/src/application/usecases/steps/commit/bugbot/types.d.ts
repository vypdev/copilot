/**
 * Bugbot types: data structures used across detection, publishing, and autofix.
 * GitHub supplies the canonical PR diff and the configured agent can inspect
 * the read-only workspace for context before returning findings.
 */
/** Single finding from the configured findings agent. */
export interface BugbotFinding {
    id: string;
    title: string;
    description: string;
    /** Computed locally; never accepted from the agent as an authority. */
    fingerprint?: string;
    file?: string;
    line?: number;
    endLine?: number;
    severity?: string;
    confidence?: number;
    category?: string;
    evidence?: string;
    suggestion?: string;
}
export interface ExistingIssueFindingInfo {
    commentId: number;
    resolved: boolean;
    fingerprint?: string;
    resolution?: BugbotFindingResolution;
}
export interface ExistingPullRequestFindingInfo {
    commentIdentity: string;
    pullRequestNumber: number;
    resolved: boolean;
    /** Fresh GitHub thread state when the provider supplied it. */
    threadResolved?: boolean;
    fingerprint?: string;
    resolution?: BugbotFindingResolution;
}
export type BugbotFindingResolution = 'fixed' | 'obsolete' | 'dismissed';
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
    pathToDiffLocations?: Record<string, Array<{
        line: number;
        side: 'LEFT' | 'RIGHT';
    }>>;
    changes?: Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch: string;
    }>;
}
/** Unresolved finding with a prompt-bounded comment body. */
export interface UnresolvedFindingWithBody {
    id: string;
    fullBody: string;
}
/** Finding projection used by prompts that ask the agent to select findings. */
export interface UnresolvedFindingSummary {
    id: string;
    title: string;
    description?: string;
    file?: string;
    line?: number;
}
export declare function findExistingFindingInfo(existingByFindingId: ExistingByFindingId, finding: Pick<BugbotFinding, 'id' | 'fingerprint'>): ExistingFindingInfo | undefined;
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
    /** Canonical, bounded PR diff supplied by the GitHub API. */
    reviewDiffBlock?: string;
    /** Bounded human review discussion that may affect finding validity. */
    reviewConversationBlock?: string;
    prContext: BugbotPrContext | null;
    /** Bounded bodies used by intent prompts and autofix. */
    unresolvedFindingsWithBody: UnresolvedFindingWithBody[];
}
