import type { ManagedPullRequestPhase } from "../../domain/deployment_operation";
import type { TargetMergeCapabilities } from "../policies/deployment_plan_policy";
import type { DeploymentOperationSnapshot } from "../../domain/deployment_operation";
import type { DeploymentConfigurationValues } from "../../domain/deployment_configuration";
import type { CopilotLifecycleLabels } from "../../domain/copilot_lifecycle";

export interface ManagedPullRequestRecord {
  readonly number: number;
  readonly nodeId: string;
  readonly body: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly baseBranch: string;
  readonly state: "open" | "closed";
  readonly merged: boolean;
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

export interface ManagedPullRequestPort {
  findManagedPullRequests(query: ManagedPullRequestQuery): Promise<readonly ManagedPullRequestRecord[]>;
  createManagedPullRequest(command: ManagedPullRequestCreate): Promise<ManagedPullRequestRecord>;
  getPullRequest(owner: string, repository: string, pullRequest: number, token: string): Promise<ManagedPullRequestRecord>;
  getTargetCapabilities(owner: string, repository: string, targetBranch: string, token: string, pullRequest?: number): Promise<TargetMergeCapabilities>;
  enableAutoMerge(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<void>;
  enqueuePullRequest(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<void>;
  mergePullRequest(owner: string, repository: string, pullRequest: number, token: string): Promise<string>;
}

export interface DeploymentGitPort {
  getBranchSha(owner: string, repository: string, branch: string, token: string): Promise<string>;
  getMergeBaseSha(owner: string, repository: string, base: string, head: string, token: string): Promise<string>;
  isCommitReachable(owner: string, repository: string, branch: string, sha: string, token: string): Promise<boolean>;
  createOrVerifyBranch(owner: string, repository: string, branch: string, sha: string, token: string): Promise<void>;
  mergeCommitIntoBranch(owner: string, repository: string, branch: string, sourceSha: string, token: string): Promise<string>;
  deleteBranch(owner: string, repository: string, branch: string, token: string): Promise<void>;
  listBranches(owner: string, repository: string, prefix: string, token: string): Promise<readonly string[]>;
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

export interface LegacyManagedPullRequestPort {
  waitAndMerge(
    owner: string,
    repository: string,
    headBranch: string,
    pullRequest: number,
    baseBranch: string,
    timeoutSeconds: number,
    token: string,
  ): Promise<void>;
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

export interface DeploymentStateQuery {
  readonly owner: string;
  readonly repository: string;
  readonly issue: number;
  readonly token: string;
}

export interface DeploymentStateStorePort {
  load(query: DeploymentStateQuery): Promise<DeploymentOperationSnapshot | undefined>;
  save(command: DeploymentStateQuery & { readonly state: DeploymentIssueState }): Promise<void>;
}

/** Narrow legacy-aggregate view adapted structurally at the single-action boundary. */
export interface DeploymentOrchestrationContext {
  readonly owner: string;
  readonly repo: string;
  readonly tokens: { readonly token: string };
  readonly branches: {
    readonly defaultBranch: string;
    readonly development: string;
    readonly releaseTree: string;
    readonly hotfixTree: string;
  };
  readonly workflows: { readonly release: string; readonly hotfix: string };
  readonly locale: { readonly issue: string; readonly pullRequest: string };
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
    readonly isDeployedAction: boolean;
    readonly isPrepareDeploymentAction: boolean;
    readonly isContinueDeploymentAction: boolean;
    readonly isPublishedDeploymentAction: boolean;
    readonly isFailedDeploymentAction: boolean;
  };
  readonly pullRequest: { readonly number: number; readonly mergeTimeout: number };
  readonly currentConfiguration: DeploymentIssueState;
}
