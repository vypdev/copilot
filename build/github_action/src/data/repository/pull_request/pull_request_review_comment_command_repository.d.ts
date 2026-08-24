import type { PullRequestReviewCommentCommandPort, PullRequestReviewCommentDraft } from "../../../application/ports/pull_request_review_comment_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { GithubPullRequestReviewCommentCreateClient, GithubPullRequestReviewCommentQueryClient } from "../../../infrastructure/github/ports/github_pull_request_review_protocol";
export declare class PullRequestReviewCommentCommandRepository implements PullRequestReviewCommentCommandPort {
    private readonly createClient;
    private readonly graphqlClient;
    private readonly queryClient?;
    constructor(createClient: GithubClientPort<GithubPullRequestReviewCommentCreateClient>, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>, queryClient?: GithubClientPort<GithubPullRequestReviewCommentQueryClient> | undefined);
    private listExistingBodies;
    createReviewWithComments(owner: string, repository: string, pullRequestNumber: number, commitSha: string, comments: PullRequestReviewCommentDraft[], token: string): Promise<void>;
    updatePullRequestReviewComment(_owner: string, _repository: string, commentIdentity: string, body: string, token: string): Promise<void>;
}
