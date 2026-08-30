import type { ProjectBoardContentQueryPort } from '../../../application/ports/project_board_query_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import type { ProjectDetail } from '../../model/project_detail';
/** Updates one ProjectV2 single-select field only when the desired value differs. */
export declare function setProjectBoardSingleSelectField(contentQueryPort: ProjectBoardContentQueryPort, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>, project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number, fieldName: string, fieldValue: string, token: string): Promise<boolean>;
