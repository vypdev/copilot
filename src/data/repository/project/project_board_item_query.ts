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

export async function isProjectContentLinked(
  graphqlClient: GithubGraphqlTransportClient,
  project: ProjectDetail,
  contentId: string,
): Promise<boolean> {
  return Boolean(await findProjectItemId(graphqlClient, project, contentId));
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
  return undefined;
}
