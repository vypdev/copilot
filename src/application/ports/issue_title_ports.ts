import type { Labels } from '../../data/model/labels';

export interface IssueTitlePort {
    getTitle(owner: string, repository: string, issueNumber: number, token: string): Promise<string | undefined>;
    updateTitleIssueFormat(owner: string, repository: string, version: string, issueTitle: string, issueNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string, labels: Labels, token: string): Promise<string | undefined>;
    updateTitlePullRequestFormat(owner: string, repository: string, pullRequestTitle: string, issueTitle: string, issueNumber: number, pullRequestNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string, labels: Labels, token: string): Promise<string | undefined>;
}
