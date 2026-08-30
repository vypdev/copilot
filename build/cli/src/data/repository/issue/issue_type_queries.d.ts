import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
export interface IssueType {
    id: string;
    name: string;
}
export declare function listIssueTypes(client: GithubGraphqlTransportClient, owner: string): Promise<IssueType[]>;
export declare function createIssueType(client: GithubGraphqlTransportClient, owner: string, name: string, description: string, color: string): Promise<string>;
