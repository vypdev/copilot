import type { PullRequestReviewThreadCommandPort } from "../../../application/ports/pull_request_review_comment_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
/** GitHub GraphQL adapter for locating and resolving a pull-request review thread. */
export declare class PullRequestReviewThreadRepository implements PullRequestReviewThreadCommandPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubGraphqlTransportClient>);
    resolvePullRequestReviewThread: (owner: string, repository: string, pullNumber: number, commentIdentity: string, token: string) => Promise<void>;
    private findThread;
}
