import type { ManagedPullRequestPhase } from "../../domain/deployment_operation";
import type { TargetMergeCapabilities } from "../policies/deployment_plan_policy";
import type { DeploymentOperationSnapshot, DeploymentPublicationReceipt } from "../../domain/deployment_operation";
import type {
  DeploymentStateLoadOutcome,
  DeploymentStateSaveOutcome,
  ExpectedDeploymentState,
} from "../../domain/deployment_state_fence";
import type { DeploymentConfigurationValues } from "../../domain/deployment_configuration";
import type { CopilotLifecycleLabels } from "../../domain/copilot_lifecycle";
import type { AgentConfiguration } from '../../domain/agent';
import type { LocaleProfile } from '../../domain/locale';

export interface ManagedPullRequestRecord {
  readonly number: number;
  readonly nodeId: string;
  readonly body: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly baseBranch: string;
  readonly state: "open" | "closed";
  readonly merged: boolean;
  readonly autoMergeEnabled: boolean;
  readonly mergeCommitSha?: string;
  readonly repositoryFullName: string;
}

export interface ManagedPullRequestQuery {
  readonly owner: string;
  readonly repository: string;
  readonly operationId: string;
  readonly phase: ManagedPullRequestPhase;
  readonly issue: number;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly token: string;
}

export interface ManagedPullRequestCreate extends ManagedPullRequestQuery {
  readonly title: string;
  readonly body: string;
}

export type BoundManagedPullRequestQuery = Omit<ManagedPullRequestQuery, "owner" | "repository" | "token">;
export type BoundManagedPullRequestCreate = Omit<ManagedPullRequestCreate, "owner" | "repository" | "token">;

export interface TargetMergeInspectionOptions {
  readonly pullRequest?: number;
  readonly candidateHeadSha?: string;
}

export interface TargetMergePolicyInspectionPort {
  getTargetCapabilities(
    owner: string,
    repository: string,
    targetBranch: string,
    token: string,
    options?: TargetMergeInspectionOptions,
  ): Promise<TargetMergeCapabilities>;
}

export interface BoundTargetMergePolicyInspectionPort {
  getTargetCapabilities(
    targetBranch: string,
    options?: TargetMergeInspectionOptions,
  ): Promise<TargetMergeCapabilities>;
}

