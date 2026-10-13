import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import { PROJECT_BOARD_ITEM_PAGE_LIMIT } from "../../../infrastructure/github/project_board_provider_limits";
import { logError } from "../../../utils/logger";
import { ProjectDetail } from "../../model/project_detail";
import { paginateCursor, type CursorPage } from "../github/github_pagination_adapter";

interface ProjectItemNode {
  id: string;
  content?: { id?: string };
}

interface ProjectItemsResponse {
  node: { items?: CursorPage<ProjectItemNode> } | null;
}

const CONTENT_QUERY = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issueOrPullRequest: issueOrPullRequest(number: $number) {
          ... on Issue { id }
          ... on PullRequest { id }
        }
      }
    }`;

const PROJECT_ITEMS_QUERY = `
    query($projectId: ID!, $after: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              content {
                ... on Issue { id }
                ... on PullRequest { id }
              }
            }
          }
        }
      }
    }`;

export async function getProjectItemId(
  graphqlClient: GithubGraphqlTransportClient,
  project: ProjectDetail,
  owner: string,
  repo: string,
  issueOrPullRequestNumber: number,
): Promise<string | undefined> {
  const client = graphqlClient;
  const contentResult = await client.graphql<{
    repository: { issueOrPullRequest?: { id: string } | null } | null;
  }>(CONTENT_QUERY, { owner, repo, number: issueOrPullRequestNumber });
  const contentId = contentResult.repository?.issueOrPullRequest?.id;
  if (!contentId) {
    logError(`Issue or PR #${issueOrPullRequestNumber} not found in repository.`);
    return undefined;
  }

  const projectItemId = await findProjectItemId(client, project, contentId);
  if (!projectItemId) {
    const message = `Issue or pull request #${issueOrPullRequestNumber} is not in project ${project.id}.`;
    logError(message);
    throw new Error(message);
  }
  return projectItemId;
}

export async function getProjectItemIdByContentId(
  graphqlClient: GithubGraphqlTransportClient,
  project: ProjectDetail,
  contentId: string,
): Promise<string | undefined> {
  return findProjectItemId(graphqlClient, project, contentId);
}

async function findProjectItemId(
  client: GithubGraphqlTransportClient,
  project: ProjectDetail,
  contentId: string,
): Promise<string | undefined> {
  for await (const page of paginateCursor(
    async (after) => {
      const result = await client.graphql<ProjectItemsResponse>(PROJECT_ITEMS_QUERY, {
        projectId: project.id,
        after,
      });
      if (!result.node) {
        throw new Error(`Project ${project.id} was not found while reading project items.`);
      }
      return result.node.items ?? {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
    { description: "project board content", maxPages: PROJECT_BOARD_ITEM_PAGE_LIMIT },
  )) {
    const item = page.nodes.find((candidate) => candidate.content?.id === contentId);
    if (item) return item.id;
  }
  return findContentSideProjectItemId(client, project, contentId);
}

/** Recover a missing board-list entry from the exact content's own memberships. */
async function findContentSideProjectItemId(
  client: GithubGraphqlTransportClient,
  project: ProjectDetail,
  contentId: string,
): Promise<string | undefined> {
  for await (const page of paginateCursor(
    async after => {
      const result = await client.graphql<{
        node?: { id?: string; __typename?: string; projectItems?: CursorPage<{ id?: string; project?: { id?: string }; content?: { id?: string } }> } | null;
      }>(`query($contentId: ID!, $after: String) {
        node(id: $contentId) {
          id __typename
          ... on Issue { projectItems(first: 100, after: $after, includeArchived: true) {
            pageInfo { hasNextPage endCursor }
            nodes { id project { id } content { ... on Issue { id } ... on PullRequest { id } } }
          } }
          ... on PullRequest { projectItems(first: 100, after: $after, includeArchived: true) {
            pageInfo { hasNextPage endCursor }
            nodes { id project { id } content { ... on Issue { id } ... on PullRequest { id } } }
          } }
        }
      }`, { contentId, after });
      const node = result.node;
      const membership = node?.projectItems;
      if (node?.id !== contentId || !['Issue', 'PullRequest'].includes(node.__typename ?? '')
        || !membership || !Array.isArray(membership.nodes)
        || typeof membership.pageInfo?.hasNextPage !== 'boolean'
        || !(membership.pageInfo.endCursor === null || typeof membership.pageInfo.endCursor === 'string')) {
        throw new Error('The content-side Project membership evidence is unavailable or malformed.');
      }
      return membership;
    },
    { description: 'content-side project membership', maxPages: 2 },
  )) {
    const item = page.nodes.find(candidate => candidate.project?.id === project.id && candidate.content?.id === contentId);
    if (item) {
      if (typeof item.id !== 'string' || !item.id.trim()) throw new Error('The content-side Project item identity is malformed.');
      return item.id;
    }
  }
  return undefined;
}
