import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import type { LinkedBranchCommandPort } from '../../../application/ports/branch_preparation_ports';
import { runCreateLinkedBranch } from './linked_branch_workflow';

export class LinkedBranchRepository implements LinkedBranchCommandPort {
    constructor(private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>) {}

    createLinkedBranch = (
        owner: string,
        repo: string,
        baseBranchName: string,
        newBranchName: string,
        issueNumber: number,
        oid: string | undefined,
        token: string,
    ) => runCreateLinkedBranch(
        this.graphqlClient,
        owner,
        repo,
        baseBranchName,
        newBranchName,
        issueNumber,
        oid,
        token,
    );
}
