import type { GithubPullRequestChangesClient, GithubPullRequestLifecycleClient } from "../../application/ports/github_pull_request_ports";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubPullRequestReviewCommentClient, GithubPullRequestReviewerClient } from "./ports/github_pull_request_review_protocol";
export declare class OctokitPullRequestChangesClientAdapter implements GithubClientPort<GithubPullRequestChangesClient> {
    getClient(token: string): GithubPullRequestChangesClient;
}
export declare class OctokitPullRequestLifecycleClientAdapter implements GithubClientPort<GithubPullRequestLifecycleClient> {
    getClient(token: string): GithubPullRequestLifecycleClient;
}
export declare class OctokitPullRequestReviewerClientAdapter implements GithubClientPort<GithubPullRequestReviewerClient> {
    getClient(token: string): GithubPullRequestReviewerClient;
}
export declare class OctokitPullRequestReviewCommentClientAdapter implements GithubClientPort<GithubPullRequestReviewCommentClient> {
    getClient(token: string): GithubPullRequestReviewCommentClient;
}
