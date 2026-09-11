/**
 * Provider-neutral Bugbot finding and durable identity contracts.
 *
 * These types are shared by analysis, reconciliation, and publication. Keeping
 * them in the domain prevents policies from depending on a particular use-case
 * folder and gives every adapter one stable semantic vocabulary.
 */
export interface BugbotFinding {
    id: string;
    title: string;
    description: string;
    /** Computed locally; never accepted from the agent as an authority. */
    fingerprint?: string;
    /** Location-independent reconciliation identity computed locally. */
    semanticFingerprint?: string;
    file?: string;
    line?: number;
    endLine?: number;
    severity?: string;
    confidence?: number;
    category?: string;
    evidence?: string;
    suggestion?: string;
    /** Optional enclosing symbol used only to improve local identity. */
    symbol?: string;
    /** Short code anchor used only to improve local identity. */
    codeSnippet?: string;
    /** Exact replacement text for a suggested change, when safe and local. */
    suggestedCode?: string;
}
export type BugbotFindingResolution = 'fixed' | 'obsolete' | 'dismissed';
export interface ExistingIssueFindingInfo {
    commentId: number;
    resolved: boolean;
    fingerprint?: string;
    semanticFingerprint?: string;
    resolution?: BugbotFindingResolution;
}
export interface ExistingPullRequestFindingInfo {
    commentIdentity: string;
    pullRequestNumber: number;
    resolved: boolean;
    /** Fresh provider thread state when it was available. */
    threadResolved?: boolean;
    threadResolvedByLogin?: string;
    parentReviewIdentity?: string;
    url?: string;
    /** Explicitly non-clean when durable marker and native facts disagree. */
    verificationRequired?: boolean;
    fingerprint?: string;
    semanticFingerprint?: string;
    resolution?: BugbotFindingResolution;
}
/** Tracks each durable destination independently so partial failures remain retryable. */
export interface ExistingFindingInfo {
    issue?: ExistingIssueFindingInfo;
    pullRequest?: ExistingPullRequestFindingInfo;
}
export type ExistingByFindingId = Record<string, ExistingFindingInfo>;
export declare function isExistingFindingFullyResolved(finding: ExistingFindingInfo): boolean;
export declare function findExistingFindingInfo(existingByFindingId: ExistingByFindingId, finding: Pick<BugbotFinding, 'id' | 'fingerprint' | 'semanticFingerprint'>): ExistingFindingInfo | undefined;
