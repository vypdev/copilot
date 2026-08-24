import type { ProjectBoardCommandPort } from "../../../application/ports/project_board_command_ports";
import type { ProjectBoardContentQueryPort } from "../../../application/ports/project_board_query_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { ProjectDetail } from "../../model/project_detail";
export declare class ProjectBoardCommandRepository implements ProjectBoardCommandPort {
    private readonly projectBoardContentQueryPort;
    private readonly graphqlClient;
    private readonly priorityLabel;
    private readonly sizeLabel;
    private readonly statusLabel;
    constructor(projectBoardContentQueryPort: ProjectBoardContentQueryPort, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    private findFieldOption;
    private findProjectItem;
    private setSingleSelectFieldValue;
    setTaskPriority: (project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number, priorityLabel: string, token: string) => Promise<boolean>;
    setTaskSize: (project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number, sizeLabel: string, token: string) => Promise<boolean>;
    moveIssueToColumn: (project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number, columnName: string, token: string) => Promise<boolean>;
}
