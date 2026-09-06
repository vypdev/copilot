import type { PullRequestReviewThreadCommandPort, PullRequestReviewThreadStateQueryPort } from '../../../application/ports/pull_request_review_comment_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
/** GitHub GraphQL adapter for locating and resolving a pull-request review thread. */
export declare class PullRequestReviewThreadRepository implements PullRequestReviewThreadCommandPort, PullRequestReviewThreadStateQueryPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubGraphqlTransportClient>);
    listPullRequestReviewThreadStates: (owner: string, repository: string, pullNumber: number, token: string) => Promise<Record<string, boolean>>;
    resolvePullRequestReviewThread: (owner: string, repository: string, pullNumber: number, commentIdentity: string, token: string) => Promise<void>;
    unresolvePullRequestReviewThread: (owner: string, repository: string, pullNumber: number, commentIdentity: string, token: string) => Promise<void>;
}
