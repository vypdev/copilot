import type {
  PullRequestReviewCommentCommandPort,
  PullRequestReviewCommentDraft,
} from "../../../application/ports/pull_request_review_comment_ports";
import {
  PullRequestReviewOperationError,
  toPullRequestReviewOperationError,
} from "../../../application/ports/pull_request_review_errors";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type {
  GithubPullRequestReviewCommentCreateClient,
  GithubPullRequestReviewCommentQueryClient,
} from "../../../infrastructure/github/ports/github_pull_request_review_protocol";
import { requireArrayPage } from "../github/github_pagination_policy";

export class PullRequestReviewCommentCommandRepository implements PullRequestReviewCommentCommandPort {
  constructor(
    private readonly createClient: GithubClientPort<GithubPullRequestReviewCommentCreateClient>,
    private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
    private readonly queryClient?: GithubClientPort<GithubPullRequestReviewCommentQueryClient>,
  ) {}

  private async listExistingBodies(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<Set<string>> {
    if (!this.queryClient) return new Set();
    const client = this.queryClient.getClient(token);
    const bodies = new Set<string>();
    for await (const page of client.paginate.iterator(
      client.rest.pulls.listReviewComments,
      { owner, repo: repository, pull_number: pullRequestNumber },
    )) {
      const comments = requireArrayPage<{ body?: unknown }>(page.data, 'existing pull request review comments');
      for (const comment of comments) {
        if (typeof comment.body === "string") bodies.add(comment.body);
      }
    }
    return bodies;
  }

  async createReviewWithComments(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    commitSha: string,
    body: string,
    comments: PullRequestReviewCommentDraft[],
    token: string,
  ): Promise<void> {
    if (comments.length === 0 && body.trim().length === 0) return;

    try {
      const existingBodies = await this.listExistingBodies(
        owner,
        repository,
        pullRequestNumber,
        token,
      );
      const pendingComments = comments.filter(
        (comment) => !existingBodies.has(comment.body),
      );
      if (comments.length > 0 && pendingComments.length === 0) return;
      const client = this.createClient.getClient(token);
      const reviewComments = pendingComments.map((comment) => ({
        body: comment.body,
        path: comment.path,
        line: comment.line,
        side: "RIGHT",
      }));
      await client.rest.pulls.createReview({
        owner,
        repo: repository,
        pull_number: pullRequestNumber,
        commit_id: commitSha,
        body,
        event: "COMMENT",
        ...(reviewComments.length > 0 ? { comments: reviewComments } : {}),
      });
    } catch (error) {
      const context = comments.length > 0
        ? { failedCount: comments.length, totalCount: comments.length }
        : undefined;
      throw toPullRequestReviewOperationError(error, "publish-comments", context);
    }
  }

  async updatePullRequestReviewComment(
    _owner: string,
    _repository: string,
    commentIdentity: string,
    body: string,
    token: string,
  ): Promise<void> {
    try {
      const client = this.graphqlClient.getClient(token);
      const result = await client.graphql<{
        updatePullRequestReviewComment?: {
          pullRequestReviewComment?: { id: string } | null;
        } | null;
      }>(
        `mutation ($commentIdentity: ID!, $body: String!) {
          updatePullRequestReviewComment(
            input: { pullRequestReviewCommentId: $commentIdentity, body: $body }
          ) {
            pullRequestReviewComment { id }
          }
        }`,
        { commentIdentity, body },
      );
      if (
        result.updatePullRequestReviewComment?.pullRequestReviewComment?.id !==
        commentIdentity
      ) {
        throw new PullRequestReviewOperationError("update-comment");
      }
    } catch (error) {
      throw toPullRequestReviewOperationError(error, "update-comment");
    }
  }
}
