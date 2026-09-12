import type { BugbotIssueComment } from '../../../application/ports/bugbot_issue_read_ports';
import { toApplicationError } from '../../../application/errors/application_error';
import type { BugbotSourceCoverage } from '../../../domain/bugbot/context';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';

interface BugbotIssueCommentNode {
  readonly databaseId?: number | null;
  readonly body?: string | null;
  readonly author?: { readonly login?: string | null } | null;
  readonly createdAt?: string | null;
}

interface BugbotIssueCommentConnection {
  readonly nodes?: readonly (BugbotIssueCommentNode | null)[] | null;
  readonly pageInfo?: {
    readonly hasPreviousPage?: boolean;
    readonly startCursor?: string | null;
  } | null;
}

interface BugbotIssueCommentQueryResult {
  readonly repository?: {
    readonly issueOrPullRequest?: {
      readonly comments?: BugbotIssueCommentConnection | null;
    } | null;
  } | null;
}

/** Reads the newest Bugbot issue/PR conversation comments with a fixed two-page budget. */
export class BugbotIssueCommentQueryRepository {
  constructor(
    private readonly githubClient: GithubClientPort<GithubGraphqlTransportClient>,
  ) {}

  async listBugbotIssueCommentsBounded(
    owner: string,
    repository: string,
    issueNumber: number,
    token: string,
  ): Promise<{ readonly items: BugbotIssueComment[]; readonly coverage: BugbotSourceCoverage }> {
    try {
      const client = this.githubClient.getClient(token);
      const pages: BugbotIssueComment[][] = [];
      let cursor: string | null = null;
      let limitReached = false;
      do {
        const result: BugbotIssueCommentQueryResult = await client.graphql<BugbotIssueCommentQueryResult>(
          `query ($owner: String!, $repository: String!, $issueNumber: Int!, $cursor: String) {
            repository(owner: $owner, name: $repository) {
              issueOrPullRequest(number: $issueNumber) {
                ... on Issue {
                  comments(last: 100, before: $cursor) {
                    nodes { databaseId body author { login } createdAt }
                    pageInfo { hasPreviousPage startCursor }
                  }
                }
                ... on PullRequest {
                  comments(last: 100, before: $cursor) {
                    nodes { databaseId body author { login } createdAt }
                    pageInfo { hasPreviousPage startCursor }
                  }
                }
              }
            }
          }`,
          { owner, repository, issueNumber, cursor },
        );
        const comments: BugbotIssueCommentConnection | null | undefined = result.repository?.issueOrPullRequest?.comments;
        const page = (comments?.nodes ?? []).flatMap((comment: BugbotIssueCommentNode | null) => {
          if (!comment) return [];
          if (!Number.isSafeInteger(comment.databaseId) || Number(comment.databaseId) <= 0) {
            throw new Error('Issue comment identity is unavailable.');
          }
          return [{
            id: Number(comment.databaseId),
            body: comment.body ?? null,
            ...(comment.author?.login ? { user: { login: comment.author.login } } : {}),
            ...(comment.createdAt ? { createdAt: comment.createdAt } : {}),
          }];
        });
        pages.push(page);
        const hasOlder = comments?.pageInfo?.hasPreviousPage === true;
        if (hasOlder && pages.length < 2) {
          cursor = comments?.pageInfo?.startCursor ?? null;
          if (cursor === null) throw new Error('Issue comment pagination cursor is missing.');
        } else {
          limitReached = hasOlder;
          cursor = null;
        }
      } while (cursor !== null);

      const items = pages.reverse().flat();
      return {
        items,
        coverage: {
          source: 'issue-comments',
          status: limitReached ? 'partial' : 'complete',
          pagesFetched: pages.length,
          itemsFetched: items.length,
          itemsRetained: items.length,
          omittedItems: 0,
          truncatedItems: 0,
          limitReached,
          ...(limitReached ? { providerLimitReached: true } : {}),
        },
      };
    } catch (error) {
      throw toApplicationError(
        error,
        'provider.unavailable',
        `Unable to read Bugbot context comments for item #${issueNumber}.`,
      );
    }
  }
}
