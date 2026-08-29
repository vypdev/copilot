import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueLabelsClient } from "../../../infrastructure/github/ports/github_issue_provider_ports";
export declare class IssueLabelRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubIssueLabelsClient>);
    getLabels: (owner: string, repository: string, issueNumber: number, token: string) => Promise<string[]>;
    setLabels: (owner: string, repository: string, issueNumber: number, labels: string[], token: string) => Promise<void>;
}
