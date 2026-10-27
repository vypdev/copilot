import type {
  BranchDependency,
  BranchDependencyQueryPort,
  BranchSyncTarget,
} from "../../../application/ports/branch_sync_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type {
  GithubBranchSyncConversationResponse,
  GithubBranchSyncIssueNode,
  GithubBranchSyncPullRequestNode,
  GithubOpenBranchSyncResponse,
} from "../../../infrastructure/github/ports/github_branch_sync_protocol";
import {
  configuredBranchDependency,
  dependencyFromPullRequest,
  resolveOpenBranchDependencies,
} from "./branch_dependency_policy";

const OPEN_DEPENDENCIES_QUERY = `
  query BranchSyncDependencies($owner: String!, $repo: String!, $issuesCursor: String, $pullsCursor: String) {
    repository(owner: $owner, name: $repo) {
      issues(first: 100, after: $issuesCursor, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          number
          body
          state
          linkedBranches(first: 100) { nodes { ref { name repository { nameWithOwner } } } pageInfo { hasNextPage } }
        }
        pageInfo { hasNextPage endCursor }
      }
      pullRequests(first: 100, after: $pullsCursor, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          number
          body
          baseRefName
          headRefName
          headRepository { nameWithOwner }
          closingIssuesReferences(first: 100) { nodes { number repository { nameWithOwner } } pageInfo { hasNextPage } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const CONVERSATION_QUERY = `
  query BranchSyncConversation($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issueOrPullRequest(number: $number) {
        __typename
        ... on Issue {
          number
          body
          state
          linkedBranches(first: 100) { nodes { ref { name repository { nameWithOwner } } } pageInfo { hasNextPage } }
        }
        ... on PullRequest {
          number
          body
          baseRefName
          headRefName
          headRepository { nameWithOwner }
          closingIssuesReferences(first: 100) { nodes { number repository { nameWithOwner } } pageInfo { hasNextPage } }
        }
      }
    }
  }
`;

/** Discovers durable Copilot configuration first, then GitHub-linked branch/PR evidence. */
export class BranchDependencyRepository implements BranchDependencyQueryPort {
  constructor(private readonly client: GithubClientPort<GithubGraphqlTransportClient>) {}

  async listOpenDependencies(owner: string, repository: string, token: string): Promise<BranchDependency[]> {
    try {
      const graphql = this.client.getClient(token).graphql;
      const issues: GithubBranchSyncIssueNode[] = [];
      const pullRequests: GithubBranchSyncPullRequestNode[] = [];
      let issuesCursor: string | undefined;
      let pullsCursor: string | undefined;
      const issueCursors = new Set<string>();
      const pullCursors = new Set<string>();
      let loadIssues = true;
      let loadPulls = true;

      do {
        const response = await graphql<GithubOpenBranchSyncResponse>(OPEN_DEPENDENCIES_QUERY, {
          owner,
          repo: repository,
          issuesCursor,
          pullsCursor,
        });
        if (!response.repository) throw new Error("Repository was not returned by GitHub.");
        if (loadIssues) issues.push(...compact(response.repository.issues?.nodes));
        if (loadPulls) pullRequests.push(...compact(response.repository.pullRequests?.nodes));

        const issuePage = response.repository.issues?.pageInfo;
        const pullPage = response.repository.pullRequests?.pageInfo;
        if (loadIssues) requireCompletePage(issuePage, issueCursors);
        if (loadPulls) requireCompletePage(pullPage, pullCursors);
        loadIssues = loadIssues && issuePage!.hasNextPage;
        loadPulls = loadPulls && pullPage!.hasNextPage;
        issuesCursor = loadIssues ? issuePage!.endCursor! : undefined;
        pullsCursor = loadPulls ? pullPage!.endCursor! : undefined;
      } while (loadIssues || loadPulls);

      return resolveOpenBranchDependencies(issues, pullRequests, `${owner}/${repository}`);
    } catch (cause) {
      throw withCause("Unable to discover open branch dependencies from GitHub.", cause);
    }
  }

  async resolveTarget(
    owner: string,
    repository: string,
    conversationNumber: number,
    token: string,
  ): Promise<BranchSyncTarget | undefined> {
    if (conversationNumber < 1) return undefined;
    try {
      const response = await this.client.getClient(token).graphql<GithubBranchSyncConversationResponse>(
        CONVERSATION_QUERY,
        { owner, repo: repository, number: conversationNumber },
      );
      const conversation = response.repository?.issueOrPullRequest;
      if (!conversation) return undefined;
      if (conversation.__typename === "PullRequest") {
        return { ...dependencyFromPullRequest(conversation, conversationNumber), conversationNumber };
      }
      if (conversation.number !== conversationNumber || conversation.state !== 'OPEN') return undefined;
      const configured = configuredBranchDependency(conversation);
      if (configured.kind === 'invalid') return undefined;
      if (configured.kind === 'configured') return { ...configured.dependency, conversationNumber };
      const dependency = (await this.listOpenDependencies(owner, repository, token))
        .find((candidate) => candidate.issueNumber === conversationNumber);
      return dependency ? { ...dependency, conversationNumber } : undefined;
    } catch (cause) {
      throw withCause("Unable to resolve the branch synchronization target from GitHub.", cause);
    }
  }
}

function compact<T>(values: readonly (T | null)[] | null | undefined): T[] {
  return (values ?? []).filter((value): value is T => value !== null);
}

function withCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function requireCompletePage(page: { hasNextPage: boolean; endCursor?: string | null } | undefined, seen: Set<string>): void {
  if (!page || typeof page.hasNextPage !== 'boolean') throw new Error('Branch relationship inventory is incomplete.');
  if (page.hasNextPage) {
    if (!page.endCursor || seen.has(page.endCursor)) throw new Error('Branch relationship pagination did not advance.');
    seen.add(page.endCursor);
  }
}
