import type { PullRequestReviewerPort } from "../../../application/ports/pull_request_reviewer_ports";
import { toPullRequestReviewOperationError } from "../../../application/ports/pull_request_review_errors";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type {
  GithubPullRequestReviewerClient,
  GithubRequestedReviewersPage,
  GithubReview,
} from "../../../infrastructure/github/ports/github_pull_request_review_protocol";
import { requireArrayPage } from "../github/github_pagination_policy";

const COMPLETED_REVIEW_STATES = new Set([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
]);

export class PullRequestReviewerRepository implements PullRequestReviewerPort {
  constructor(
    private readonly githubClient: GithubClientPort<GithubPullRequestReviewerClient>,
  ) {}

  async getCurrentReviewers(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<string[]> {
    try {
      const client = this.githubClient.getClient(token);
      const parameters = {
        owner,
        repo: repository,
        pull_number: pullRequestNumber,
      };
      const [requested, completed] = await Promise.all([
        this.listRequestedReviewers(client, parameters),
        this.listCompletedReviewers(client, { ...parameters, per_page: 100 }),
      ]);
      const reviewers = new Map<string, string>();
      for (const login of [...requested, ...completed]) {
        const key = login.toLowerCase();
        if (!reviewers.has(key)) reviewers.set(key, login);
      }
      return [...reviewers.values()];
    } catch (error) {
      throw toPullRequestReviewOperationError(error, "list-reviewers");
    }
  }

  async addReviewersToPullRequest(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    reviewers: string[],
    token: string,
  ): Promise<string[]> {
    if (reviewers.length === 0) return [];
    try {
      const client = this.githubClient.getClient(token);
      const { data } = await client.rest.pulls.requestReviewers({
        owner,
        repo: repository,
        pull_number: pullRequestNumber,
        reviewers,
      });
      const requested = new Set(
        reviewers.map((reviewer) => reviewer.toLowerCase()),
      );
      const confirmed = new Map<string, string>();
      for (const reviewer of data.requested_reviewers ?? []) {
        const key = reviewer.login.toLowerCase();
        if (requested.has(key) && !confirmed.has(key)) {
          confirmed.set(key, reviewer.login);
        }
      }
      return [...confirmed.values()];
    } catch (error) {
      throw toPullRequestReviewOperationError(error, "request-reviewers");
    }
  }

  private async listRequestedReviewers(
    client: GithubPullRequestReviewerClient,
    parameters: Record<string, unknown>,
  ): Promise<string[]> {
    const { data } = await client.rest.pulls.listRequestedReviewers(parameters);
    const page = data as GithubRequestedReviewersPage;
    return requireArrayPage<{ login: string }>(page.users, 'requested pull request reviewers')
      .map(({ login }) => login);
  }

  private async listCompletedReviewers(
    client: GithubPullRequestReviewerClient,
    parameters: Record<string, unknown>,
  ): Promise<string[]> {
    const reviewers: string[] = [];
    for await (const response of client.paginate.iterator(
      client.rest.pulls.listReviews,
      parameters,
    )) {
      const page = requireArrayPage<GithubReview>(response.data, 'pull request reviews');
      for (const review of page) {
        if (
          review.user?.login &&
          review.state != null &&
          COMPLETED_REVIEW_STATES.has(review.state.toUpperCase())
        ) {
          reviewers.push(review.user.login);
        }
      }
    }
    return reviewers;
  }
}
