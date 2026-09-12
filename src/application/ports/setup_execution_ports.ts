import type { Config } from '../../data/model/config';

export interface SetupIssueQueryPort {
    isPullRequest(issueNumber: number): Promise<boolean>;
    isIssue(issueNumber: number): Promise<boolean>;
    getHeadBranch(issueNumber: number): Promise<string | undefined>;
    getLabels(issueNumber: number): Promise<string[]>;
    getDescription(issueNumber: number): Promise<string | undefined>;
}

export interface SetupOrganizationQueryPort {
    getTokenUser(): Promise<string | undefined>;
}

export interface SetupConfigurationQueryPort {
    get(issueNumber: number): Promise<Config | undefined>;
}
