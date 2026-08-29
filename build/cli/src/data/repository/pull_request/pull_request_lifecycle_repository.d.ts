import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestLifecycleClient } from "../../../infrastructure/github/ports/github_pull_request_provider_ports";
export declare class PullRequestLifecycleRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubPullRequestLifecycleClient>);
    /**
     * Returns the list of open pull request numbers whose head branch equals the given branch.
     * Used to sync size/progress labels from the issue to PRs when they are updated on push.
     */
    getOpenPullRequestNumbersByHeadBranch: (owner: string, repository: string, headBranch: string, token: string) => Promise<number[]>;
    /**
     * Returns the head branch of the first open PR that references the given issue number
     * (e.g. body contains "#123" or head ref contains "123" as in feature/123-...).
     * Used for issue_comment events where commit.branch is empty.
     * Uses bounded matching so #12 does not match #123 and branch "feature/1234-fix" does not match issue 123.
     */
    getHeadBranchForIssue: (owner: string, repository: string, issueNumber: number, token: string) => Promise<string | undefined>;
    private listOpenPullRequests;
    /** Default timeout (ms) for isLinked fetch. */
    private static readonly IS_LINKED_FETCH_TIMEOUT_MS;
    isLinked: (pullRequestUrl: string) => Promise<boolean>;
    updateBaseBranch: (owner: string, repository: string, pullRequestNumber: number, branch: string, token: string) => Promise<void>;
    updateDescription: (owner: string, repository: string, pullRequestNumber: number, description: string, token: string) => Promise<void>;
}
