import type { Labels } from "../../model/labels";
import type { IssueTypes } from "../../model/issue_types";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
type GetIssueId = (owner: string, repository: string, issueNumber: number, token: string) => Promise<string>;
export declare function assignIssueType(getIssueId: GetIssueId, client: GithubGraphqlTransportClient, owner: string, repository: string, issueNumber: number, labels: Labels, issueTypes: IssueTypes, token: string): Promise<void>;
export declare class IssueTypeCreationSkippedError extends Error {
    constructor();
}
export {};
