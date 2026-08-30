import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import type { GithubLinkedBranchContextResponse, GithubLinkedBranchMutationResponse } from '../../../infrastructure/github/ports/github_linked_branch_protocol';
type Graphql = GithubGraphqlTransportClient['graphql'];
export declare function loadLinkedBranchContext(graphql: Graphql, variables: {
    repo: string;
    owner: string;
    issueNumber: number;
    ref: string;
}): Promise<GithubLinkedBranchContextResponse>;
export declare function createLinkedBranchMutation(graphql: Graphql, variables: {
    issueId: string;
    name: string;
    repositoryId: string;
    oid: string;
}): Promise<GithubLinkedBranchMutationResponse>;
export {};
