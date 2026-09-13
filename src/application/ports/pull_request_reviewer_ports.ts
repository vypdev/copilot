export interface PullRequestReviewerQueryPort {
  getCurrentReviewers(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<string[]>;
}

export interface PullRequestReviewerCommandPort {
  addReviewersToPullRequest(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    reviewers: string[],
    token: string,
  ): Promise<string[]>;
}

export interface PullRequestReviewerPort
  extends PullRequestReviewerQueryPort, PullRequestReviewerCommandPort {}

/** Repository-credential-bound reviewer query and mutation authority. */
export interface BoundPullRequestReviewerPort {
  getCurrentReviewers(pullRequestNumber: number): Promise<readonly string[]>;
  addReviewersToPullRequest(
    pullRequestNumber: number,
    reviewers: readonly string[],
  ): Promise<readonly string[]>;
}
