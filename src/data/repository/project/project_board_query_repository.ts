import type {
  ProjectBoardContentQueryPort,
  ProjectBoardQueryPort,
} from "../../../application/ports/project_board_query_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { GithubOwnerTypeClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
import { ProjectDetail } from "../../model/project_detail";
import { getProjectBoardDetail } from "./project_board_detail_query";
import { getProjectItemId, isProjectContentLinked } from "./project_board_item_query";

export class ProjectBoardQueryRepository
  implements ProjectBoardQueryPort, ProjectBoardContentQueryPort
{
  constructor(
    private readonly ownerTypeClient: GithubClientPort<GithubOwnerTypeClient>,
    private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
  ) {}

  getProjectDetail = (
    projectId: string,
    owner: string,
    token: string,
  ): Promise<ProjectDetail> =>
    getProjectBoardDetail(this.ownerTypeClient, this.graphqlClient, projectId, owner, token);

  getProjectItemId = async (
    project: ProjectDetail,
    owner: string,
    repo: string,
    issueOrPullRequestNumber: number,
    token: string,
  ): Promise<string | undefined> =>
    getProjectItemId(
      this.graphqlClient.getClient(token),
      project,
      owner,
      repo,
      issueOrPullRequestNumber,
    );

  isContentLinked = async (
    project: ProjectDetail,
    contentId: string,
    token: string,
  ): Promise<boolean> =>
    isProjectContentLinked(this.graphqlClient.getClient(token), project, contentId);
}
