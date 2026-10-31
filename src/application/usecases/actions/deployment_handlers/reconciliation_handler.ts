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
import { Result, getResultPayload } from "../../../../data/model/result";
import { ApplicationError, toApplicationError } from '../../../errors/application_error';
import { parseManagedPullRequestMarker } from "../../../../domain/managed_pull_request";
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
      target.targetBranch,
      target.sourceSha,
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
      (target) => target.status === "pending",
    );
    if (index < 0) return await this.finishOrPresent(context, operation);
    let target = operation.reconciliationTargets[index];
    if (target.pullRequest !== undefined) return await this.resumePullRequest(context, operation, target);
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
        target.targetBranch,
      ),
      this.runtime.dependencies.git.getBranchSha(
        target.sourceBranch,
      ),
    ]);
    const directUpToDate = await this.runtime.dependencies.git.isCommitReachable(
      target.sourceBranch,
      targetSha,
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
    if (!operation.publicationVerified || !operation.publicationReceipt
      || !operation.reconciliationTargets.every(target => target.status === 'completed')) {
      throw new ApplicationError('workflow.stale', 'Deployment completion requires verified publication and all configured reconciliation.');
    }
    try {
      if (operation.phase !== 'completed') await this.runtime.cleanup(context, operation);
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
    if (operation.phase !== 'completed') await this.runtime.persist(context, completed);
    try {
      if (completed.issueCompletion === 'close') {
        await this.runtime.dependencies.issues.closeIssue(context.singleAction.issue);
        const results = await this.runtime.dependencies.issues.reconcileCompletion({
          issueNumber: context.singleAction.issue, locale: context.locale.issue, trustedBotLogin: context.tokenUser,
          completionLabels: { lifecycle: context.labels.lifecycle,
            protectedLabels: context.labels.completionProtectedLabels ?? [] },
        });
        const failed = results.find(result => !result.success);
        if (failed) throw failed.errors?.[0] ?? new ApplicationError('workflow.stale', 'Native issue completion metadata is unverified.');
        if (!results.length || results.some(result => {
          const payload = getResultPayload(result.payload);
          const completion = payload?.issueCompletion ? getResultPayload(payload.issueCompletion) : payload;
          return completion?.nativeClosed !== true || completion.reconciled !== true;
        })) throw new ApplicationError('workflow.stale', 'Native issue closure and completion metadata are not fully verified.');
      }
    } catch (cause) {
      const error = toApplicationError(cause, 'provider.unavailable', 'Deployment completed but native issue completion remains unverified.');
      return new Result({ id: 'DeploymentOrchestrationUseCase', success: false, executed: true,
        steps: ['Verified publication, reconciliation and cleanup were retained. Retry the failed publication completion job to finish native issue completion.'],
        errors: [error], payload: { deployment: { operationId: completed.operationId, phase: 'completed', issueCompletionVerified: false } } });
    }
    await this.runtime.publishDashboard(context, completed);
    await this.runtime.publishMilestone(
      context,
      completed,
      { kind: "orchestration-complete", tag: completed.tag },
    );
    return deploymentSuccess(`Deployment ${completed.tag} completed${completionContext}.`);
  }

  private async resumePullRequest(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    target: DeploymentOperationSnapshot["reconciliationTargets"][number],
  ): Promise<Result | undefined> {
    const pullRequest = await this.runtime.dependencies.pullRequests.getPullRequest(target.pullRequest!);
    const identity = parseManagedPullRequestMarker(pullRequest.body);
    const expectedHead = target.syncBranch ? target.syncSha : target.sourceSha;
    if (!identity || identity.operationId !== operation.operationId || identity.phase !== "reconciliation"
      || identity.issue !== context.singleAction.issue || pullRequest.number !== target.pullRequest
      || pullRequest.repositoryFullName.toLowerCase() !== `${context.owner}/${context.repo}`.toLowerCase()
      || pullRequest.baseBranch !== target.targetBranch
      || pullRequest.headBranch !== (target.syncBranch ?? target.sourceBranch)
      || !expectedHead || pullRequest.headSha !== expectedHead) {
      return await this.runtime.block(context, operation, "reconciliation",
        "The recorded reconciliation PR no longer matches its durable identity and head SHA.", false);
    }
    if (pullRequest.merged) return await this.accept(context, operation, pullRequest);
    if (pullRequest.state === "closed") {
      return await this.runtime.block(context, operation, "reconciliation",
        `Reconciliation PR #${pullRequest.number} was closed without merge.`, true);
    }
    const configured = await this.runtime.configureMergeBehavior(
      context, operation, pullRequest, "reconciliation", reconciliationTargetRole(operation, target.targetBranch),
    );
    return configured.kind === "blocked" ? configured.result : undefined;
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
      syncBranch,
      targetSha,
    );
    await this.runtime.dependencies.git.mergeCommitIntoBranch(
      syncBranch,
      targetSha,
    );
    await this.runtime.dependencies.git.mergeCommitIntoBranch(
      syncBranch,
      sourceSha,
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
        target.syncBranch,
      ),
      this.runtime.dependencies.git.isCommitReachable(
        target.syncBranch,
        target.sourceSha,
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
        target.targetBranch,
        pullRequest.mergeCommitSha!,
      );
  }
}
