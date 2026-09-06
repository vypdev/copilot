import type { IssueInactivityQueryPort } from '../../../application/ports/issue_inactivity_ports';
import type { IssueActivitySnapshot } from '../../../domain/issue_inactivity';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueInactivityClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';
/** Reads the provider's issue activity timestamp and waiting-state labels. */
export declare class IssueInactivityRepository implements IssueInactivityQueryPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubIssueInactivityClient>);
    listOpenIssuesByLabel: (owner: string, repository: string, label: string, token: string) => Promise<readonly IssueActivitySnapshot[]>;
    getOpenIssue: (owner: string, repository: string, issueNumber: number, token: string) => Promise<IssueActivitySnapshot | undefined>;
}
