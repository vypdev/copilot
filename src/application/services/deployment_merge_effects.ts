import { ApplicationError } from "../errors/application_error";
import { DeploymentMergeEffectError } from "../errors/deployment_merge_effect_error";
import type { BoundManagedPullRequestPort, ManagedPullRequestRecord } from "../ports/deployment_orchestration_ports";
import type { PullRequestModeDecision, TargetMergeCapabilities } from "../policies/deployment_plan_policy";
import type { DeploymentOperationSnapshot } from "../../domain/deployment_operation";
import { parseManagedPullRequestMarker } from "../../domain/managed_pull_request";

type SelectedMode = Extract<PullRequestModeDecision, { readonly kind: "mode" }>["mode"];
export type DeploymentMergeInspection =
  | { readonly kind: "ready"; readonly capabilities: TargetMergeCapabilities;
      readonly decision: Extract<PullRequestModeDecision, { readonly kind: "mode" }> }
  | { readonly kind: "blocked"; readonly reason: string };
type ReadyInspection = Extract<DeploymentMergeInspection, { readonly kind: "ready" }>;
type MergeAction = "merge" | "enable-auto-merge" | "merge-queue" | "create-only";

/** Applies current policy, with one bounded re-observation after a typed readiness rejection. */
export class DeploymentMergeEffects {
  constructor(private readonly pullRequests: BoundManagedPullRequestPort) {}

  async configure(
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
    inspection: ReadyInspection,
    inspect: (pullRequest: ManagedPullRequestRecord) => Promise<DeploymentMergeInspection>,
    beforeApply: (mode: SelectedMode) => Promise<void>,
  ): Promise<SelectedMode> {
    await beforeApply(inspection.decision.mode);
    const action = selectAction(operation, inspection);
    try {
      await this.apply(action, pullRequest);
      return inspection.decision.mode;
    } catch (error) {
      if (!(error instanceof DeploymentMergeEffectError) || !error.readinessChanged || operation.prMode !== "auto") throw error;
      const current = await this.pullRequests.getPullRequest(pullRequest.number);
      assertSamePullRequest(pullRequest, current);
      if (current.merged) return inspection.decision.mode;
      if (current.state !== "open") throw new ApplicationError("provider.conflict", "The managed PR was closed without merging.");
      const refreshed = await inspect(current);
      if (refreshed.kind === "blocked") throw new ApplicationError("provider.conflict", refreshed.reason);
      const nextAction = selectAction(operation, refreshed);
      if (nextAction === action) {
        if (action === "enable-auto-merge" && current.autoMergeEnabled) return refreshed.decision.mode;
        throw error;
      }
      await beforeApply(refreshed.decision.mode);
      await this.apply(nextAction, current);
      return refreshed.decision.mode;
    }
  }

  private async apply(action: MergeAction, pullRequest: ManagedPullRequestRecord): Promise<void> {
    try {
      await this.pullRequests.prepareIssueCompletion(pullRequest);
      if (action === "merge") {
        await this.pullRequests.mergePullRequest(pullRequest.number, pullRequest.headSha);
      } else if (action === "enable-auto-merge" && !pullRequest.autoMergeEnabled) {
        await this.pullRequests.enableAutoMerge(pullRequest.nodeId, pullRequest.headSha);
      } else if (action === "merge-queue" && !await this.pullRequests.isPullRequestQueued(pullRequest.nodeId)) {
        await this.pullRequests.enqueuePullRequest(pullRequest.nodeId, pullRequest.headSha);
      }
    } catch (cause) {
      if (cause instanceof ApplicationError) throw cause;
      throw new ApplicationError("workflow.failed", `Automatic merge action ${action} failed with an unclassified provider rejection.`, { cause, retryable: true });
    }
  }
}

function selectAction(operation: DeploymentOperationSnapshot, inspection: ReadyInspection): MergeAction {
  if (inspection.decision.mode !== "auto-merge") return inspection.decision.mode;
  return operation.prMode === "auto" && inspection.capabilities.immediatelyMergeable ? "merge" : "enable-auto-merge";
}

function assertSamePullRequest(expected: ManagedPullRequestRecord, current: ManagedPullRequestRecord): void {
  const marker = parseManagedPullRequestMarker(expected.body);
  const currentMarker = parseManagedPullRequestMarker(current.body);
  if (expected.number !== current.number || expected.nodeId !== current.nodeId
    || expected.repositoryFullName !== current.repositoryFullName || expected.baseBranch !== current.baseBranch
    || expected.headBranch !== current.headBranch || expected.headSha !== current.headSha
    || !marker || !currentMarker || marker.operationId !== currentMarker.operationId
    || marker.phase !== currentMarker.phase || marker.issue !== currentMarker.issue) {
    throw new ApplicationError("provider.conflict", "The managed PR identity or frozen head changed during merge setup.", { retryable: false });
  }
}
