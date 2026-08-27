import type { PullRequestReviewerPort } from "../../../application/ports/pull_request_reviewer_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestReviewerClient } from "../../../infrastructure/github/ports/github_pull_request_review_protocol";
export declare class PullRequestReviewerRepository implements PullRequestReviewerPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubPullRequestReviewerClient>);
    getCurrentReviewers(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<string[]>;
    addReviewersToPullRequest(owner: string, repository: string, pullRequestNumber: number, reviewers: string[], token: string): Promise<string[]>;
    private listRequestedReviewers;
    private listCompletedReviewers;
}
