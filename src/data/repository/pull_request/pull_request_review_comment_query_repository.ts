import type {
  PullRequestReviewComment,
  PullRequestReviewCommentQueryPort,
  PullRequestReviewSummary,
  PullRequestReviewSummaryQueryPort,
} from "../../../application/ports/pull_request_review_comment_ports";
import { toPullRequestReviewOperationError } from "../../../application/ports/pull_request_review_errors";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type {
  GithubPullRequestReviewCommentQueryClient,
  GithubPullRequestReview,
  GithubReviewComment,
} from "../../../infrastructure/github/ports/github_pull_request_review_protocol";
import { requireArrayPage } from "../github/github_pagination_policy";
import type { BugbotSourceCoverage } from "../../../domain/bugbot/context";

function toReviewComment(
  comment: GithubReviewComment,
): PullRequestReviewComment {
  if (typeof comment.node_id !== "string" || comment.node_id.length === 0) {
    throw new Error("Review comment identity is unavailable.");
  }
  return {
    id: comment.id,
    identity: comment.node_id,
    body: comment.body ?? null,
    path: comment.path,
    line: comment.line ?? undefined,
    authorLogin: comment.user?.login ?? undefined,
    ...(comment.created_at ? { createdAt: comment.created_at } : {}),
    ...(comment.pull_request_review_id != null
      ? { parentReviewIdentity: String(comment.pull_request_review_id) }
      : {}),
    ...(comment.html_url ? { url: comment.html_url } : {}),
  };
}

function toReviewSummary(review: GithubPullRequestReview): PullRequestReviewSummary {
  if (!Number.isSafeInteger(review.id) || review.id <= 0) {
    throw new Error('Pull request review identity is unavailable.');
  }
  return closeReviewSummary(review);
}

function closeReviewSummary(review: GithubPullRequestReview): PullRequestReviewSummary {
  return {
    identity: String(review.id),
    body: review.body ?? null,
    authorLogin: review.user?.login ?? undefined,
    commitId: review.commit_id ?? undefined,
    url: review.html_url ?? undefined,
  };
}

export class PullRequestReviewCommentQueryRepository implements PullRequestReviewCommentQueryPort, PullRequestReviewSummaryQueryPort {
  constructor(
    private readonly githubClient: GithubClientPort<GithubPullRequestReviewCommentQueryClient>,
  ) {}

  async listPullRequestReviewComments(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<PullRequestReviewComment[]> {
    try {
      const client = this.githubClient.getClient(token);
      const comments: PullRequestReviewComment[] = [];
      for await (const response of client.paginate.iterator(
        client.rest.pulls.listReviewComments,
        {
          owner,
          repo: repository,
          pull_number: pullRequestNumber,
          per_page: 100,
        },
      )) {
        const page = requireArrayPage<GithubReviewComment>(response.data, 'pull request review comments');
        comments.push(...page.map(toReviewComment));
      }
      return comments;
    } catch (error) {
      throw toPullRequestReviewOperationError(error, "list-comments");
    }
  }

  async listBugbotPullRequestReviewCommentsBounded(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<{ readonly items: PullRequestReviewComment[]; readonly coverage: BugbotSourceCoverage }> {
    try {
      const client = this.githubClient.getClient(token);
      const items: PullRequestReviewComment[] = [];
      let pagesFetched = 0;
      let limitReached = false;
      for (let page = 1; page <= 2; page += 1) {
        const response = await client.rest.pulls.listReviewComments({
          owner,
          repo: repository,
          pull_number: pullRequestNumber,
          per_page: 100,
          page,
          direction: "desc",
          sort: "created",
        });
        const records = requireArrayPage<GithubReviewComment>(response.data, "pull request review comments");
        pagesFetched += 1;
        items.push(...records.map(toReviewComment));
        if (records.length < 100) break;
        if (page === 2) limitReached = true;
      }
      return {
        items,
        coverage: {
          source: "pull-request-comments",
          status: limitReached ? "partial" : "complete",
          pagesFetched,
          itemsFetched: items.length,
          itemsRetained: items.length,
          omittedItems: 0,
          truncatedItems: 0,
          limitReached,
          ...(limitReached ? { providerLimitReached: true } : {}),
        },
      };
    } catch (error) {
      throw toPullRequestReviewOperationError(error, "list-comments");
    }
  }

  async listPullRequestReviews(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<PullRequestReviewSummary[]> {
    try {
      const client = this.githubClient.getClient(token);
      const reviews: PullRequestReviewSummary[] = [];
      for await (const response of client.paginate.iterator(
        client.rest.pulls.listReviews,
        { owner, repo: repository, pull_number: pullRequestNumber, per_page: 100 },
      )) {
        const page = requireArrayPage<GithubPullRequestReview>(response.data, 'pull request reviews');
        reviews.push(...page.map(toReviewSummary));
      }
      return reviews;
    } catch (error) {
      throw toPullRequestReviewOperationError(error, 'list-reviews');
    }
  }

  async getPullRequestReviewCommentBody(
    owner: string,
    repository: string,
    _pullRequestNumber: number,
    commentId: number,
    token: string,
  ): Promise<string | null> {
    try {
      const client = this.githubClient.getClient(token);
      const { data } = await client.rest.pulls.getReviewComment({
        owner,
        repo: repository,
        comment_id: commentId,
      });
      return data.body ?? null;
    } catch (error) {
      throw toPullRequestReviewOperationError(error, "get-comment");
    }
  }
}
