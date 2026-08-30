import type { IssueTypes } from "../../model/issue_types";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import { type IssueType } from "./issue_type_queries";
import { type IssueTypeEnsureResult, type IssueTypeEnsureSummary } from "./issue_type_ensure_workflow";
export type { IssueType } from "./issue_type_queries";
export type { IssueTypeEnsureResult, IssueTypeEnsureSummary } from "./issue_type_ensure_workflow";
export declare class IssueTypeRepository {
    private readonly graphqlClient;
    constructor(graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    listIssueTypes: (owner: string, token: string) => Promise<IssueType[]>;
    createIssueType: (owner: string, name: string, description: string, color: string, token: string) => Promise<string>;
    ensureIssueType: (owner: string, name: string, description: string, color: string, token: string) => Promise<IssueTypeEnsureResult>;
    ensureIssueTypes: (owner: string, issueTypes: IssueTypes, token: string) => Promise<IssueTypeEnsureSummary>;
}
