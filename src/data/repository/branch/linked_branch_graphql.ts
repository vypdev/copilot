import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import type { GithubLinkedBranchContextResponse, GithubLinkedBranchMutationResponse } from '../../../infrastructure/github/ports/github_linked_branch_protocol';

type Graphql = GithubGraphqlTransportClient['graphql'];

export function loadLinkedBranchContext(
    graphql: Graphql,
    variables: { repo: string; owner: string; issueNumber: number; ref: string },
): Promise<GithubLinkedBranchContextResponse> {
    return graphql<GithubLinkedBranchContextResponse>(`
      query ($repo: String!, $owner: String!, $issueNumber: Int!, $ref: String!) {
        repository(name: $repo, owner: $owner) {
          id
          issue(number: $issueNumber) { id }
          ref(qualifiedName: $ref) {
            target { ... on Commit { oid } }
          }
        }
      }
    `, variables);
}

export function createLinkedBranchMutation(
    graphql: Graphql,
    variables: { issueId: string; name: string; repositoryId: string; oid: string },
): Promise<GithubLinkedBranchMutationResponse> {
    return graphql<GithubLinkedBranchMutationResponse>(`
      mutation ($issueId: ID!, $name: String!, $repositoryId: ID!, $oid: GitObjectID!) {
        createLinkedBranch(input: {
          issueId: $issueId
          name: $name
          repositoryId: $repositoryId
          oid: $oid
        }) {
          linkedBranch { id ref { name } }
        }
      }
    `, variables);
}
