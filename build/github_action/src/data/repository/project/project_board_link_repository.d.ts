import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import { ProjectDetail } from "../../model/project_detail";
import type { ProjectBoardLinkPort } from "../../../application/ports/project_board_link_ports";
import type { ProjectBoardQueryPort } from "../../../application/ports/project_board_query_ports";
export declare class ProjectBoardLinkRepository implements ProjectBoardLinkPort {
    private readonly projectBoardQueryPort;
    private readonly graphqlClient;
    constructor(projectBoardQueryPort: ProjectBoardQueryPort, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    linkContentId: (project: ProjectDetail, contentId: string, token: string) => Promise<boolean>;
}
