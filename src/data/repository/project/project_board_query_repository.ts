import type {
  ProjectBoardContentQueryPort,
  ProjectBoardQueryPort,
} from "../../../application/ports/project_board_query_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type {
  GithubOwnerTypeClient,
  GithubRepositoryContextClient,
} from "../../../infrastructure/github/ports/github_identity_provider_ports";
import { PROJECT_BOARD_ITEM_PAGE_LIMIT } from "../../../infrastructure/github/project_board_provider_limits";
import { logDebugInfo, logError } from "../../../utils/logger";
import { ProjectDetail } from "../../model/project_detail";
import {
  paginateCursor,
  type CursorPage,
} from "../github/github_pagination_adapter";

interface ProjectNode {
  id: string;
  title: string;
  url: string;
}

interface ProjectItemNode {
  id: string;
  content?: { id?: string };
}

interface ProjectItemsResponse {
  node: {
    items?: CursorPage<ProjectItemNode>;
  } | null;
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

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class ProjectBoardQueryRepository
  implements ProjectBoardQueryPort, ProjectBoardContentQueryPort
{
  constructor(
    private readonly repositoryContextClient: GithubClientPort<GithubRepositoryContextClient>,
    private readonly ownerTypeClient: GithubClientPort<GithubOwnerTypeClient>,
    private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
  ) {}

  private findProjectItemId = async (
    client: GithubGraphqlTransportClient,
    project: ProjectDetail,
    contentId: string,
  ): Promise<string | undefined> => {
    for await (const page of paginateCursor(
      async (after) => {
        const result = await client.graphql<ProjectItemsResponse>(
          PROJECT_ITEMS_QUERY,
          {
            projectId: project.id,
            after,
          },
        );
        if (!result.node) {
          throw new Error(
            `Project ${project.id} was not found while reading project items.`,
          );
        }
        return (
          result.node.items ?? {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          }
        );
      },
      {
        description: "project board content",
        maxPages: PROJECT_BOARD_ITEM_PAGE_LIMIT,
      },
    )) {
      const item = page.nodes.find(
        (candidate) => candidate.content?.id === contentId,
      );
      if (item) return item.id;
    }
    return undefined;
  };

  getProjectDetail = async (
    projectId: string,
    token: string,
  ): Promise<ProjectDetail> => {
    try {
      if (!/^[1-9]\d*$/.test(projectId)) {
        throw new Error(
          `Invalid project ID: ${projectId}. Must be a positive integer.`,
        );
      }

      const projectNumber = Number(projectId);
      const repositoryContext = this.repositoryContextClient.getClient(token);
      const ownerTypeProvider = this.ownerTypeClient.getClient(token);
      const graphql = this.graphqlClient.getClient(token);
      const ownerName = repositoryContext.context.repo.owner;
      const { data: owner } = await ownerTypeProvider.rest.users
        .getByUsername({ username: ownerName })
        .catch((error: unknown) => {
          throw new Error(
            `Failed to get owner information: ${errorMessage(error)}`,
          );
        });
      if (owner.type !== "Organization" && owner.type !== "User") {
        throw new Error(
          `Unsupported GitHub owner type '${String(owner.type)}' for owner ${ownerName}.`,
        );
      }
      const ownerPath = owner.type === "Organization" ? "orgs" : "users";
      const ownerQueryField = ownerPath === "orgs" ? "organization" : "user";
      const projectUrl = `https://github.com/${ownerPath}/${ownerName}/projects/${projectId}`;
      const projectQuery = `
                query($ownerName: String!, $projectNumber: Int!) {
                    ${ownerQueryField}(login: $ownerName) {
                        projectV2(number: $projectNumber) { id title url }
                    }
                }
            `;
      const result = await graphql
        .graphql<
          Record<string, { projectV2?: ProjectNode | null } | undefined>
        >(projectQuery, {
          ownerName,
          projectNumber,
        })
        .catch((error: unknown) => {
          throw new Error(
            `Failed to fetch project data: ${errorMessage(error)}`,
          );
        });
      const project = result[ownerQueryField]?.projectV2;
      if (!project) throw new Error(`Project not found: ${projectUrl}`);

      logDebugInfo(`Project ID: ${project.id}`);
      logDebugInfo(`Project Title: ${project.title}`);
      logDebugInfo(`Project URL: ${project.url}`);
      return new ProjectDetail({
        id: project.id,
        title: project.title,
        url: project.url,
        type: ownerQueryField,
        owner: ownerName,
        number: projectNumber,
      });
    } catch (error: unknown) {
      logError(`Error in getProjectDetail: ${errorMessage(error)}`);
      throw error;
    }
  };

  getProjectItemId = async (
    project: ProjectDetail,
    owner: string,
    repo: string,
    issueOrPullRequestNumber: number,
    token: string,
  ): Promise<string | undefined> => {
    const client = this.graphqlClient.getClient(token);
    const contentResult = await client.graphql<{
      repository: { issueOrPullRequest?: { id: string } | null } | null;
    }>(CONTENT_QUERY, { owner, repo, number: issueOrPullRequestNumber });
    const contentId = contentResult.repository?.issueOrPullRequest?.id;
    if (!contentId) {
      logError(
        `Issue or PR #${issueOrPullRequestNumber} not found in repository.`,
      );
      return undefined;
    }

    const projectItemId = await this.findProjectItemId(
      client,
      project,
      contentId,
    );
    if (!projectItemId) {
      const message = `Issue or pull request #${issueOrPullRequestNumber} is not in project ${project.id}.`;
      logError(message);
      throw new Error(message);
    }
    return projectItemId;
  };

  isContentLinked = async (
    project: ProjectDetail,
    contentId: string,
    token: string,
  ): Promise<boolean> => {
    const client = this.graphqlClient.getClient(token);
    return Boolean(await this.findProjectItemId(client, project, contentId));
  };
}
