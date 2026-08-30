import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';
export declare function updateIssueTitle(client: GithubClientPort<GithubIssueTitleClient>, owner: string, repository: string, currentTitle: string, nextTitle: string, issueNumber: number, token: string): Promise<string | undefined>;
export declare function withTitleUpdateLogging(update: () => Promise<string | undefined>): Promise<string | undefined>;
