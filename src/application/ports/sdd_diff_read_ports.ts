import type { PublicationTarget } from '../../domain/github_publication';
import type { IssueWorkflowLabelConfiguration, IssueWorkflowProfile } from '../../domain/issue_workflow_profile';
import type { SddEvidenceQueryPort, SddEvidenceReadPorts } from './sdd_evidence_read_ports';
import type { PreBranchSddWorkspacePort } from './pre_branch_sdd_ports';
import type { SddDiffSnapshot } from '../policies/sdd_diff_presentation_policy';

/** Exact native PR association, physically independent from mutation and model capabilities. */
export type SddDiffPullRequestLinks =
  | { readonly state: 'unavailable' }
  | { readonly state: 'verified'; readonly pullNumber: number; readonly headSha: string; readonly headBranch: string; readonly issueNumbers: readonly number[]; readonly issueAuthors: Readonly<Record<number, string>> };

export interface SddDiffPullRequestLinkPort {
  readClosingIssues(pullNumber: number): Promise<SddDiffPullRequestLinks>;
}


export interface SddDiffRequest {
  readonly target: PublicationTarget;
  readonly issueAuthor?: string;
  readonly repositoryId: number;
  readonly profile: IssueWorkflowProfile;
  readonly labelConfiguration: IssueWorkflowLabelConfiguration;
  readonly profileDigest?: string;
  readonly trustedBotLogin: string;
  readonly issueManagedBranches: boolean;
  readonly preBranchSdd: boolean;
  readonly baseBranch?: string;
}

/** Only metadata, immutable documents, exact links and the shared authority query. */
export interface SddDiffReadPorts {
  readonly evidence: SddEvidenceQueryPort;
  readonly links: SddDiffPullRequestLinkPort;
  readonly labels: SddEvidenceReadPorts['labels'];
  readonly descriptions: SddEvidenceReadPorts['descriptions'];
  readonly documents: Pick<PreBranchSddWorkspacePort, 'readSdd'>;
}

export interface SddDiffQueryPort {
  readonly serverOrigin: string;
  read(request: SddDiffRequest): Promise<SddDiffSnapshot>;
}
