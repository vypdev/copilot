import type {
  PullRequestReviewComment,
  PullRequestReviewCommentQueryPort,
} from "../../../application/ports/pull_request_review_comment_ports";
import { toPullRequestReviewOperationError } from "../../../application/ports/pull_request_review_errors";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type {
  GithubPullRequestReviewCommentQueryClient,
  GithubReviewComment,
} from "../../../infrastructure/github/ports/github_pull_request_review_protocol";
import { requireArrayPage } from "../github/github_pagination_policy";

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
  };
}

export class PullRequestReviewCommentQueryRepository implements PullRequestReviewCommentQueryPort {
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
