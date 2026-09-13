import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { GithubOwnerTypeClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
import { logDebugInfo, logError } from "../../../utils/logger";
import { ProjectDetail } from "../../model/project_detail";
import { ApplicationError, toApplicationError } from '../../../application/errors/application_error';

interface ProjectNode {
  id: string;
  title: string;
  url: string;
}

/** Reads a ProjectV2 without leaking GitHub's owner-specific GraphQL shape. */
export async function getProjectBoardDetail(
  ownerTypeClient: GithubClientPort<GithubOwnerTypeClient>,
  graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
  projectId: string,
  owner: string,
  token: string,
): Promise<ProjectDetail> {
  try {
    validateProjectId(projectId);
    const projectNumber = Number(projectId);
    const ownerName = owner.trim();
    if (!ownerName) throw new Error("Repository owner is required to load project details.");

    const ownerTypeProvider = ownerTypeClient.getClient(token);
    const graphql = graphqlClient.getClient(token);
    const { data: ownerData } = await ownerTypeProvider.rest.users
      .getByUsername({ username: ownerName })
      .catch((error: unknown) => {
        throw toApplicationError(error, 'provider.unavailable', 'Unable to read the GitHub owner type.');
      });
    if (ownerData.type !== "Organization" && ownerData.type !== "User") {
      throw new ApplicationError(
        'provider.contract-invalid',
        `Unsupported GitHub owner type '${String(ownerData.type)}' for owner ${ownerName}.`,
      );
    }

    const ownerPath = ownerData.type === "Organization" ? "orgs" : "users";
    const ownerQueryField = ownerPath === "orgs" ? "organization" : "user";
    const projectUrl = `https://github.com/${ownerPath}/${ownerName}/projects/${projectId}`;
    const projectQuery = `
                query($ownerName: String!, $projectNumber: Int!) {
                    ${ownerQueryField}(login: $ownerName) {
                        projectV2(number: $projectNumber) { id title url }
                    }
                }
            `;
    const result = await graphql
      .graphql<Record<string, { projectV2?: ProjectNode | null } | undefined>>(
        projectQuery,
        { ownerName, projectNumber },
      )
      .catch((error: unknown) => {
        throw toApplicationError(error, 'provider.unavailable', 'Unable to read the GitHub project.');
      });
    const project = result[ownerQueryField]?.projectV2;
    if (!project) throw new ApplicationError('provider.not-found', `Project not found: ${projectUrl}`);

    logDebugInfo(`Project ID: ${project.id}`);
    logDebugInfo(`Project Title: ${project.title}`);
    logDebugInfo(`Project URL: ${project.url}`);
    return new ProjectDetail({
      id: project.id,
      title: project.title,
      url: project.url,
      type: ownerQueryField,
      owner: ownerName,
      number: projectNumber,
    });
  } catch (error: unknown) {
    const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to load the project details.');
    logError(semanticError);
    throw semanticError;
  }
}

function validateProjectId(projectId: string): void {
  if (!/^[1-9]\d*$/.test(projectId)) {
    throw new ApplicationError(
      'validation.invalid-input',
      `Invalid project ID: ${projectId}. Must be a positive integer.`,
    );
  }
}
