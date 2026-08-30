import type { Labels } from "../../model/labels";
import type { IssueTypes } from "../../model/issue_types";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
type GetIssueId = (owner: string, repository: string, issueNumber: number, token: string) => Promise<string>;
export declare class IssueTypeAssignmentRepository {
    private readonly getIssueId;
    private readonly graphqlClient;
    constructor(getIssueId: GetIssueId, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    setIssueType: (owner: string, repository: string, issueNumber: number, labels: Labels, issueTypes: IssueTypes, token: string) => Promise<void>;
}
export {};
