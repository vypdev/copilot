import { logError } from "../../../utils/logger";
import type { IssueTypes } from "../../model/issue_types";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import { configuredIssueTypes, type ConfiguredIssueType } from "./issue_type_configuration";
import { createIssueType, listIssueTypes } from "./issue_type_queries";

export interface IssueTypeEnsureResult {
  created: boolean;
  existed: boolean;
}

export interface IssueTypeEnsureSummary {
  created: number;
  existing: number;
  errors: string[];
}

export async function ensureIssueType(
  client: GithubGraphqlTransportClient,
  owner: string,
  name: string,
  description: string,
  color: string,
): Promise<IssueTypeEnsureResult> {
  try {
    const existingTypes = await listIssueTypes(client, owner);
    if (existingTypes.some((type) => type.name.toLowerCase() === name.toLowerCase())) {
      return { created: false, existed: true };
    }
    await createIssueType(client, owner, name, description, color);
    return { created: true, existed: false };
  } catch (error) {
    logError(`Error ensuring issue type "${name}": ${error}`);
    throw error;
  }
}

export async function ensureIssueTypes(
  client: GithubGraphqlTransportClient,
  owner: string,
  issueTypes: IssueTypes,
): Promise<IssueTypeEnsureSummary> {
  let created = 0;
  let existing = 0;
  const errors: string[] = [];
  for (const configured of configuredIssueTypes(issueTypes)) {
    try {
      const result = await ensureConfiguredIssueType(client, owner, configured);
      if (result.created) created += 1;
      else existing += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`Error ensuring issue type "${configured.name}": ${error}`);
      errors.push(`Error creando tipo de Issue "${configured.name}": ${message}`);
    }
  }
  return { created, existing, errors };
}

function ensureConfiguredIssueType(
  client: GithubGraphqlTransportClient,
  owner: string,
  configured: ConfiguredIssueType,
): Promise<IssueTypeEnsureResult> {
  return ensureIssueType(client, owner, configured.name, configured.description, configured.color);
}
