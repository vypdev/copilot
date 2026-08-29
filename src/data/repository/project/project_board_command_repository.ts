import type { ProjectBoardCommandPort } from '../../../application/ports/project_board_command_ports';
import type { ProjectBoardContentQueryPort } from '../../../application/ports/project_board_query_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import type { ProjectDetail } from '../../model/project_detail';
import { setProjectBoardSingleSelectField } from './project_board_field_update';

/** GitHub GraphQL adapter for ProjectV2 field mutations. */
export class ProjectBoardCommandRepository implements ProjectBoardCommandPort {
    private readonly priorityField = 'Priority';
    private readonly sizeField = 'Size';
    private readonly statusField = 'Status';

    constructor(
        private readonly projectBoardContentQueryPort: ProjectBoardContentQueryPort,
        private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
    ) {}

    setTaskPriority = (
        project: ProjectDetail,
        owner: string,
        repo: string,
        issueOrPullRequestNumber: number,
        priorityLabel: string,
        token: string,
    ): Promise<boolean> => this.setField(
        project,
        owner,
        repo,
        issueOrPullRequestNumber,
        this.priorityField,
        priorityLabel,
        token,
    );

    setTaskSize = (
        project: ProjectDetail,
        owner: string,
        repo: string,
        issueOrPullRequestNumber: number,
        sizeLabel: string,
        token: string,
    ): Promise<boolean> => this.setField(
        project,
        owner,
        repo,
        issueOrPullRequestNumber,
        this.sizeField,
        sizeLabel,
        token,
    );

    moveIssueToColumn = (
        project: ProjectDetail,
        owner: string,
        repo: string,
        issueOrPullRequestNumber: number,
        columnName: string,
        token: string,
    ): Promise<boolean> => this.setField(
        project,
        owner,
        repo,
        issueOrPullRequestNumber,
        this.statusField,
        columnName,
        token,
    );

    private setField(
        project: ProjectDetail,
        owner: string,
        repo: string,
        issueOrPullRequestNumber: number,
        fieldName: string,
        fieldValue: string,
        token: string,
    ): Promise<boolean> {
        return setProjectBoardSingleSelectField(
            this.projectBoardContentQueryPort,
            this.graphqlClient,
            project,
            owner,
            repo,
            issueOrPullRequestNumber,
            fieldName,
            fieldValue,
            token,
        );
    }
}
