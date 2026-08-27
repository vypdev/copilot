import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueAssignmentClient } from "../../../application/ports/github_issue_ports";
export declare class IssueAssignmentRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubIssueAssignmentClient>);
    getCurrentAssignees: (owner: string, repository: string, issueNumber: number, token: string) => Promise<string[]>;
    assignMembersToIssue: (owner: string, repository: string, issueNumber: number, members: string[], token: string) => Promise<string[]>;
}
