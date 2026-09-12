import type {
  DeploymentOrchestrationContext,
  ManagedPullRequestRecord,
} from "../../../ports/deployment_orchestration_ports";
import {
  buildReconciliationTarget,
  selectBackmergeMode,
} from "../../../policies/deployment_plan_policy";
import {
  completeReconciliationTarget,
  type DeploymentOperationSnapshot,
} from "../../../../domain/deployment_operation";
import type { Result } from "../../../../data/model/result";
import {
  DeploymentOrchestrationRuntime,
  deploymentSuccess,
  reconciliationTargetRole,
  replaceReconciliationTarget,
  semanticCleanupError,
} from "../../../services/deployment_orchestration_runtime";

export class ReconciliationHandler {
  constructor(private readonly runtime: DeploymentOrchestrationRuntime) {}

  async accept(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
  ): Promise<Result> {
    if (operation.phase === "completed") {
      return deploymentSuccess(`Duplicate reconciliation event for PR #${pullRequest.number} was ignored.`);
    }
    if (operation.phase !== "reconciliation_pending") {
      return deploymentSuccess(`Out-of-order reconciliation event ignored while operation is ${operation.phase}.`);
    }
    const target = operation.reconciliationTargets.find((item) => item.pullRequest === pullRequest.number);
    if (!target) {
      return await this.runtime.block(
        context,
        operation,
        "reconciliation",
        `PR #${pullRequest.number} is not a configured reconciliation target.`,
        false,
      );
    }
    if (pullRequest.baseBranch !== target.targetBranch
      || pullRequest.headBranch !== (target.syncBranch ?? target.sourceBranch)) {
      return await this.runtime.block(
        context,
        operation,
        "reconciliation",
        "Reconciliation PR branches do not match durable state.",
        false,
      );
    }
    if (!(await this.isReconciliationReachable(context, target, pullRequest))) {
      return await this.runtime.block(
        context,
        operation,
        "reconciliation",
        "The reconciliation merge is not reachable from its target branch.",
        true,
      );
    }
    const sourceReachable = await this.runtime.dependencies.git.isCommitReachable(
      context.owner,
      context.repo,
      target.targetBranch,
      target.sourceSha,
      context.tokens.token,
    );
    if (!sourceReachable) {
      return await this.runtime.block(
        context,
        operation,
        "reconciliation",
        "The reconciliation target does not contain the stored release SHA.",
        false,
      );
    }
    const updated = completeReconciliationTarget(operation, pullRequest.number);
    await this.runtime.persist(context, updated);
    if (!updated.reconciliationTargets.every((item) => item.status === "completed")) {
      return await this.plan(context, updated)
        ?? deploymentSuccess(`Reconciliation PR #${pullRequest.number} completed; the next configured target is ready.`);
    }
    return await this.complete(context, updated, ` after reconciliation PR #${pullRequest.number}`);
  }

