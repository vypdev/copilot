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
