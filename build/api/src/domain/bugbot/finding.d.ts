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
/** A match carries its durable key so updating a comment cannot re-key it. */
export declare function findExistingFindingMatch(existingByFindingId: ExistingByFindingId, finding: Pick<BugbotFinding, 'id' | 'fingerprint' | 'semanticFingerprint'>): {
    id: string;
    info: ExistingFindingInfo;
} | undefined;
/**
 * Preserve trusted IDs across title/location changes, before limits, publication
 * and final projection. Multiple reports of one uniquely matched durable finding
 * share one record; unmatched or ambiguous reports remain independent evidence.
 */
export declare function retainExistingFindingIds(findings: readonly BugbotFinding[], existingByFindingId: ExistingByFindingId): BugbotFinding[];
