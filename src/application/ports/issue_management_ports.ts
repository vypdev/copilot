import type { Labels } from '../../data/model/labels';
import type { IssueTypes } from '../../data/model/issue_types';
import type { CopilotLifecycleLabels } from '../../domain/copilot_lifecycle';

export interface IssueAssigneePort {
    getCurrentAssignees(owner: string, repository: string, issueNumber: number, token: string): Promise<string[]>;
    assignMembersToIssue(owner: string, repository: string, issueNumber: number, members: string[], token: string): Promise<string[]>;
}

/** Repository-credential-bound issue assignment authority. */
export interface BoundIssueAssigneePort {
    getCurrentAssignees(issueNumber: number): Promise<readonly string[]>;
    assignMembersToIssue(issueNumber: number, members: readonly string[]): Promise<readonly string[]>;
}

export interface IssueLabelsPort {
    getLabels(owner: string, repository: string, issueNumber: number, token: string): Promise<string[]>;
    setLabels(owner: string, repository: string, issueNumber: number, labels: string[], token: string): Promise<void>;
}

/** Repository-credential-bound label query and replacement authority. */
export interface BoundIssueLabelsPort {
    getLabels(issueNumber: number): Promise<readonly string[]>;
    setLabels(issueNumber: number, labels: readonly string[]): Promise<void>;
}

export interface PullRequestHeadShaPort {
    getPullRequestHeadSha(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<string | undefined>;
}

/** Repository-credential-bound pull-request head query authority. */
export interface BoundPullRequestHeadShaPort {
    getPullRequestHeadSha(pullRequestNumber: number): Promise<string | undefined>;
}

export interface IssueProgressPort {
    setProgressLabel(owner: string, repository: string, issueNumber: number, progress: number, token: string): Promise<void>;
}

export interface BoundIssueProgressPort {
    setProgressLabel(issueNumber: number, progress: number): Promise<void>;
}

export interface LabelProvisioningSummary {
    created: number;
    existing: number;
    errors: string[];
}

export interface InitialLabelProvisioningPort {
    ensureInitialLabels(
        owner: string,
        repository: string,
        labels: InitialLabelConfiguration,
        token: string,
    ): Promise<{
        configured: LabelProvisioningSummary;
        progress: LabelProvisioningSummary;
    }>;
}

export interface IssueTypeProvisioningPort {
    ensureIssueTypes(owner: string, issueTypes: InitialIssueTypeConfiguration, token: string): Promise<{ created: number; existing: number; errors: string[] }>;
}

export interface BoundInitialLabelProvisioningPort {
    ensureInitialLabels(labels: InitialLabelConfiguration): Promise<{
        configured: LabelProvisioningSummary;
        progress: LabelProvisioningSummary;
    }>;
}

export interface BoundIssueTypeProvisioningPort {
    ensureIssueTypes(issueTypes: InitialIssueTypeConfiguration): Promise<{ created: number; existing: number; errors: string[] }>;
}

export type InitialLabelConfiguration = Readonly<Pick<Labels,
    | 'bug' | 'bugfix' | 'hotfix' | 'enhancement' | 'feature' | 'release'
    | 'question' | 'help' | 'deploy' | 'deployed' | 'docs' | 'documentation'
    | 'chore' | 'maintenance' | 'priorityHigh' | 'priorityMedium' | 'priorityLow'
    | 'priorityNone' | 'sizeXxl' | 'sizeXl' | 'sizeL' | 'sizeM' | 'sizeS' | 'sizeXs'
>> & { readonly lifecycle: Readonly<CopilotLifecycleLabels> };

export type InitialIssueTypeConfiguration = Readonly<IssueTypes>;

export interface SelectedIssueType {
    readonly name: string;
    readonly description: string;
    readonly color: string;
}

export interface IssueTypeAssignmentPort {
    setIssueType(owner: string, repository: string, issueNumber: number, issueType: SelectedIssueType, token: string): Promise<void>;
}

/** Repository-credential-bound issue-type mutation authority. */
export interface BoundIssueTypeAssignmentPort {
    setIssueType(issueNumber: number, issueType: SelectedIssueType): Promise<void>;
}
