import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type {
  GithubLinkedBranchContextResponse,
  GithubLinkedBranchMutationResponse,
} from "../../../infrastructure/github/ports/github_linked_branch_protocol";
import type { LinkedBranchCommandPort } from "../../../application/ports/branch_preparation_ports";
import { Result } from "../../model/result";
import { logDebugInfo, logError } from "../../../utils/logger";

export class LinkedBranchRepository implements LinkedBranchCommandPort {
  constructor(
    private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
  ) {}

  createLinkedBranch = async (
    owner: string,
    repo: string,
    baseBranchName: string,
    newBranchName: string,
    issueNumber: number,
    oid: string | undefined,
    token: string,
  ): Promise<Result[]> => {
    const result: Result[] = [];
    try {
      logDebugInfo(
        `Creating linked branch ${newBranchName} from ${oid ?? baseBranchName}`,
      );

      const qualifiedRef = baseBranchName.startsWith("tags/")
        ? `refs/${baseBranchName}`
        : `refs/heads/${baseBranchName}`;
      const graphql = this.graphqlClient.getClient(token).graphql;

      const { repository } = await graphql<GithubLinkedBranchContextResponse>(
        `
          query (
            $repo: String!
            $owner: String!
            $issueNumber: Int!
            $ref: String!
          ) {
            repository(name: $repo, owner: $owner) {
              id
              issue(number: $issueNumber) {
                id
              }
              ref(qualifiedName: $ref) {
                target {
                  ... on Commit {
                    oid
                  }
                }
              }
            }
          }
        `,
        {
          repo: repo,
          owner: owner,
          issueNumber: issueNumber,
          ref: qualifiedRef,
        },
      );

      logDebugInfo(
        `Repository information retrieved: ${JSON.stringify(repository?.ref)}`,
      );

      const repositoryId: string | undefined = repository?.id ?? undefined;
      const issueId: string | undefined = repository?.issue?.id ?? undefined;
      const branchOid: string | undefined =
        oid ?? repository?.ref?.target?.oid ?? undefined;

      if (
        repositoryId === undefined ||
        issueId === undefined ||
        branchOid === undefined
      ) {
        logError(
          `Error searching repository "${baseBranchName}": id: ${repositoryId}, issue: ${issueId}, oid: ${branchOid}), issue #${issueNumber}`,
        );
        result.push(
          new Result({
            id: "branch_repository",
            success: false,
            executed: true,
            steps: [
              `Error linking branch ${newBranchName} to issue: Repository not found.`,
            ],
          }),
        );
        return result;
      }

      logDebugInfo(
        `Linking branch "${newBranchName}" (oid: ${branchOid}) to issue #${issueNumber}`,
      );

      const mutationResponse =
        await graphql<GithubLinkedBranchMutationResponse>(
          `
            mutation (
              $issueId: ID!
              $name: String!
              $repositoryId: ID!
              $oid: GitObjectID!
            ) {
              createLinkedBranch(
                input: {
                  issueId: $issueId
                  name: $name
                  repositoryId: $repositoryId
                  oid: $oid
                }
              ) {
                linkedBranch {
                  id
                  ref {
                    name
                  }
                }
              }
            }
          `,
          {
            issueId: issueId,
            name: `/${newBranchName}`,
            repositoryId: repositoryId,
            oid: branchOid,
          },
        );

      logDebugInfo(
        `Linked branch: ${JSON.stringify(mutationResponse.createLinkedBranch?.linkedBranch)}`,
      );

      if (mutationResponse.createLinkedBranch?.linkedBranch == null) {
        result.push(
          new Result({
            id: "branch_repository",
            success: false,
            executed: true,
            steps: [
              `Linked branch creation returned no linked branch for ${newBranchName}.`,
            ],
          }),
        );
        return result;
      }

      const createdRefName =
        mutationResponse.createLinkedBranch.linkedBranch.ref?.name;
      const normalizedCreatedRefName = createdRefName
        ?.replace(/^refs\/heads\//, "")
        .replace(/^\/+/, "");
      if (normalizedCreatedRefName !== newBranchName) {
        result.push(
          new Result({
            id: "branch_repository",
            success: false,
            executed: true,
            steps: [
              `Linked branch creation returned an unexpected branch ref for ${newBranchName}.`,
            ],
          }),
        );
        return result;
      }

      const baseBranchUrl = `https://github.com/${owner}/${repo}/tree/${baseBranchName}`;
      const newBranchUrl = `https://github.com/${owner}/${repo}/tree/${newBranchName}`;
      result.push(
        new Result({
          id: "branch_repository",
          success: true,
          executed: true,
          payload: {
            baseBranchName: baseBranchName,
            baseBranchUrl: baseBranchUrl,
            newBranchName: newBranchName,
            newBranchUrl: newBranchUrl,
          },
        }),
      );
    } catch (error) {
      logError(`Error Linking branch "${error}"`);
      result.push(
        new Result({
          id: "branch_repository",
          success: false,
          executed: true,
          steps: [
            `Tried to link branch to the issue, but there was a problem.`,
          ],
          errors: [error instanceof Error ? error : new Error(String(error))],
        }),
      );
    }
    return result;
  };
}
