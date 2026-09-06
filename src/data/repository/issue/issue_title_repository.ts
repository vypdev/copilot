import type { IssueTitlePort } from '../../../application/ports/issue_title_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';
import { Labels } from '../../model/labels';
import { resolveIssueTitleEmoji, resolvePullRequestTitleEmoji } from '../issue_emoji_policy';
import { normalizePullRequestSourceTitle, sanitizeIssueTitle, sanitizePullRequestTitle } from '../issue_title_policy';
import { updateIssueTitle, withTitleUpdateLogging } from './issue_title_update';

export class IssueTitleRepository implements IssueTitlePort {
    constructor(
        private readonly issueTitleClient: GithubClientPort<GithubIssueTitleClient>,
        private readonly issueMetadataRepository: Pick<IssueTitlePort, 'getTitle'>,
    ) {}

    getTitle = (...args: Parameters<IssueTitlePort['getTitle']>) => this.issueMetadataRepository.getTitle(...args);

    updateTitleIssueFormat = async (
        owner: string, repository: string, version: string, issueTitle: string, issueNumber: number,
        branchManagementAlways: boolean, branchManagementEmoji: string, labels: Labels, token: string,
    ): Promise<string | undefined> => {
        return withTitleUpdateLogging(() => {
            const emoji = resolveIssueTitleEmoji(labels, branchManagementAlways, branchManagementEmoji);
            const sanitizedTitle = sanitizeIssueTitle(issueTitle);
            const formattedTitle = version.length > 0
                ? `${emoji} - ${version} - ${sanitizedTitle}`
                : `${emoji} - ${sanitizedTitle}`;
            return updateIssueTitle(this.issueTitleClient, owner, repository, issueTitle, formattedTitle, issueNumber, token);
        });
    };

    updateTitlePullRequestFormat = async (
        owner: string, repository: string, pullRequestTitle: string, issueTitle: string, issueNumber: number,
        pullRequestNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string,
        labels: Labels, token: string,
    ): Promise<string | undefined> => {
        return withTitleUpdateLogging(() => {
            const emoji = resolvePullRequestTitleEmoji(labels, branchManagementAlways, branchManagementEmoji);
            const formattedTitle = `[#${issueNumber}] ${emoji} - ${sanitizePullRequestTitle(normalizePullRequestSourceTitle(issueTitle, issueNumber))}`;
            return updateIssueTitle(this.issueTitleClient, owner, repository, pullRequestTitle, formattedTitle, pullRequestNumber, token);
        });
    };

    cleanTitle = async (
        owner: string, repository: string, issueTitle: string, issueNumber: number, token: string,
    ): Promise<string | undefined> => {
        return withTitleUpdateLogging(() => {
            const sanitizedTitle = sanitizePullRequestTitle(issueTitle);
            return updateIssueTitle(this.issueTitleClient, owner, repository, issueTitle, sanitizedTitle, issueNumber, token);
        });
    };

}
