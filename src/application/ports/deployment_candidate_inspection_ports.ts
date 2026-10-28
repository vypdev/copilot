import type { DeploymentOperationSnapshot } from '../../domain/deployment_operation';
import type { DeploymentCandidateReplacementEvidence } from '../../domain/deployment_candidate_replacement';

export interface DeploymentCandidateInspectionCommand {
  readonly issue: number;
  readonly sourceBranch: string;
  readonly sourceSha: string;
  readonly reviewedSourceSha: string;
  readonly productionBranch: string;
  readonly promotionPullRequest: number;
  readonly version: string;
  /** Final handler requires proof from this native invocation, never a caller boolean. */
  readonly preparation?: { readonly kind: 'fresh' | 'recorded'; readonly candidateSha: string };
  /** Exact durable successor that may already own the sole open promotion during recovery. */
  readonly allowedCurrentPromotion?: { readonly operationId: string; readonly sourceSha: string; readonly pullRequest?: number };
}

export interface DeploymentCandidateInspectionPort {
  inspect(command: DeploymentCandidateInspectionCommand & {
    readonly owner: string;
    readonly repository: string;
    readonly token: string;
  }): Promise<DeploymentCandidateReplacementEvidence>;
}

export interface BoundDeploymentCandidateInspectionPort {
  inspect(command: DeploymentCandidateInspectionCommand): Promise<DeploymentCandidateReplacementEvidence>;
}

/** Read-only preflight state: parsed by the same strict schema as final persistence. */
export interface DeploymentCandidateLauncher {
  readonly issue: number;
  readonly open: boolean;
  readonly operation: DeploymentOperationSnapshot;
  readonly kind: 'release' | 'hotfix';
  readonly sourceBranch: string;
  readonly admission: { readonly labels: readonly string[]; readonly body: string };
}
export interface DeploymentCandidateLauncherReadPort {
  readLauncher(command: { readonly owner: string; readonly repository: string; readonly token: string; readonly issue: number }): Promise<DeploymentCandidateLauncher>;
}
export interface BoundDeploymentCandidateLauncherReadPort {
  readLauncher(issue: number): Promise<DeploymentCandidateLauncher>;
}

export interface DeploymentCandidateWorkflowRun {
  readonly id: number;
  readonly attempt: number;
  readonly repositoryFullName: string;
  readonly headRepositoryFullName: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly event: string;
  readonly path: string;
  readonly status: string;
}
export interface DeploymentCandidateWorkflowRunReadPort {
  readWorkflowRun(command: { readonly owner: string; readonly repository: string; readonly token: string; readonly runId: number }): Promise<DeploymentCandidateWorkflowRun>;
}
export interface BoundDeploymentCandidatePreflightPorts extends BoundDeploymentCandidateInspectionPort, BoundDeploymentCandidateLauncherReadPort {
  readWorkflowRun(runId: number): Promise<DeploymentCandidateWorkflowRun>;
}

/** Captured from the GitHub runner, outside configurable action input overlays. */
export interface DeploymentCandidatePreparationScope {
  readonly repositoryFullName: string;
  readonly eventName: string;
  readonly eventMode: string;
  readonly job: string;
  readonly runId: number;
  readonly runAttempt: number;
  readonly headSha: string;
}
