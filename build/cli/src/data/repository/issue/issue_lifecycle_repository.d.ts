import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueLifecycleClient } from "../../../infrastructure/github/ports/github_issue_provider_ports";
export declare class IssueLifecycleRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubIssueLifecycleClient>);
    closeIssue: (owner: string, repository: string, issueNumber: number, token: string) => Promise<boolean>;
    openIssue: (owner: string, repository: string, issueNumber: number, token: string) => Promise<boolean>;
    private transition;
}
