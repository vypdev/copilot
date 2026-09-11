/** Provider-owned, user-facing navigation for one verified Bugbot projection. */
export interface BugbotReviewNavigation {
  readonly pullRequestUrl: string;
  readonly commitUrl: string;
  readonly runUrl?: string;
}

/**
 * Keeps provider URL construction outside the use case and presentation policy.
 * Implementations must return trusted, absolute HTTPS URLs only.
 */
export interface BugbotReviewNavigationPort {
  forPullRequest(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    headSha: string,
  ): BugbotReviewNavigation;
}
