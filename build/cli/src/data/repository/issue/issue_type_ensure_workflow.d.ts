import type { IssueTypes } from "../../model/issue_types";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
export interface IssueTypeEnsureResult {
    created: boolean;
    existed: boolean;
}
export interface IssueTypeEnsureSummary {
    created: number;
    existing: number;
    errors: string[];
}
export declare function ensureIssueType(client: GithubGraphqlTransportClient, owner: string, name: string, description: string, color: string): Promise<IssueTypeEnsureResult>;
export declare function ensureIssueTypes(client: GithubGraphqlTransportClient, owner: string, issueTypes: IssueTypes): Promise<IssueTypeEnsureSummary>;
