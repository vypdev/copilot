import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { LinkedBranchCommandPort } from "../../../application/ports/branch_preparation_ports";
import { Result } from "../../model/result";
export declare class LinkedBranchRepository implements LinkedBranchCommandPort {
    private readonly graphqlClient;
    constructor(graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    createLinkedBranch: (owner: string, repo: string, baseBranchName: string, newBranchName: string, issueNumber: number, oid: string | undefined, token: string) => Promise<Result[]>;
}
