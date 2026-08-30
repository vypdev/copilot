import { logError, logDebugInfo } from "../../../utils/logger";
import type { Labels } from "../../model/labels";
import type { IssueTypes } from "../../model/issue_types";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import { assignIssueType } from "./issue_type_assignment_workflow";

type GetIssueId = (owner: string, repository: string, issueNumber: number, token: string) => Promise<string>;

export class IssueTypeAssignmentRepository {
  constructor(
    private readonly getIssueId: GetIssueId,
    private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
  ) {}

  setIssueType = async (
    owner: string,
    repository: string,
    issueNumber: number,
    labels: Labels,
    issueTypes: IssueTypes,
    token: string,
  ): Promise<void> => {
    try {
      await assignIssueType(
        this.getIssueId,
        this.graphqlClient.getClient(token),
        owner,
        repository,
        issueNumber,
        labels,
        issueTypes,
        token,
      );
    } catch (error) {
      logError(`Failed to update issue type: ${error}`);
      logDebugInfo("Continuing with issue processing despite issue type update failure");
      throw error;
    }
  };
}
