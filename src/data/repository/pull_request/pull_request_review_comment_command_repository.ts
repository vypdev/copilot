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

const MAX_CONCURRENT_COMMENTS = 10;

function chunkComments(
  comments: PullRequestReviewCommentDraft[],
): PullRequestReviewCommentDraft[][] {
  const chunks: PullRequestReviewCommentDraft[][] = [];
  for (
    let index = 0;
    index < comments.length;
    index += MAX_CONCURRENT_COMMENTS
  ) {
    chunks.push(comments.slice(index, index + MAX_CONCURRENT_COMMENTS));
  }
  return chunks;
}

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
      for (const comment of page.data) {
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
    comments: PullRequestReviewCommentDraft[],
    token: string,
  ): Promise<void> {
    if (comments.length === 0) return;

    let failedComments = 0;
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
      if (pendingComments.length === 0) return;
      const client = this.createClient.getClient(token);
      for (const commentBatch of chunkComments(pendingComments)) {
        const outcomes = await Promise.allSettled(
          commentBatch.map((comment) =>
            Promise.resolve().then(() =>
              client.rest.pulls.createReviewComment({
                owner,
                repo: repository,
                pull_number: pullRequestNumber,
                commit_id: commitSha,
                body: comment.body,
                path: comment.path,
                line: comment.line,
                side: "RIGHT",
              }),
            ),
          ),
        );
        failedComments += outcomes.filter(
          (outcome) => outcome.status === "rejected",
        ).length;
      }

      if (failedComments > 0) {
        throw new PullRequestReviewOperationError("publish-comments", {
          failedCount: failedComments,
          totalCount: pendingComments.length,
        });
      }
    } catch (error) {
      throw toPullRequestReviewOperationError(error, "publish-comments");
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
