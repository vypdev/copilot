import { logDebugInfo } from "../../../utils/logger";
import type { PullRequestReviewThreadCommandPort } from "../../../application/ports/pull_request_review_comment_ports";
import {
  PullRequestReviewOperationError,
  toPullRequestReviewOperationError,
} from "../../../application/ports/pull_request_review_errors";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";

type ThreadPageInfo = { hasNextPage: boolean; endCursor: string | null };
type ReviewCommentNode = { id?: string | null };
type ThreadCommentsConnection = {
  nodes?: Array<ReviewCommentNode | null> | null;
  pageInfo?: ThreadPageInfo | null;
};
type ThreadNode = {
  id: string;
  isResolved?: boolean | null;
  comments?: ThreadCommentsConnection | null;
};
type LocatedReviewThread = { id: string; isResolved: boolean };
type ThreadsConnection = {
  nodes?: Array<ThreadNode | null> | null;
  pageInfo?: ThreadPageInfo | null;
};
type ThreadsResult = {
  repository?: {
    pullRequest?: {
      reviewThreads?: ThreadsConnection | null;
    } | null;
  } | null;
};
type ThreadCommentsResult = {
  node?: {
    comments?: ThreadCommentsConnection | null;
  } | null;
};

/** GitHub GraphQL adapter for locating and resolving a pull-request review thread. */
export class PullRequestReviewThreadRepository implements PullRequestReviewThreadCommandPort {
  constructor(
    private readonly githubClient: GithubClientPort<GithubGraphqlTransportClient>,
  ) {}
  resolvePullRequestReviewThread = async (
    owner: string,
    repository: string,
    pullNumber: number,
    commentIdentity: string,
    token: string,
  ): Promise<void> => {
    try {
      const octokit = this.githubClient.getClient(token);
      const thread = await this.findThread(
        octokit,
        owner,
        repository,
        pullNumber,
        commentIdentity,
      );

      if (thread == null) {
        throw new PullRequestReviewOperationError("resolve-thread");
      }

      if (thread.isResolved) {
        logDebugInfo("Pull request review thread is already resolved.");
        return;
      }

      const result = await octokit.graphql<{
        resolveReviewThread?: { thread?: { id: string } | null };
      }>(
        `mutation ($threadId: ID!) {
                    resolveReviewThread(input: { threadId: $threadId }) {
                        thread { id }
                    }
                }`,
        { threadId: thread.id },
      );
      if (result.resolveReviewThread?.thread?.id !== thread.id) {
        throw new PullRequestReviewOperationError("resolve-thread");
      }
      logDebugInfo("Resolved pull request review thread.");
    } catch (error) {
      throw toPullRequestReviewOperationError(error, "resolve-thread");
    }
  };

  private findThread = async (
    octokit: GithubGraphqlTransportClient,
    owner: string,
    repository: string,
    pullNumber: number,
    commentIdentity: string,
  ): Promise<LocatedReviewThread | null> => {
    if (commentIdentity.trim().length === 0) return null;
    let locatedThread: LocatedReviewThread | null = null;
    let threadsCursor: string | null = null;
    const seenThreadCursors = new Set<string>();

    outer: do {
      const threadsData: ThreadsResult = await octokit.graphql<ThreadsResult>(
        `query ($owner: String!, $repo: String!, $prNumber: Int!, $threadsAfter: String) {
                    repository(owner: $owner, name: $repo) {
                        pullRequest(number: $prNumber) {
                            reviewThreads(first: 100, after: $threadsAfter) {
                                nodes {
                                    id
                                    isResolved
                                    comments(first: 100) {
                                        nodes { id }
                                        pageInfo { hasNextPage endCursor }
                                    }
                                }
                                pageInfo { hasNextPage endCursor }
                            }
                        }
                    }
                }`,
        {
          owner,
          repo: repository,
          prNumber: pullNumber,
          threadsAfter: threadsCursor,
        },
      );
      const threads = threadsData?.repository?.pullRequest?.reviewThreads;
      if (threads == null) break;

      for (const thread of threads.nodes ?? []) {
        if (thread == null) continue;
        let commentsCursor: string | null = null;
        const seenCommentCursors = new Set<string>();
        let commentNodes = thread.comments?.nodes ?? [];
        let commentsPageInfo = thread.comments?.pageInfo;

        do {
          if (
            commentNodes.some((comment) => comment?.id === commentIdentity)
          ) {
            locatedThread = {
              id: thread.id,
              isResolved: thread.isResolved === true,
            };
            break outer;
          }
          if (
            !commentsPageInfo?.hasNextPage ||
            commentsPageInfo.endCursor == null
          )
            break;

          const nextCommentsCursor = commentsPageInfo.endCursor;
          if (seenCommentCursors.has(nextCommentsCursor)) {
            throw new PullRequestReviewOperationError("resolve-thread");
          }
          seenCommentCursors.add(nextCommentsCursor);
          commentsCursor = nextCommentsCursor;
          const nextComments = await octokit.graphql<ThreadCommentsResult>(
            `query ($threadId: ID!, $commentsAfter: String) {
                            node(id: $threadId) {
                                ... on PullRequestReviewThread {
                                    comments(first: 100, after: $commentsAfter) {
                                        nodes { id }
                                        pageInfo { hasNextPage endCursor }
                                    }
                                }
                            }
                        }`,
            { threadId: thread.id, commentsAfter: commentsCursor },
          );
          commentNodes = nextComments?.node?.comments?.nodes ?? [];
          commentsPageInfo = nextComments?.node?.comments?.pageInfo ?? {
            hasNextPage: false,
            endCursor: null,
          };
          if (
            commentNodes.some((comment) => comment?.id === commentIdentity)
          ) {
            locatedThread = {
              id: thread.id,
              isResolved: thread.isResolved === true,
            };
            break outer;
          }
        } while (
          commentsPageInfo?.hasNextPage === true &&
          commentsPageInfo?.endCursor != null
        );
      }

      const pageInfo = threads.pageInfo;
      if (locatedThread != null || !pageInfo?.hasNextPage) break;
      const nextThreadsCursor = pageInfo.endCursor ?? null;
      if (nextThreadsCursor == null) break;
      if (seenThreadCursors.has(nextThreadsCursor)) {
        throw new PullRequestReviewOperationError("resolve-thread");
      }
      seenThreadCursors.add(nextThreadsCursor);
      threadsCursor = nextThreadsCursor;
    } while (threadsCursor != null);

    return locatedThread;
  };
}
