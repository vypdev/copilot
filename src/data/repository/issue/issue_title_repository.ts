import * as core from '@actions/core';
import type { IssueTitlePort } from '../../../application/ports/issue_title_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../application/ports/github_issue_ports';
import { Labels } from '../../model/labels';
import { logDebugInfo } from '../../../utils/logger';
import { resolveIssueTitleEmoji, resolvePullRequestTitleEmoji } from '../issue_emoji_policy';
import { sanitizeIssueTitle, sanitizePullRequestTitle } from '../issue_title_policy';
import type { IssueMetadataRepository } from './issue_metadata_repository';

export class IssueTitleRepository implements IssueTitlePort {
    constructor(
        private readonly issueTitleClient: GithubClientPort<GithubIssueTitleClient>,
        private readonly issueMetadataRepository: IssueMetadataRepository,
    ) {}

    getTitle = (...args: Parameters<IssueMetadataRepository['getTitle']>) => this.issueMetadataRepository.getTitle(...args);

    updateTitleIssueFormat = async (
        owner: string, repository: string, version: string, issueTitle: string, issueNumber: number,
        branchManagementAlways: boolean, branchManagementEmoji: string, labels: Labels, token: string,
    ): Promise<string | undefined> => {
        try {
            const emoji = resolveIssueTitleEmoji(labels, branchManagementAlways, branchManagementEmoji);
            const sanitizedTitle = sanitizeIssueTitle(issueTitle);
            const formattedTitle = version.length > 0
                ? `${emoji} - ${version} - ${sanitizedTitle}`
                : `${emoji} - ${sanitizedTitle}`;
            if (formattedTitle === issueTitle) return undefined;
            await this.issueTitleClient.getClient(token).rest.issues.update({
                owner, repo: repository, issue_number: issueNumber, title: formattedTitle,
            });
            logDebugInfo(`Issue title updated to: ${formattedTitle}`);
            return formattedTitle;
        } catch (error) {
            core.setFailed(`Failed to check or update issue title: ${error}`);
            return undefined;
        }
    };

    updateTitlePullRequestFormat = async (
        owner: string, repository: string, pullRequestTitle: string, issueTitle: string, issueNumber: number,
        pullRequestNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string,
        labels: Labels, token: string,
    ): Promise<string | undefined> => {
        try {
            const emoji = resolvePullRequestTitleEmoji(labels, branchManagementAlways, branchManagementEmoji);
            const formattedTitle = `[#${issueNumber}] ${emoji} - ${sanitizePullRequestTitle(issueTitle)}`;
            if (formattedTitle === pullRequestTitle) return undefined;
            await this.issueTitleClient.getClient(token).rest.issues.update({
                owner, repo: repository, issue_number: pullRequestNumber, title: formattedTitle,
            });
            logDebugInfo(`Issue title updated to: ${formattedTitle}`);
            return formattedTitle;
        } catch (error) {
            core.setFailed(`Failed to check or update issue title: ${error}`);
            return undefined;
        }
    };

    cleanTitle = async (
        owner: string, repository: string, issueTitle: string, issueNumber: number, token: string,
    ): Promise<string | undefined> => {
        try {
            const sanitizedTitle = sanitizePullRequestTitle(issueTitle);
            if (sanitizedTitle === issueTitle) return undefined;
            await this.issueTitleClient.getClient(token).rest.issues.update({
                owner, repo: repository, issue_number: issueNumber, title: sanitizedTitle,
            });
            logDebugInfo(`Issue title updated to: ${sanitizedTitle}`);
            return sanitizedTitle;
        } catch (error) {
            core.setFailed(`Failed to check or update issue title: ${error}`);
            return undefined;
        }
    };
}
