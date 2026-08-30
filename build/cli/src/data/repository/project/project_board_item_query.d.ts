import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import { ProjectDetail } from "../../model/project_detail";
export declare function getProjectItemId(graphqlClient: GithubGraphqlTransportClient, project: ProjectDetail, owner: string, repo: string, issueOrPullRequestNumber: number): Promise<string | undefined>;
export declare function isProjectContentLinked(graphqlClient: GithubGraphqlTransportClient, project: ProjectDetail, contentId: string): Promise<boolean>;