  async plan(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<Result | undefined> {
    const index = operation.reconciliationTargets.findIndex(
      (target) => target.status === "pending" && target.pullRequest === undefined,
    );
    if (index < 0) return await this.finishOrPresent(context, operation);
    let target = operation.reconciliationTargets[index];
    const targetRole = reconciliationTargetRole(operation, target.targetBranch);
    const preflight = await this.runtime.inspectMergeBehavior(
      context,
      operation,
      target.targetBranch,
      targetRole,
      target.sourceSha,
    );
    if (preflight.kind === "blocked") {
      return await this.runtime.block(context, operation, "reconciliation", preflight.reason, true);
    }
    const [targetSha, currentSourceSha] = await Promise.all([
      this.runtime.dependencies.git.getBranchSha(
        context.owner,
        context.repo,
        target.targetBranch,
        context.tokens.token,
      ),
      this.runtime.dependencies.git.getBranchSha(
        context.owner,
        context.repo,
        target.sourceBranch,
        context.tokens.token,
      ),
    ]);
    const directUpToDate = await this.runtime.dependencies.git.isCommitReachable(
      context.owner,
      context.repo,
      target.sourceBranch,
      targetSha,
      context.tokens.token,
    ).catch(() => false);
    const mode = selectBackmergeMode(
      operation.backmergeMode,
      preflight.capabilities.requiresStrictStatusChecks,
      directUpToDate,
      currentSourceSha === target.sourceSha,
    );
    if (mode.kind === "unsupported") {
      return await this.runtime.block(context, operation, "reconciliation", mode.reason, false);
    }
    if (mode.mode === "sync-branch") {
      target = buildReconciliationTarget(operation, target.targetBranch, "sync-branch");
      await this.prepareSyncBranch(context, target.syncBranch!, targetSha, target.sourceSha);
    }
    const operationWithMode = replaceReconciliationTarget(operation, index, target);
    const pullRequest = await this.runtime.createOrReusePullRequest(
      context,
      operationWithMode,
      "reconciliation",
      target,
    );
    if (pullRequest.state === "closed" && !pullRequest.merged) {
      return await this.runtime.block(
        context,
        operationWithMode,
        "reconciliation",
        `Reconciliation PR #${pullRequest.number} was closed without merge.`,
        true,
      );
    }
    const verifiedTarget = await this.verifyPullRequestHead(context, operationWithMode, target, pullRequest);
    if (verifiedTarget.kind === "blocked") return verifiedTarget.result;
    const withPullRequest = replaceReconciliationTarget(operationWithMode, index, {
      ...target,
      ...(verifiedTarget.syncSha ? { syncSha: verifiedTarget.syncSha } : {}),
      pullRequest: pullRequest.number,
    });
    await this.runtime.persist(context, withPullRequest);
    if (pullRequest.merged) return await this.accept(context, withPullRequest, pullRequest);
    const configured = await this.runtime.configureMergeBehavior(
      context,
      withPullRequest,
      pullRequest,
      "reconciliation",
      targetRole,
    );
    if (configured.kind === "blocked") return configured.result;
    return undefined;
  }

  async complete(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    completionContext = "",
  ): Promise<Result> {
    try {
      await this.runtime.cleanup(context, operation);
      if (operation.issueCompletion === "close") {
        await this.runtime.dependencies.issues.closeIssue(
          context.owner,
          context.repo,
          context.singleAction.issue,
          context.tokens.token,
        );
      }
    } catch (error) {
      const semanticError = semanticCleanupError(error);
      return await this.runtime.block(
        context,
        operation,
        "cleanup",
        semanticError.message,
        true,
        semanticError,
      );
    }
    const completed: DeploymentOperationSnapshot = { ...operation, phase: "completed", lastFailure: null };
    await this.runtime.persist(context, completed);
    await this.runtime.publishDashboard(context, completed);
    await this.runtime.publishMilestone(
      context,
      completed,
      "orchestration-complete",
      `✅ Deployment ${completed.tag} and every configured reconciliation target are complete.`,
    );
    return deploymentSuccess(`Deployment ${completed.tag} completed${completionContext}.`);
  }

  private async finishOrPresent(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<Result | undefined> {
    if (operation.reconciliationTargets.length > 0
      && operation.reconciliationTargets.every((target) => target.status === "completed")) {
      return await this.complete(context, operation);
    }
    await this.runtime.publishDashboard(context, operation);
    return undefined;
  }

  private async prepareSyncBranch(
    context: DeploymentOrchestrationContext,
    syncBranch: string,
    targetSha: string,
    sourceSha: string,
  ): Promise<void> {
    await this.runtime.dependencies.git.createOrVerifyBranch(
      context.owner,
      context.repo,
      syncBranch,
      targetSha,
      context.tokens.token,
    );
    await this.runtime.dependencies.git.mergeCommitIntoBranch(
      context.owner,
      context.repo,
      syncBranch,
      targetSha,
      context.tokens.token,
    );
    await this.runtime.dependencies.git.mergeCommitIntoBranch(
      context.owner,
      context.repo,
      syncBranch,
      sourceSha,
      context.tokens.token,
    );
  }

  private async verifyPullRequestHead(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    target: DeploymentOperationSnapshot["reconciliationTargets"][number],
    pullRequest: ManagedPullRequestRecord,
  ): Promise<
    | { readonly kind: "verified"; readonly syncSha?: string }
    | { readonly kind: "blocked"; readonly result: Result }
  > {
    if (!target.syncBranch) {
      return pullRequest.headSha === target.sourceSha
        ? { kind: "verified" }
        : {
            kind: "blocked",
            result: await this.runtime.block(
              context,
              operation,
              "reconciliation",
              `Reconciliation PR #${pullRequest.number} source moved away from the stored release SHA.`,
              false,
            ),
          };
    }
    const [syncHead, sourceIncluded] = await Promise.all([
      this.runtime.dependencies.git.getBranchSha(
        context.owner,
        context.repo,
        target.syncBranch,
        context.tokens.token,
      ),
      this.runtime.dependencies.git.isCommitReachable(
        context.owner,
        context.repo,
        target.syncBranch,
        target.sourceSha,
        context.tokens.token,
      ),
    ]);
    if (pullRequest.headSha === syncHead && sourceIncluded) {
      return { kind: "verified", syncSha: syncHead };
    }
    return {
      kind: "blocked",
      result: await this.runtime.block(
        context,
        operation,
        "reconciliation",
        `Reconciliation PR #${pullRequest.number} does not contain the verified sync-branch state.`,
        false,
      ),
    };
  }

  private async isReconciliationReachable(
    context: DeploymentOrchestrationContext,
    target: DeploymentOperationSnapshot["reconciliationTargets"][number],
    pullRequest: ManagedPullRequestRecord,
  ): Promise<boolean> {
    return Boolean(pullRequest.mergeCommitSha)
      && await this.runtime.dependencies.git.isCommitReachable(
        context.owner,
        context.repo,
        target.targetBranch,
        pullRequest.mergeCommitSha!,
        context.tokens.token,
      );
  }
}
