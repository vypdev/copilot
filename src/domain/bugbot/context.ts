export type BugbotContextCoverageStatus = "complete" | "partial";

export type BugbotContextSource =
  | "selection"
  | "previous-findings"
  | "human-conversation"
  | "issue-comments"
  | "pull-request-comments"
  | "review-threads"
  | "diff"
  | "rules";

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
  readonly pullRequestSelection:
    | { readonly kind: "event"; readonly number?: number }
    | { readonly kind: "exact-head"; readonly required: boolean };
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

export type BugbotCanonicalPullRequestSelection =
  | { readonly kind: "canonical"; readonly pullRequest: BugbotPullRequestIdentity; readonly reason: "event" | "exact-head" }
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous"; readonly candidateCount: 2 }
  | { readonly kind: "stale"; readonly reason: string };

export function selectCanonicalBugbotPullRequest(
  target: BugbotReviewTarget,
  candidates: readonly BugbotPullRequestIdentity[],
  source: "event" | "exact-head",
): BugbotCanonicalPullRequestSelection {
  if (source === "exact-head" && candidates.length === 0) return { kind: "none" };
  if (source === "exact-head" && candidates.length > 1) {
    return { kind: "ambiguous", candidateCount: 2 };
  }
  if (candidates.length !== 1) {
    return { kind: "stale", reason: "The event pull request could not be verified." };
  }
  const candidate = candidates[0];
  const mismatch = identityMismatch(target, candidate);
  return mismatch
    ? { kind: "stale", reason: mismatch }
    : { kind: "canonical", pullRequest: candidate, reason: source };
}

export function summarizeBugbotCoverage(
  sources: readonly BugbotSourceCoverage[],
): BugbotContextCoverage {
  return {
    status: sources.some((source) => source.status === "partial") ? "partial" : "complete",
    sources,
  };
}

export function completeBugbotSourceCoverage(
  source: BugbotContextSource,
  items: number,
  pagesFetched: number = items > 0 ? 1 : 0,
): BugbotSourceCoverage {
  return {
    source,
    status: "complete",
    pagesFetched,
    itemsFetched: items,
    itemsRetained: items,
    omittedItems: 0,
    truncatedItems: 0,
    limitReached: false,
  };
}

function identityMismatch(
  target: BugbotReviewTarget,
  candidate: BugbotPullRequestIdentity,
): string | undefined {
  if (candidate.state !== "open") return "The selected pull request is not open.";
  if (target.repository.id !== undefined && candidate.baseRepository.id !== target.repository.id) {
    return "The selected pull request belongs to a different base repository.";
  }
  if (candidate.baseRepository.owner.toLowerCase() !== target.repository.owner.toLowerCase()
    || candidate.baseRepository.name.toLowerCase() !== target.repository.name.toLowerCase()) {
    return "The selected pull request belongs to a different base repository.";
  }
  if (candidate.headRepositoryOwner.toLowerCase() !== target.headOwner.toLowerCase()
    || candidate.headRef !== target.headRef) {
    return "The selected pull request head does not match the review target.";
  }
  if (target.expectedHeadSha !== undefined
    && candidate.headSha.toLowerCase() !== target.expectedHeadSha.toLowerCase()) {
    return "The selected pull request head revision is stale.";
  }
  return undefined;
}
