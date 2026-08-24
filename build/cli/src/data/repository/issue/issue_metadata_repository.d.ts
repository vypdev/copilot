import { Milestone } from '../../model/milestone';
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { GithubIssueMetadataClient } from "../../../application/ports/github_issue_ports";
export declare class IssueMetadataRepository {
    private readonly metadataClient;
    private readonly graphqlClient;
    constructor(metadataClient: GithubClientPort<GithubIssueMetadataClient>, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    getId: (owner: string, repository: string, issueNumber: number, token: string) => Promise<string>;
    getMilestone: (owner: string, repository: string, issueNumber: number, token: string) => Promise<Milestone | undefined>;
    getTitle: (owner: string, repository: string, issueNumber: number, token: string) => Promise<string | undefined>;
    isPullRequest: (owner: string, repository: string, issueNumber: number, token: string) => Promise<boolean>;
    isIssue: (owner: string, repository: string, issueNumber: number, token: string) => Promise<boolean>;
    getHeadBranch: (owner: string, repository: string, issueNumber: number, token: string) => Promise<string | undefined>;
}
