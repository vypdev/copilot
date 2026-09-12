export type BugbotContextCoverageStatus = "complete" | "partial";
export type BugbotContextSource = "selection" | "previous-findings" | "human-conversation" | "issue-comments" | "pull-request-comments" | "review-threads" | "diff" | "rules";
export interface BugbotSourceCoverage {
    readonly source: BugbotContextSource;
    readonly status: BugbotContextCoverageStatus;
    readonly pagesFetched: number;
    readonly itemsFetched: number;
    readonly itemsRetained: number;
    readonly omittedItems: number;
    readonly truncatedItems: number;
    readonly limitReached: boolean;
    /** True when a provider page cap hides an unknown number of older records. */
    readonly providerLimitReached?: boolean;
}
export interface BugbotContextCoverage {
    readonly status: BugbotContextCoverageStatus;
    readonly sources: readonly BugbotSourceCoverage[];
}
export interface BugbotReviewTarget {
    readonly repository: {
        readonly owner: string;
        readonly name: string;
        readonly id?: number;
    };
    readonly triggerKind: string;
    readonly issueNumber?: number;
    readonly headOwner: string;
    readonly headRef: string;
    readonly expectedHeadSha?: string;
    readonly eventPullRequestNumber?: number;
    readonly pullRequestRequired: boolean;
}
export interface BugbotPullRequestIdentity {
    readonly number: number;
    readonly state: "open" | "closed";
    readonly baseRepository: {
        readonly owner: string;
        readonly name: string;
        readonly id?: number;
    };
    readonly headRepositoryOwner: string;
    readonly headRef: string;
    readonly headSha: string;
}
export type BugbotCanonicalPullRequestSelection = {
    readonly kind: "canonical";
    readonly pullRequest: BugbotPullRequestIdentity;
    readonly reason: "event" | "exact-head";
} | {
    readonly kind: "none";
} | {
    readonly kind: "ambiguous";
    readonly candidateCount: 2;
} | {
    readonly kind: "stale";
    readonly reason: string;
};
export declare function selectCanonicalBugbotPullRequest(target: BugbotReviewTarget, candidates: readonly BugbotPullRequestIdentity[], source: "event" | "exact-head"): BugbotCanonicalPullRequestSelection;
export declare function summarizeBugbotCoverage(sources: readonly BugbotSourceCoverage[]): BugbotContextCoverage;
export declare function completeBugbotSourceCoverage(source: BugbotContextSource, items: number, pagesFetched?: number): BugbotSourceCoverage;