export interface ManagedPullRequestPort {
  findManagedPullRequests(query: ManagedPullRequestQuery): Promise<readonly ManagedPullRequestRecord[]>;
  createManagedPullRequest(command: ManagedPullRequestCreate): Promise<ManagedPullRequestRecord>;
  getPullRequest(owner: string, repository: string, pullRequest: number, token: string): Promise<ManagedPullRequestRecord>;
  enableAutoMerge(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<void>;
  isPullRequestQueued(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<boolean>;
  enqueuePullRequest(
    owner: string,
    repository: string,
    pullRequestNodeId: string,
    expectedHeadSha: string,
    token: string,
  ): Promise<void>;
  mergePullRequest(owner: string, repository: string, pullRequest: number, token: string): Promise<string>;
}

/** Repository-credential-bound managed pull-request authority. */
export interface BoundManagedPullRequestPort {
  findManagedPullRequests(query: BoundManagedPullRequestQuery): Promise<readonly ManagedPullRequestRecord[]>;
  createManagedPullRequest(command: BoundManagedPullRequestCreate): Promise<ManagedPullRequestRecord>;
  getPullRequest(pullRequest: number): Promise<ManagedPullRequestRecord>;
  enableAutoMerge(pullRequestNodeId: string): Promise<void>;
  isPullRequestQueued(pullRequestNodeId: string): Promise<boolean>;
  enqueuePullRequest(pullRequestNodeId: string, expectedHeadSha: string): Promise<void>;
  mergePullRequest(pullRequest: number): Promise<string>;
}

export interface DeploymentGitPort {
  getBranchSha(owner: string, repository: string, branch: string, token: string): Promise<string>;
  getMergeBaseSha(owner: string, repository: string, base: string, head: string, token: string): Promise<string>;
  isCommitReachable(owner: string, repository: string, branch: string, sha: string, token: string): Promise<boolean>;
  createOrVerifyBranch(owner: string, repository: string, branch: string, sha: string, token: string): Promise<void>;
  mergeCommitIntoBranch(owner: string, repository: string, branch: string, sourceSha: string, token: string): Promise<string>;
  deleteBranch(owner: string, repository: string, branch: string, expectedSha: string, token: string): Promise<void>;
  listBranches(owner: string, repository: string, prefix: string, token: string): Promise<readonly string[]>;
}

/** Repository-credential-bound deployment Git authority. */
export interface BoundDeploymentGitPort {
  getBranchSha(branch: string): Promise<string>;
  getMergeBaseSha(base: string, head: string): Promise<string>;
  isCommitReachable(branch: string, sha: string): Promise<boolean>;
  createOrVerifyBranch(branch: string, sha: string): Promise<void>;
  mergeCommitIntoBranch(branch: string, sourceSha: string): Promise<string>;
  deleteBranch(branch: string, expectedSha: string): Promise<void>;
  listBranches(prefix: string): Promise<readonly string[]>;
}

export interface DeploymentContinuationPort {
  dispatch(
    owner: string,
    repository: string,
    workflow: string,
    ref: string,
    operationId: string,
    issue: number,
    version: string,
    token: string,
  ): Promise<void>;
}

export interface BoundDeploymentContinuationPort {
  dispatch(workflow: string, ref: string, operationId: string, issue: number, version: string): Promise<void>;
}

export interface DeploymentDashboardComment {
  readonly id: number;
  readonly body: string;
}

export interface DeploymentPresentationPort {
  findDashboard(owner: string, repository: string, issue: number, marker: string, token: string): Promise<DeploymentDashboardComment | undefined>;
  createDashboard(owner: string, repository: string, issue: number, body: string, token: string): Promise<void>;
  updateDashboard(owner: string, repository: string, issue: number, commentId: number, body: string, token: string): Promise<void>;
  publishMilestone(owner: string, repository: string, issue: number, marker: string, body: string, token: string): Promise<void>;
}

export interface BoundDeploymentPresentationPort {
  findDashboard(issue: number, marker: string): Promise<DeploymentDashboardComment | undefined>;
  createDashboard(issue: number, body: string): Promise<void>;
  updateDashboard(issue: number, commentId: number, body: string): Promise<void>;
  publishMilestone(issue: number, marker: string, body: string): Promise<void>;
}

export type DeploymentPublicationInspection =
  | { readonly kind: "verified"; readonly receipt: DeploymentPublicationReceipt }
  | { readonly kind: "absent"; readonly effect: "tag" | "release" }
  | { readonly kind: "conflict"; readonly reason: string };

export interface DeploymentPublicationReceiptPort {
  inspect(command: {
    readonly owner: string;
    readonly repository: string;
    readonly tag: string;
    readonly productionSha: string;
    readonly operationId: string;
    readonly token: string;
  }): Promise<DeploymentPublicationInspection>;
}

export interface BoundDeploymentPublicationReceiptPort {
  inspect(command: {
    readonly tag: string;
    readonly productionSha: string;
    readonly operationId: string;
  }): Promise<DeploymentPublicationInspection>;
}

export interface DeploymentIssueState {
  branchType: string;
  releaseBranch?: string;
  workingBranch?: string;
  parentBranch?: string;
  hotfixOriginBranch?: string;
  hotfixBranch?: string;
  releaseOriginBranch?: string;
  releaseOriginSha?: string;
  hotfixOriginSha?: string;
  deploymentOrchestration?: DeploymentOperationSnapshot;
  branchConfiguration?: unknown;
  recommendationState?: unknown;
}

export interface DeploymentStateBinding {
  readonly owner: string;
  readonly repository: string;
  readonly issue: number;
  readonly token: string;
}

export interface DeploymentStateStorePort {
  load(): Promise<DeploymentStateLoadOutcome>;
  save(command: {
    readonly expected: ExpectedDeploymentState;
    readonly state: DeploymentIssueState & { readonly deploymentOrchestration: DeploymentOperationSnapshot };
  }): Promise<DeploymentStateSaveOutcome>;
}

export interface DeploymentStateStoreFactoryPort {
  bind(binding: DeploymentStateBinding): DeploymentStateStorePort;
}

export interface BoundDeploymentStateStoreFactoryPort {
  bind(issue: number): DeploymentStateStorePort;
}

/** Narrow runtime view adapted structurally at the single-action boundary. */
export interface DeploymentOrchestrationContext {
  readonly owner: string;
  readonly repo: string;
  readonly branches: {
    readonly defaultBranch: string;
    readonly development: string;
    readonly releaseTree: string;
    readonly hotfixTree: string;
  };
  readonly workflows: { readonly release: string; readonly hotfix: string };
  readonly locale: LocaleProfile;
  readonly agentConfiguration?: Readonly<AgentConfiguration>;
  readonly labels: {
    readonly isRelease: boolean;
    readonly isHotfix: boolean;
    readonly deploy: string;
    readonly deployed: string;
    readonly lifecycle: CopilotLifecycleLabels;
  };
  readonly deployment: DeploymentConfigurationValues;
  readonly singleAction: {
    readonly issue: number;
    readonly version: string;
    readonly title: string;
    readonly changelog: string;
    readonly operationId: string;
    readonly message: string;
    readonly isPrepareDeploymentAction: boolean;
    readonly isContinueDeploymentAction: boolean;
    readonly isPublishedDeploymentAction: boolean;
    readonly isFailedDeploymentAction: boolean;
  };
  readonly pullRequest: { readonly number: number };
  readonly currentConfiguration: DeploymentIssueState;
}
