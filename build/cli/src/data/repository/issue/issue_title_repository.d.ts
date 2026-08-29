import type { IssueTitlePort } from '../../../application/ports/issue_title_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';
import { Labels } from '../../model/labels';
export declare class IssueTitleRepository implements IssueTitlePort {
    private readonly issueTitleClient;
    private readonly issueMetadataRepository;
    constructor(issueTitleClient: GithubClientPort<GithubIssueTitleClient>, issueMetadataRepository: Pick<IssueTitlePort, 'getTitle'>);
    getTitle: (...args: Parameters<IssueTitlePort["getTitle"]>) => Promise<string | undefined>;
    updateTitleIssueFormat: (owner: string, repository: string, version: string, issueTitle: string, issueNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string, labels: Labels, token: string) => Promise<string | undefined>;
    updateTitlePullRequestFormat: (owner: string, repository: string, pullRequestTitle: string, issueTitle: string, issueNumber: number, pullRequestNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string, labels: Labels, token: string) => Promise<string | undefined>;
    cleanTitle: (owner: string, repository: string, issueTitle: string, issueNumber: number, token: string) => Promise<string | undefined>;
    private updateTitle;
}
