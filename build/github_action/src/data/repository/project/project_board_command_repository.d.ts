import type { ProjectBoardCommandPort } from '../../../application/ports/project_board_command_ports';
import type { ProjectBoardContentQueryPort } from '../../../application/ports/project_board_query_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import type { ProjectDetail } from '../../model/project_detail';
/** GitHub GraphQL adapter for ProjectV2 field mutations. */
export declare class ProjectBoardCommandRepository implements ProjectBoardCommandPort {
    private readonly projectBoardContentQueryPort;
    private readonly graphqlClient;
    private readonly priorityField;
    private readonly sizeField;
    private readonly statusField;
    constructor(projectBoardContentQueryPort: ProjectBoardContentQueryPort, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    setTaskPriority: (project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number, priorityLabel: string, token: string) => Promise<boolean>;
    setTaskSize: (project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number, sizeLabel: string, token: string) => Promise<boolean>;
    moveIssueToColumn: (project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number, columnName: string, token: string) => Promise<boolean>;
    private setField;
}
