import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueContentClient } from "../../../infrastructure/github/ports/github_issue_provider_ports";
export interface IssueComment {
    id: number;
    body: string | null;
    user?: {
        login?: string;
    };
}
export declare class IssueContentRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubIssueContentClient>);
    updateDescription: (owner: string, repo: string, issueNumber: number, description: string, token: string) => Promise<void>;
    getDescription: (owner: string, repo: string, issueNumber: number, token: string) => Promise<string | undefined>;
    getIssueDescription: (owner: string, repository: string, issueNumber: number, token: string) => Promise<string>;
    addComment: (owner: string, repository: string, issueNumber: number, comment: string, token: string, options?: {
        commitSha?: string;
    }) => Promise<void>;
    updateComment: (owner: string, repository: string, issueNumber: number, commentId: number, comment: string, token: string, options?: {
        commitSha?: string;
    }) => Promise<void>;
    listIssueComments: (owner: string, repository: string, issueNumber: number, token: string) => Promise<IssueComment[]>;
}
