import { logDebugInfo, logError } from "../../../utils/logger";
import type { Labels } from "../../model/labels";
import type { IssueTypes } from "../../model/issue_types";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import { selectIssueType } from "./issue_type_assignment_policy";

type GetIssueId = (owner: string, repository: string, issueNumber: number, token: string) => Promise<string>;

export async function assignIssueType(
  getIssueId: GetIssueId,
  client: GithubGraphqlTransportClient,
  owner: string,
  repository: string,
  issueNumber: number,
  labels: Labels,
  issueTypes: IssueTypes,
  token: string,
): Promise<void> {
  const selected = selectIssueType(labels, issueTypes);
  logDebugInfo(`Setting issue type for issue ${issueNumber} to ${selected.name}`);
  const issueId = await getIssueId(owner, repository, issueNumber, token);
  const { organization } = await loadOrganizationIssueTypes(client, owner);
  let issueTypeId = organization.issueTypes.nodes.find(
    (type) => type.name.toLowerCase() === selected.name.toLowerCase(),
  )?.id;

  if (!issueTypeId) {
    try {
      issueTypeId = await createIssueType(client, organization.id, selected.name, selected.description, selected.color);
    } catch (error) {
      if (error instanceof IssueTypeCreationSkippedError) return;
      throw error;
    }
  }
  await client.graphql(
    `
                mutation ($issueId: ID!, $issueTypeId: ID!) {
                    updateIssueIssueType(input: { issueId: $issueId, issueTypeId: $issueTypeId }) {
                        issue { id issueType { id name } }
                    }
                }
            `,
    { issueId, issueTypeId },
  );
  logDebugInfo(`Successfully updated issue type to ${selected.name}`);
}

async function loadOrganizationIssueTypes(
  client: GithubGraphqlTransportClient,
  owner: string,
): Promise<{ organization: { id: string; issueTypes: { nodes: { id: string; name: string }[] } } }> {
  return client.graphql(`
                query ($owner: String!) {
                    organization(login: $owner) { id issueTypes(first: 20) { nodes { id name } } }
                }
            `, { owner });
}

async function createIssueType(
  client: GithubGraphqlTransportClient,
  ownerId: string,
  name: string,
  description: string,
  color: string,
): Promise<string> {
  try {
    const result = await client.graphql<{ createIssueType: { issueType: { id: string } } }>(`
                        mutation ($ownerId: ID!, $name: String!, $description: String!, $color: IssueTypeColor!, $isEnabled: Boolean!) {
                            createIssueType(input: { ownerId: $ownerId, name: $name, description: $description, color: $color, isEnabled: $isEnabled }) {
                                issueType { id }
                            }
                        }
                    `, {
      ownerId,
      name,
      description,
      color: color.toUpperCase(),
      isEnabled: true,
    });
    return result.createIssueType.issueType.id;
  } catch (error) {
    logError(`Failed to create issue type "${name}": ${error}`);
    logDebugInfo("Falling back to using labels for issue type classification");
    throw new IssueTypeCreationSkippedError();
  }
}

export class IssueTypeCreationSkippedError extends Error {
  constructor() {
    super("Issue type creation was skipped.");
    this.name = "IssueTypeCreationSkippedError";
  }
}
