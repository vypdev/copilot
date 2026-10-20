import type { IssueTitlePort, TitleLabelFacts } from '../../../application/ports/issue_title_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';
import { resolveIssueTitleEmoji } from '../issue_emoji_policy';
import { generatedPullRequestTitle, hasConventionalPullRequestTitle } from '../../../application/policies/pull_request_title_policy';
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
        branchManagementEmoji: string, labels: TitleLabelFacts, token: string,
    ): Promise<string | undefined> => {
        return withTitleUpdateLogging(() => {
            const emoji = resolveIssueTitleEmoji(labels, branchManagementEmoji);
            const sanitizedTitle = sanitizeIssueTitle(issueTitle);
            const formattedTitle = version.length > 0
                ? `${emoji} - ${version} - ${sanitizedTitle}`
                : `${emoji} - ${sanitizedTitle}`;
            return updateIssueTitle(this.issueTitleClient, owner, repository, issueTitle, formattedTitle, issueNumber, token);
        });
    };

    updateTitlePullRequestFormat = async (
        owner: string, repository: string, pullRequestTitle: string, issueTitle: string, issueNumber: number,
        pullRequestNumber: number, _branchManagementEmoji: string,
        labels: TitleLabelFacts, token: string,
    ): Promise<string | undefined> => {
        return withTitleUpdateLogging(() => {
            if (hasConventionalPullRequestTitle(pullRequestTitle)) return Promise.resolve(undefined);
            const sourceTitle = normalizePullRequestSourceTitle(issueTitle, issueNumber);
            const formattedTitle = generatedPullRequestTitle(sourceTitle, sanitizePullRequestTitle(sourceTitle), issueNumber, labels);
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
