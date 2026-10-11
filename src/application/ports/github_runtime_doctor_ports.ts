import type { IssueWorkflowProfile, IssueWorkflowLabelConfiguration } from '../../domain/issue_workflow_profile';
import type { TrustedApprovalPolicyRead } from '../../domain/github_runtime_doctor';
import type { BoundBugbotContextReadPorts } from './bugbot_context_ports';

export const DOCTOR_REPOSITORY_PATHS = [
    '.github/workflows/copilot_issue.yml', '.github/workflows/copilot_issue_comment.yml',
    '.github/workflows/copilot_pull_request.yml', 'specs/catalog.json', 'specs/_template.md', 'specs/README.md',
] as const;
export type DoctorRepositoryPath = typeof DOCTOR_REPOSITORY_PATHS[number];
export type DoctorFile = { readonly state: 'present'; readonly text: string } | { readonly state: 'missing' };
export type DoctorRepositoryRead = { readonly state: 'available'; readonly repositoryId: number; readonly revision: string;
    readonly files: Readonly<Record<DoctorRepositoryPath, DoctorFile>> } | { readonly state: 'unavailable' };
export interface DoctorConfiguration {
    readonly profile: IssueWorkflowProfile;
    readonly labels?: IssueWorkflowLabelConfiguration;
    readonly preBranchSdd: boolean;
    readonly issueManagedBranches: boolean;
    readonly dependencyBranch: string;
}
export interface DoctorIssue {
    readonly number: number; readonly title: string; readonly body: string; readonly labels: readonly string[];
}
export type DoctorBranchRead = { readonly state: 'available'; readonly repositoryId: number; readonly name: string; readonly headSha: string }
    | { readonly state: 'absent' } | { readonly state: 'unavailable' };
/** Physically read-only composition: never bind a write repository or a model. */
export interface GithubRuntimeDoctorPorts {
    readonly serverOrigin: string;
    readRepository(repositoryId: number): Promise<DoctorRepositoryRead>;
    readIssue(issueNumber: number): Promise<DoctorIssue>;
    readLinkedBranch(issueNumber: number): Promise<DoctorBranchRead>;
    readApprovalPolicy(): Promise<TrustedApprovalPolicyRead>;
    readonly pullRequests: Pick<BoundBugbotContextReadPorts, 'getPullRequest' | 'getPullRequestHeadSha'>;
}
