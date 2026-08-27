import type { PullRequestReviewComment, PullRequestReviewCommentQueryPort } from "../../../application/ports/pull_request_review_comment_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestReviewCommentQueryClient } from "../../../infrastructure/github/ports/github_pull_request_review_protocol";
export declare class PullRequestReviewCommentQueryRepository implements PullRequestReviewCommentQueryPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubPullRequestReviewCommentQueryClient>);
    listPullRequestReviewComments(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<PullRequestReviewComment[]>;
    getPullRequestReviewCommentBody(owner: string, repository: string, _pullRequestNumber: number, commentId: number, token: string): Promise<string | null>;
}
