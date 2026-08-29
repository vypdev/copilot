import type { IssueTitlePort } from '../../../application/ports/issue_title_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';
import { Labels } from '../../model/labels';
import { logDebugInfo, logError } from '../../../utils/logger';
import { resolveIssueTitleEmoji, resolvePullRequestTitleEmoji } from '../issue_emoji_policy';
import { sanitizeIssueTitle, sanitizePullRequestTitle } from '../issue_title_policy';

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
        return this.updateTitleWithLogging(() => {
            const emoji = resolveIssueTitleEmoji(labels, branchManagementAlways, branchManagementEmoji);
            const sanitizedTitle = sanitizeIssueTitle(issueTitle);
            const formattedTitle = version.length > 0
                ? `${emoji} - ${version} - ${sanitizedTitle}`
                : `${emoji} - ${sanitizedTitle}`;
            return this.updateTitle(owner, repository, issueTitle, formattedTitle, issueNumber, token);
        });
    };

    updateTitlePullRequestFormat = async (
        owner: string, repository: string, pullRequestTitle: string, issueTitle: string, issueNumber: number,
        pullRequestNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string,
        labels: Labels, token: string,
    ): Promise<string | undefined> => {
        return this.updateTitleWithLogging(() => {
            const emoji = resolvePullRequestTitleEmoji(labels, branchManagementAlways, branchManagementEmoji);
            const formattedTitle = `[#${issueNumber}] ${emoji} - ${sanitizePullRequestTitle(issueTitle)}`;
            return this.updateTitle(owner, repository, pullRequestTitle, formattedTitle, pullRequestNumber, token);
        });
    };

    cleanTitle = async (
        owner: string, repository: string, issueTitle: string, issueNumber: number, token: string,
    ): Promise<string | undefined> => {
        return this.updateTitleWithLogging(() => {
            const sanitizedTitle = sanitizePullRequestTitle(issueTitle);
            return this.updateTitle(owner, repository, issueTitle, sanitizedTitle, issueNumber, token);
        });
    };

    private async updateTitleWithLogging(
        update: () => Promise<string | undefined>,
    ): Promise<string | undefined> {
        try {
            return await update();
        } catch (error) {
            logError(`Failed to check or update issue title: ${error}`);
            throw error;
        }
    }

    private async updateTitle(
        owner: string,
        repository: string,
        currentTitle: string,
        nextTitle: string,
        issueNumber: number,
        token: string,
    ): Promise<string | undefined> {
        if (nextTitle === currentTitle) return undefined;
        await this.issueTitleClient.getClient(token).rest.issues.update({
            owner, repo: repository, issue_number: issueNumber, title: nextTitle,
        });
        logDebugInfo(`Issue title updated to: ${nextTitle}`);
        return nextTitle;
    }
}
