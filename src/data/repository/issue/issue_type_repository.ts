import type { IssueTypes } from "../../model/issue_types";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import {
  createIssueType,
  listIssueTypes,
  type IssueType,
} from "./issue_type_queries";
import {
  ensureIssueType,
  ensureIssueTypes,
  type IssueTypeEnsureResult,
  type IssueTypeEnsureSummary,
} from "./issue_type_ensure_workflow";

export type { IssueType } from "./issue_type_queries";
export type { IssueTypeEnsureResult, IssueTypeEnsureSummary } from "./issue_type_ensure_workflow";

export class IssueTypeRepository {
  constructor(private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>) {}

  listIssueTypes = async (owner: string, token: string): Promise<IssueType[]> =>
    listIssueTypes(this.graphqlClient.getClient(token), owner);

  createIssueType = async (
    owner: string,
    name: string,
    description: string,
    color: string,
    token: string,
  ): Promise<string> =>
    createIssueType(this.graphqlClient.getClient(token), owner, name, description, color);

  ensureIssueType = async (
    owner: string,
    name: string,
    description: string,
    color: string,
    token: string,
  ): Promise<IssueTypeEnsureResult> =>
    ensureIssueType(this.graphqlClient.getClient(token), owner, name, description, color);

  ensureIssueTypes = async (
    owner: string,
    issueTypes: IssueTypes,
    token: string,
  ): Promise<IssueTypeEnsureSummary> =>
    ensureIssueTypes(this.graphqlClient.getClient(token), owner, issueTypes);
}
