import type { ProjectBoardContentQueryPort, ProjectBoardQueryPort } from "../../../application/ports/project_board_query_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { GithubOwnerTypeClient, GithubRepositoryContextClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
import { ProjectDetail } from "../../model/project_detail";
export declare class ProjectBoardQueryRepository implements ProjectBoardQueryPort, ProjectBoardContentQueryPort {
    private readonly repositoryContextClient;
    private readonly ownerTypeClient;
    private readonly graphqlClient;
    constructor(repositoryContextClient: GithubClientPort<GithubRepositoryContextClient>, ownerTypeClient: GithubClientPort<GithubOwnerTypeClient>, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    private findProjectItemId;
    getProjectDetail: (projectId: string, token: string) => Promise<ProjectDetail>;
    getProjectItemId: (project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number, token: string) => Promise<string | undefined>;
    isContentLinked: (project: ProjectDetail, contentId: string, token: string) => Promise<boolean>;
}
