import type {
  DeploymentContinuationPort,
  DeploymentGitPort,
  DeploymentOrchestrationContext,
  DeploymentPresentationPort,
  DeploymentStateStorePort,
  ManagedPullRequestPort,
  ManagedPullRequestRecord,
} from "../../ports/deployment_orchestration_ports";
import type { IssueClosurePort } from "../../ports/issue_lifecycle_ports";
import type { IssueLabelsPort } from "../../ports/issue_management_ports";
import {
  buildInitialDeploymentOperation,
  buildReconciliationTarget,
  mergeQueueReadinessFailureMessage,
  selectBackmergeMode,
  selectPullRequestMode,
  selectReconciliationTargetBranches,
  validateInitialDeploymentInput,
} from "../../policies/deployment_plan_policy";
import type {
  PullRequestModeDecision,
  TargetMergeCapabilities,
} from "../../policies/deployment_plan_policy";
import {
  evaluateMergeQueueReadiness,
  type MergeQueueTargetRole,
} from "../../../domain/merge_queue_readiness";
import {
  deploymentDashboardMarker,
  renderDeploymentDashboard,
  renderPromotionPullRequest,
  renderReconciliationPullRequest,
  type DeploymentPresentationContext,
} from "../../policies/deployment_presentation_policy";
import {
  blockDeploymentOperation,
  completeReconciliationTarget,
  resumeBlockedDeployment,
  transitionDeploymentOperation,
  type DeploymentOperationSnapshot,
  type DeploymentPhase,
  type ReconciliationTargetState,
} from "../../../domain/deployment_operation";
import { parseManagedPullRequestMarker } from "../../../domain/managed_pull_request";
import { Result } from "../../../data/model/result";
import type { ParamUseCase } from "../base/param_usecase";
import { projectDeploymentLabels } from "../../policies/deployment_lifecycle_policy";
import { sanitizePublishedError } from "../../policies/github_comment_publication_policy";

export interface DeploymentOrchestrationDependencies {
  readonly pullRequests: ManagedPullRequestPort;
  readonly git: DeploymentGitPort;
  readonly continuation: DeploymentContinuationPort;
  readonly presentation: DeploymentPresentationPort;
  readonly state: DeploymentStateStorePort;
  readonly labels: IssueLabelsPort;
  readonly issues: IssueClosurePort;
  readonly operationId: () => string;
}

const TASK_ID = "DeploymentOrchestrationUseCase";

export class DeploymentOrchestrationUseCase implements ParamUseCase<DeploymentOrchestrationContext, Result[]> {
  readonly taskId = TASK_ID;
  private readonly checkpoints = new WeakMap<DeploymentOrchestrationContext, { operationId: string; phase: DeploymentPhase } | undefined>();

  constructor(private readonly dependencies: DeploymentOrchestrationDependencies) {}

  async invoke(execution: DeploymentOrchestrationContext): Promise<Result[]> {
    const initial = execution.currentConfiguration.deploymentOrchestration;
    this.checkpoints.set(execution, initial ? { operationId: initial.operationId, phase: initial.phase } : undefined);
    try {
      if (execution.singleAction.isPrepareDeploymentAction) return [await this.prepare(execution)];
      if (execution.singleAction.isContinueDeploymentAction) return [await this.continue(execution)];
      if (execution.singleAction.isPublishedDeploymentAction) return [await this.published(execution)];
      if (execution.singleAction.isFailedDeploymentAction) return [await this.failed(execution)];
      return [];
    } catch (error) {
      await this.recordUnexpectedFailure(execution, error);
      return [new Result({
        id: TASK_ID,
        success: false,
        executed: true,
        steps: ["Deployment orchestration is blocked. No unsafe transition was performed."],
        errors: [error],
      })];
    }
  }

  private async prepare(execution: DeploymentOrchestrationContext): Promise<Result> {
    const existing = execution.currentConfiguration.deploymentOrchestration;
    if (existing) {
      if (existing.version !== execution.singleAction.version) {
        throw new Error(`Issue already owns deployment operation ${existing.operationId} for version ${existing.version}.`);
      }
      if (existing.phase === "blocked"
          && (!existing.lastFailure?.retryable
            || !["preparing", "promotion_pr_pending"].includes(existing.lastFailure.previousPhase))) {
        await this.publishDashboard(execution, existing);
        return blockedResult(existing, "The prepare mode cannot resume this blocked deployment phase.");
      }
      const resumed = existing.phase === "blocked" ? resumeBlockedDeployment(existing) : undefined;
      const current = resumed?.kind === "advance" ? resumed.operation : existing;
      if (current !== existing) {
        execution.currentConfiguration.deploymentOrchestration = current;
        await this.persist(execution);
      }
      if (current.phase === "preparing" || current.phase === "promotion_pr_pending") {
        const currentSourceSha = await this.dependencies.git.getBranchSha(
          execution.owner, execution.repo, current.sourceBranch, execution.tokens.token,
        );
        if (currentSourceSha !== current.sourceSha) {
          return await this.block(execution, current, "promotion", "The prepared source branch changed after its immutable SHA was stored.", false);
        }
        return await this.ensurePromotion(execution, current);
      }
      await this.publishDashboard(execution, current);
      return success(`Deployment ${current.operationId} is already ${current.phase}; reused its durable state.`);
    }

    const kind = deploymentKind(execution);
    const sourceBranch = kind === "release"
      ? execution.currentConfiguration.releaseBranch
      : execution.currentConfiguration.hotfixBranch;
    if (!sourceBranch) throw new Error(`No prepared ${kind} branch is stored on the launcher issue.`);
    const sourceSha = await this.dependencies.git.getBranchSha(
      execution.owner, execution.repo, sourceBranch, execution.tokens.token,
    );
    const originBranch = kind === "release"
      ? execution.currentConfiguration.releaseOriginBranch ?? execution.branches.development
      : execution.currentConfiguration.hotfixOriginBranch ?? execution.currentConfiguration.parentBranch ?? execution.branches.defaultBranch;
    const persistedOrigin = kind === "release"
      ? execution.currentConfiguration.releaseOriginSha
      : execution.currentConfiguration.hotfixOriginSha;
    const originSha = persistedOrigin ?? await this.dependencies.git.getMergeBaseSha(
      execution.owner, execution.repo, originBranch, sourceBranch, execution.tokens.token,
    );
    const operation = buildInitialDeploymentOperation({
      operationId: this.dependencies.operationId(),
      kind,
      version: execution.singleAction.version,
      title: execution.singleAction.title,
      changelog: execution.singleAction.changelog,
      sourceBranch,
      sourceSha,
      originBranch,
      originSha,
      productionBranch: execution.branches.defaultBranch,
      developmentBranch: execution.branches.development,
      configuration: execution.deployment,
      publicationWorkflow: kind === "release" ? execution.workflows.release : execution.workflows.hotfix,
    });
    const errors = validateInitialDeploymentInput({
      operationId: operation.operationId,
      kind,
      version: operation.version,
      title: operation.title,
      changelog: operation.changelog,
      sourceBranch,
      sourceSha,
      originBranch,
      originSha,
      productionBranch: operation.productionBranch,
      developmentBranch: operation.developmentBranch,
      configuration: execution.deployment,
      publicationWorkflow: operation.publicationWorkflow,
    });
    if (errors.length > 0) throw new Error(errors.join(" "));
    execution.currentConfiguration.deploymentOrchestration = operation;
    if (kind === "release") {
      execution.currentConfiguration.releaseOriginBranch = originBranch;
      execution.currentConfiguration.releaseOriginSha = originSha;
    } else {
      execution.currentConfiguration.hotfixOriginSha = originSha;
    }
    await this.persist(execution);
    await this.publishDashboard(execution, operation);

    return await this.ensurePromotion(execution, operation);
  }

  private async ensurePromotion(execution: DeploymentOrchestrationContext, operation: DeploymentOperationSnapshot): Promise<Result> {
    const preflight = await this.inspectMergeBehavior(
      execution,
      operation,
      operation.productionBranch,
      "production",
      operation.sourceSha,
    );
    if (preflight.kind === "blocked") {
      return await this.block(execution, operation, "promotion", preflight.reason, true);
    }
    const promotion = await this.createOrReusePullRequest(execution, operation, "promotion");
    if (promotion.merged) return await this.advancePromotion(execution, operation, promotion);
    if (promotion.state === "closed") return await this.block(execution, operation, "promotion", `Promotion PR #${promotion.number} was closed without merge.`, true);
    if (promotion.headSha !== operation.sourceSha) {
      return await this.block(execution, operation, "promotion", `Promotion PR #${promotion.number} does not contain the persisted prepared SHA.`, false);
    }
    const pending = operation.phase === "promotion_pr_pending"
      ? { ...operation, promotionPullRequest: promotion.number }
      : transitionDeploymentOperation(
          { ...operation, promotionPullRequest: promotion.number },
          "preparing",
          "promotion_pr_pending",
        ).operation;
    if (pending.phase !== "promotion_pr_pending") throw new Error(`Cannot prepare promotion from ${operation.phase}.`);
    execution.currentConfiguration.deploymentOrchestration = pending;
    await this.persist(execution);
    const configured = await this.configureMergeBehavior(execution, pending, promotion, "promotion", "production");
    if (configured.kind === "blocked") return configured.result;
    return success(configured.operation.selectedPrMode === "create-only"
      ? `Promotion PR #${promotion.number} is ready for maintainer review; this runner does not wait.`
      : `Promotion PR #${promotion.number} is managed by GitHub; this runner does not wait for checks.`);
  }

  private async continue(execution: DeploymentOrchestrationContext): Promise<Result> {
    let operation = requireOperation(execution);
    const pullRequestNumber = execution.pullRequest.number;
    if (pullRequestNumber < 1) throw new Error("The continuation event has no pull request number.");
    const pullRequest = await this.dependencies.pullRequests.getPullRequest(
      execution.owner, execution.repo, pullRequestNumber, execution.tokens.token,
    );
    const identity = parseManagedPullRequestMarker(pullRequest.body);
    if (!identity || identity.operationId !== operation.operationId || identity.issue !== execution.singleAction.issue) {
      throw new Error(`PR #${pullRequest.number} is not owned by deployment operation ${operation.operationId}.`);
    }
    if (operation.phase === "blocked") {
      const previousPhase = operation.lastFailure?.previousPhase;
      const eventCanResume = operation.lastFailure?.retryable === true
        && (identity.phase === "promotion"
          ? previousPhase === "preparing" || previousPhase === "promotion_pr_pending"
          : previousPhase === "reconciliation_pending");
      if (!eventCanResume) {
        await this.publishDashboard(execution, operation);
        return success(`PR #${pullRequest.number} cannot resume the existing ${operation.lastFailure?.category ?? "deployment"} block; the original diagnosis was preserved.`);
      }
      const resumed = resumeBlockedDeployment(operation);
      if (resumed.kind === "advance") {
        operation = resumed.operation;
        execution.currentConfiguration.deploymentOrchestration = operation;
        await this.persist(execution);
      }
    }
    if (pullRequest.repositoryFullName.toLowerCase() !== `${execution.owner}/${execution.repo}`.toLowerCase()) {
      throw new Error("Cross-repository deployment continuation was rejected.");
    }
    if (pullRequest.state !== "closed") return success(`PR #${pullRequest.number} is still open; no transition was applied.`);
    if (!pullRequest.merged) {
      return await this.block(execution, operation, identity.phase === "promotion" ? "promotion" : "reconciliation", `Managed ${identity.phase} PR #${pullRequest.number} was closed without merge.`, true);
    }
    if (identity.phase === "promotion") return await this.advancePromotion(execution, operation, pullRequest);
    return await this.advanceReconciliation(execution, operation, pullRequest);
  }

  private async advancePromotion(
    execution: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
  ): Promise<Result> {
    if (["promoted", "publishing", "published", "reconciliation_pending", "completed"].includes(operation.phase)) {
      return success(`Duplicate promotion event for PR #${pullRequest.number} was ignored; operation is ${operation.phase}.`);
    }
    if (operation.phase !== "promotion_pr_pending" && operation.phase !== "preparing") {
      return success(`Out-of-order promotion event was ignored while operation is ${operation.phase}.`);
    }
    if (pullRequest.headBranch !== operation.sourceBranch || pullRequest.baseBranch !== operation.productionBranch || pullRequest.headSha !== operation.sourceSha) {
      return await this.block(execution, operation, "promotion", "Promotion PR branches or prepared SHA do not match durable state.", false);
    }
    const productionSha = pullRequest.mergeCommitSha;
    if (!productionSha) return await this.block(execution, operation, "promotion", "Merged promotion PR has no production merge SHA.", true);
    const [mergeReachable, sourceReachable] = await Promise.all([
      this.dependencies.git.isCommitReachable(execution.owner, execution.repo, operation.productionBranch, productionSha, execution.tokens.token),
      this.dependencies.git.isCommitReachable(execution.owner, execution.repo, operation.productionBranch, operation.sourceSha, execution.tokens.token),
    ]);
    if (!mergeReachable || !sourceReachable) {
      return await this.block(execution, operation, "promotion", "GitHub does not confirm that the accepted production branch contains the promotion commit.", true);
    }
    let promoted: DeploymentOperationSnapshot = { ...operation, promotionPullRequest: pullRequest.number, productionSha, phase: "promoted", lastFailure: null };
    execution.currentConfiguration.deploymentOrchestration = promoted;
    await this.persist(execution);
    promoted = { ...promoted, phase: "publishing" };
    execution.currentConfiguration.deploymentOrchestration = promoted;
    await this.persist(execution);
    await this.publishDashboard(execution, promoted);
    await this.publishMilestone(execution, promoted, "promotion-merged", `✅ Promotion PR #${pullRequest.number} merged. Publication is starting from production SHA \`${productionSha}\`.`);
    await this.dependencies.continuation.dispatch(
      execution.owner,
      execution.repo,
      operation.publicationWorkflow,
      operation.productionBranch,
      operation.operationId,
      execution.singleAction.issue,
      operation.version,
      execution.tokens.token,
    );
    return success(`Promotion PR #${pullRequest.number} was verified; publication continuation was dispatched from ${operation.productionBranch}.`);
  }

  private async published(execution: DeploymentOrchestrationContext): Promise<Result> {
    let operation = requireOperation(execution);
    if (operation.phase === "blocked" && operation.lastFailure?.retryable) {
      const resumed = resumeBlockedDeployment(operation);
      if (resumed.kind === "advance") {
        operation = resumed.operation;
        execution.currentConfiguration.deploymentOrchestration = operation;
        await this.persist(execution);
      }
    }
    if (operation.phase === "reconciliation_pending" && operation.publicationVerified) {
      return await this.ensureNextReconciliation(execution, operation)
        ?? success(`Publication for ${operation.tag} was already verified; reconciliation state was recovered.`);
    }
    if (operation.phase === "completed" && operation.publicationVerified) {
      await this.publishDashboard(execution, operation);
      return success(`Publication for ${operation.tag} was already verified; duplicate notification ignored.`);
    }
    if (operation.phase !== "published" && operation.phase !== "publishing" && operation.phase !== "promoted") {
      throw new Error(`Publication cannot advance from phase ${operation.phase}.`);
    }
    if (!operation.productionSha) throw new Error("The accepted production SHA is missing.");
    const reachable = await this.dependencies.git.isCommitReachable(
      execution.owner, execution.repo, operation.productionBranch, operation.productionSha, execution.tokens.token,
    );
    if (!reachable) return await this.block(execution, operation, "publication", "Published SHA is not reachable from the stored production branch.", false);
    let published: DeploymentOperationSnapshot = { ...operation, phase: "published", publicationVerified: true, lastFailure: null };
    execution.currentConfiguration.deploymentOrchestration = published;
    await this.persist(execution);
    await this.publishMilestone(execution, published, "publication-complete", `📦 ${published.tag} is published from accepted production SHA \`${published.productionSha}\`.`);

    const activeReleases = operation.kind === "hotfix"
      ? (await this.dependencies.git.listBranches(execution.owner, execution.repo, execution.branches.releaseTree, execution.tokens.token))
          .filter((branch) => branch !== operation.sourceBranch)
      : [];
    const decision = selectReconciliationTargetBranches(published, activeReleases);
    if (decision.kind === "blocked") return await this.block(execution, published, "reconciliation", decision.reason, false);
    if (decision.kind === "manual") {
      await this.publishDashboard(execution, published);
      return success(`${published.tag} is published. Manual reconciliation is configured, so the issue remains open.`);
    }
    published = {
      ...published,
      reconciliationTargets: decision.targetBranches.map((target) => buildReconciliationTarget(published, target, "direct")),
      phase: "reconciliation_pending",
    };
    execution.currentConfiguration.deploymentOrchestration = published;
    await this.persist(execution);
    return await this.ensureNextReconciliation(execution, published)
      ?? success(`${published.tag} is published; development reconciliation is now managed by GitHub.`);
  }

  private async failed(execution: DeploymentOrchestrationContext): Promise<Result> {
    const operation = requireOperation(execution);
    if (operation.phase === "completed") return success(`Deployment ${operation.operationId} is already complete; a stale failure report was ignored.`);
    if (operation.phase === "blocked") {
      await this.publishDashboard(execution, operation);
      return new Result({
        id: TASK_ID,
        success: false,
        executed: true,
        steps: [`Deployment ${operation.operationId} remains blocked; its original failure classification was preserved.`],
        errors: [new Error(operation.lastFailure?.message ?? "Deployment remains blocked.")],
      });
    }
    const category = operation.phase === "preparing" || operation.phase === "promotion_pr_pending"
      ? "promotion"
      : operation.phase === "promoted" || operation.phase === "publishing"
        ? "publication"
        : operation.lastFailure?.category ?? "reconciliation";
    const message = execution.singleAction.message || `The ${category} workflow failed. Review the linked workflow run before retrying.`;
    return await this.block(execution, operation, category, message, true);
  }

  private async advanceReconciliation(
    execution: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
  ): Promise<Result> {
    if (operation.phase === "completed") return success(`Duplicate reconciliation event for PR #${pullRequest.number} was ignored.`);
    if (operation.phase !== "reconciliation_pending") return success(`Out-of-order reconciliation event ignored while operation is ${operation.phase}.`);
    const target = operation.reconciliationTargets.find((item) => item.pullRequest === pullRequest.number);
    if (!target) return await this.block(execution, operation, "reconciliation", `PR #${pullRequest.number} is not a configured reconciliation target.`, false);
    if (pullRequest.baseBranch !== target.targetBranch || pullRequest.headBranch !== (target.syncBranch ?? target.sourceBranch)) {
      return await this.block(execution, operation, "reconciliation", "Reconciliation PR branches do not match durable state.", false);
    }
    const mergeSha = pullRequest.mergeCommitSha;
    if (!mergeSha || !(await this.dependencies.git.isCommitReachable(execution.owner, execution.repo, target.targetBranch, mergeSha, execution.tokens.token))) {
      return await this.block(execution, operation, "reconciliation", "The reconciliation merge is not reachable from its target branch.", true);
    }
    if (!(await this.dependencies.git.isCommitReachable(execution.owner, execution.repo, target.targetBranch, target.sourceSha, execution.tokens.token))) {
      return await this.block(execution, operation, "reconciliation", "The reconciliation target does not contain the stored release SHA.", false);
    }
    const updated = completeReconciliationTarget(operation, pullRequest.number);
    execution.currentConfiguration.deploymentOrchestration = updated;
    await this.persist(execution);
    if (!updated.reconciliationTargets.every((item) => item.status === "completed")) {
      return await this.ensureNextReconciliation(execution, updated)
        ?? success(`Reconciliation PR #${pullRequest.number} completed; the next configured target is ready.`);
    }
    return await this.finalizeReconciliation(execution, updated, ` after reconciliation PR #${pullRequest.number}`);
  }

  private async finalizeReconciliation(
    execution: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    completionContext: string = "",
  ): Promise<Result> {
    try {
      await this.cleanup(execution, operation);
      if (operation.issueCompletion === "close") {
        await this.dependencies.issues.closeIssue(execution.owner, execution.repo, execution.singleAction.issue, execution.tokens.token);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await this.block(execution, operation, "cleanup", message, true);
    }
    const completed: DeploymentOperationSnapshot = { ...operation, phase: "completed", lastFailure: null };
    execution.currentConfiguration.deploymentOrchestration = completed;
    await this.persist(execution);
    await this.publishDashboard(execution, completed);
    await this.publishMilestone(execution, completed, "orchestration-complete", `✅ Deployment ${completed.tag} and every configured reconciliation target are complete.`);
    return success(`Deployment ${completed.tag} completed${completionContext}.`);
  }

  private async ensureNextReconciliation(execution: DeploymentOrchestrationContext, operation: DeploymentOperationSnapshot): Promise<Result | undefined> {
    const index = operation.reconciliationTargets.findIndex((target) => target.status === "pending" && target.pullRequest === undefined);
    if (index < 0) {
      if (operation.reconciliationTargets.length > 0
          && operation.reconciliationTargets.every((target) => target.status === "completed")) {
        return await this.finalizeReconciliation(execution, operation);
      }
      await this.publishDashboard(execution, operation);
      return;
    }
    let target = operation.reconciliationTargets[index];
    const targetRole = reconciliationTargetRole(operation, target.targetBranch);
    const preflight = await this.inspectMergeBehavior(
      execution,
      operation,
      target.targetBranch,
      targetRole,
      target.sourceSha,
    );
    if (preflight.kind === "blocked") {
      return await this.block(execution, operation, "reconciliation", preflight.reason, true);
    }
    const capabilities = preflight.capabilities;
    const [targetSha, currentSourceSha] = await Promise.all([
      this.dependencies.git.getBranchSha(execution.owner, execution.repo, target.targetBranch, execution.tokens.token),
      this.dependencies.git.getBranchSha(execution.owner, execution.repo, target.sourceBranch, execution.tokens.token),
    ]);
    const directUpToDate = await this.dependencies.git.isCommitReachable(
      execution.owner, execution.repo, target.sourceBranch, targetSha, execution.tokens.token,
    ).catch(() => false);
    const mode = selectBackmergeMode(
      operation.backmergeMode,
      capabilities.requiresStrictStatusChecks,
      directUpToDate,
      currentSourceSha === target.sourceSha,
    );
    if (mode.kind === "unsupported") {
      return await this.block(execution, operation, "reconciliation", mode.reason, false);
    }
    if (mode.mode === "sync-branch") {
      target = buildReconciliationTarget(operation, target.targetBranch, "sync-branch");
      await this.dependencies.git.createOrVerifyBranch(execution.owner, execution.repo, target.syncBranch!, targetSha, execution.tokens.token);
      await this.dependencies.git.mergeCommitIntoBranch(execution.owner, execution.repo, target.syncBranch!, targetSha, execution.tokens.token);
      await this.dependencies.git.mergeCommitIntoBranch(execution.owner, execution.repo, target.syncBranch!, target.sourceSha, execution.tokens.token);
    }
    const operationWithMode = replaceTarget(operation, index, target);
    const pullRequest = await this.createOrReusePullRequest(execution, operationWithMode, "reconciliation", target);
    if (pullRequest.state === "closed" && !pullRequest.merged) {
      return await this.block(execution, operationWithMode, "reconciliation", `Reconciliation PR #${pullRequest.number} was closed without merge.`, true);
    }
    if (target.syncBranch) {
      const [syncHead, sourceIncluded] = await Promise.all([
        this.dependencies.git.getBranchSha(execution.owner, execution.repo, target.syncBranch, execution.tokens.token),
        this.dependencies.git.isCommitReachable(execution.owner, execution.repo, target.syncBranch, target.sourceSha, execution.tokens.token),
      ]);
      if (pullRequest.headSha !== syncHead || !sourceIncluded) {
        return await this.block(execution, operationWithMode, "reconciliation", `Reconciliation PR #${pullRequest.number} does not contain the verified sync-branch state.`, false);
      }
    } else if (pullRequest.headSha !== target.sourceSha) {
      return await this.block(execution, operationWithMode, "reconciliation", `Reconciliation PR #${pullRequest.number} source moved away from the stored release SHA.`, false);
    }
    const withPullRequest = replaceTarget(operationWithMode, index, { ...target, pullRequest: pullRequest.number });
    execution.currentConfiguration.deploymentOrchestration = withPullRequest;
    await this.persist(execution);
    if (pullRequest.merged) {
      return await this.advanceReconciliation(execution, withPullRequest, pullRequest);
    }
    const configured = await this.configureMergeBehavior(
      execution,
      withPullRequest,
      pullRequest,
      "reconciliation",
      targetRole,
    );
    if (configured.kind === "blocked") return configured.result;
    return undefined;
  }

  private async createOrReusePullRequest(
    execution: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    phase: "promotion" | "reconciliation",
    target?: ReconciliationTargetState,
  ): Promise<ManagedPullRequestRecord> {
    const headBranch = target?.syncBranch ?? target?.sourceBranch ?? operation.sourceBranch;
    const baseBranch = target?.targetBranch ?? operation.productionBranch;
    const query = {
      owner: execution.owner,
      repository: execution.repo,
      operationId: operation.operationId,
      phase,
      issue: execution.singleAction.issue,
      headBranch,
      baseBranch,
      token: execution.tokens.token,
    } as const;
    const existing = await this.dependencies.pullRequests.findManagedPullRequests(query);
    if (existing.length > 1) throw new Error(`Multiple managed ${phase} PRs match operation ${operation.operationId}.`);
    if (existing[0]) return existing[0];
    const context = presentationContext(execution);
    const content = phase === "promotion"
      ? renderPromotionPullRequest(operation, context)
      : renderReconciliationPullRequest(operation, target!, context);
    return await this.dependencies.pullRequests.createManagedPullRequest({ ...query, ...content });
  }

  private async configureMergeBehavior(
    execution: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
    category: "promotion" | "reconciliation",
    targetRole: MergeQueueTargetRole,
  ): Promise<
    | { readonly kind: "configured"; readonly operation: DeploymentOperationSnapshot }
    | { readonly kind: "blocked"; readonly result: Result }
  > {
    const inspection = await this.inspectMergeBehavior(
      execution,
      operation,
      pullRequest.baseBranch,
      targetRole,
      pullRequest.headSha,
      pullRequest.number,
    );
    if (inspection.kind === "blocked") {
      return {
        kind: "blocked",
        result: await this.block(execution, operation, category, inspection.reason, true),
      };
    }
    const { capabilities, decision } = inspection;
    const managed: DeploymentOperationSnapshot = { ...operation, selectedPrMode: decision.mode };
    execution.currentConfiguration.deploymentOrchestration = managed;
    await this.persist(execution);
    if (decision.mode === "auto-merge") {
      if (operation.prMode === "auto" && capabilities.immediatelyMergeable) {
        await this.dependencies.pullRequests.mergePullRequest(
          execution.owner, execution.repo, pullRequest.number, execution.tokens.token,
        );
      } else {
        await this.dependencies.pullRequests.enableAutoMerge(
          execution.owner, execution.repo, pullRequest.nodeId, execution.tokens.token,
        );
      }
    } else if (decision.mode === "merge-queue") {
      const alreadyQueued = await this.dependencies.pullRequests.isPullRequestQueued(
        execution.owner,
        execution.repo,
        pullRequest.nodeId,
        execution.tokens.token,
      );
      if (!alreadyQueued) {
        await this.dependencies.pullRequests.enqueuePullRequest(
          execution.owner,
          execution.repo,
          pullRequest.nodeId,
          pullRequest.headSha,
          execution.tokens.token,
        );
      }
    }
    await this.publishDashboard(execution, managed);
    return { kind: "configured", operation: managed };
  }

  private async inspectMergeBehavior(
    execution: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    targetBranch: string,
    targetRole: MergeQueueTargetRole,
    candidateHeadSha: string,
    pullRequest?: number,
  ): Promise<
    | {
        readonly kind: "ready";
        readonly capabilities: TargetMergeCapabilities;
        readonly decision: Extract<PullRequestModeDecision, { readonly kind: "mode" }>;
      }
    | { readonly kind: "blocked"; readonly reason: string }
  > {
    const capabilities = await this.dependencies.pullRequests.getTargetCapabilities(
      execution.owner,
      execution.repo,
      targetBranch,
      execution.tokens.token,
      { candidateHeadSha, ...(pullRequest === undefined ? {} : { pullRequest }) },
    );
    const decision = selectPullRequestMode(operation.prMode, capabilities);
    if (decision.kind === "unsupported") {
      if (capabilities.mergeQueueObservationProblems.length > 0) {
        const readiness = evaluateMergeQueueReadiness({
          queueRequired: true,
          targetRole,
          targetBranch,
          producers: capabilities.mergeQueueProducers,
          problems: capabilities.mergeQueueObservationProblems,
          attestations: execution.deployment.mergeQueueCheckAttestations,
        });
        return { kind: "blocked", reason: mergeQueueReadinessFailureMessage(readiness, execution.locale.issue) };
      }
      return { kind: "blocked", reason: decision.reason };
    }
    if (decision.mode === "merge-queue") {
      const readiness = evaluateMergeQueueReadiness({
        queueRequired: capabilities.mergeQueueRequired,
        targetRole,
        targetBranch,
        producers: capabilities.mergeQueueProducers,
        problems: capabilities.mergeQueueObservationProblems,
        attestations: execution.deployment.mergeQueueCheckAttestations,
      });
      if (readiness.verdict !== "ready") {
        return { kind: "blocked", reason: mergeQueueReadinessFailureMessage(readiness, execution.locale.issue) };
      }
    }
    return { kind: "ready", capabilities, decision };
  }

  private async cleanup(execution: DeploymentOrchestrationContext, operation: DeploymentOperationSnapshot): Promise<void> {
    const deleteSource = operation.cleanup === "all" || operation.cleanup === "source-only";
    const deleteSync = operation.cleanup === "all" || operation.cleanup === "sync-only";
    if (deleteSync) {
      for (const target of operation.reconciliationTargets) {
        if (target.syncBranch) await this.dependencies.git.deleteBranch(execution.owner, execution.repo, target.syncBranch, execution.tokens.token);
      }
    }
    if (deleteSource) await this.dependencies.git.deleteBranch(execution.owner, execution.repo, operation.sourceBranch, execution.tokens.token);
  }

  private async projectDeploymentLabels(execution: DeploymentOrchestrationContext, operation: DeploymentOperationSnapshot): Promise<void> {
    const labels = await this.dependencies.labels.getLabels(
      execution.owner, execution.repo, execution.singleAction.issue, execution.tokens.token,
    );
    const next = projectDeploymentLabels(labels, operation, execution.labels);
    if (next.join("\0") !== labels.join("\0")) {
      await this.dependencies.labels.setLabels(execution.owner, execution.repo, execution.singleAction.issue, next, execution.tokens.token);
    }
  }

  private async block(
    execution: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    category: "promotion" | "publication" | "reconciliation" | "cleanup",
    message: string,
    retryable: boolean,
  ): Promise<Result> {
    const blocked = blockDeploymentOperation(operation, category, message, retryable);
    execution.currentConfiguration.deploymentOrchestration = blocked;
    await this.persist(execution);
    await this.publishDashboard(execution, blocked);
    await this.publishMilestone(execution, blocked, "reconciliation-blocked", `❌ Deployment blocked: ${blocked.lastFailure?.message}`);
    return new Result({ id: TASK_ID, success: false, executed: true, steps: [message], errors: [new Error(message)] });
  }

  private async persist(execution: DeploymentOrchestrationContext): Promise<void> {
    const expected = this.checkpoints.get(execution);
    const query = {
      owner: execution.owner,
      repository: execution.repo,
      issue: execution.singleAction.issue,
      token: execution.tokens.token,
    };
    const actual = await this.dependencies.state.load(query);
    if (!sameCheckpoint(actual, expected)) {
      throw new Error("Concurrent deployment state change detected; reload the launcher issue and retry.");
    }
    await this.dependencies.state.save({ ...query, state: execution.currentConfiguration });
    const operation = execution.currentConfiguration.deploymentOrchestration;
    this.checkpoints.set(execution, operation ? { operationId: operation.operationId, phase: operation.phase } : undefined);
    if (operation) await this.projectDeploymentLabels(execution, operation);
  }

  private async publishDashboard(execution: DeploymentOrchestrationContext, operation: DeploymentOperationSnapshot): Promise<void> {
    const marker = deploymentDashboardMarker(operation.operationId, execution.singleAction.issue);
    const body = renderDeploymentDashboard(operation, presentationContext(execution));
    const current = await this.dependencies.presentation.findDashboard(
      execution.owner, execution.repo, execution.singleAction.issue, marker, execution.tokens.token,
    );
    if (current) await this.dependencies.presentation.updateDashboard(execution.owner, execution.repo, execution.singleAction.issue, current.id, body, execution.tokens.token);
    else await this.dependencies.presentation.createDashboard(execution.owner, execution.repo, execution.singleAction.issue, body, execution.tokens.token);
  }

  private async publishMilestone(execution: DeploymentOrchestrationContext, operation: DeploymentOperationSnapshot, name: string, body: string): Promise<void> {
    if (operation.commentMode !== "milestones") return;
    const marker = `<!-- copilot-deployment-milestone operation-id="${operation.operationId}" name="${name}" -->`;
    await this.dependencies.presentation.publishMilestone(
      execution.owner, execution.repo, execution.singleAction.issue, marker, body, execution.tokens.token,
    );
  }

  private async recordUnexpectedFailure(execution: DeploymentOrchestrationContext, error: unknown): Promise<void> {
    const operation = execution.currentConfiguration.deploymentOrchestration;
    if (!operation || operation.phase === "completed" || operation.phase === "blocked") return;
    const message = sanitizePublishedError(error instanceof Error ? error.message : String(error));
    const category = operation.phase === "preparing" || operation.phase === "promotion_pr_pending"
      ? "promotion"
      : operation.phase === "promoted" || operation.phase === "publishing"
        ? "publication"
        : "reconciliation";
    const blocked = blockDeploymentOperation(operation, category, message, true);
    execution.currentConfiguration.deploymentOrchestration = blocked;
    try {
      await this.persist(execution);
      await this.publishDashboard(execution, blocked);
    } catch {
      // Preserve the original provider failure returned by invoke.
    }
  }
}

function requireOperation(execution: DeploymentOrchestrationContext): DeploymentOperationSnapshot {
  const operation = execution.currentConfiguration.deploymentOrchestration;
  if (!operation) throw new Error("No durable deployment operation exists on the launcher issue.");
  if (!execution.singleAction.operationId) {
    throw new Error("single-action-operation-id is required for a durable deployment continuation.");
  }
  if (execution.singleAction.operationId && execution.singleAction.operationId !== operation.operationId) {
    throw new Error(`Deployment operation mismatch: expected ${operation.operationId}, received ${execution.singleAction.operationId}.`);
  }
  if ((execution.singleAction.isPublishedDeploymentAction || execution.singleAction.isFailedDeploymentAction)
      && execution.singleAction.version !== operation.version) {
    throw new Error(`Deployment version mismatch: expected ${operation.version}, received ${execution.singleAction.version || "empty"}.`);
  }
  return operation;
}

function deploymentKind(execution: DeploymentOrchestrationContext): "release" | "hotfix" {
  if (execution.currentConfiguration.hotfixBranch && !execution.currentConfiguration.releaseBranch) return "hotfix";
  if (execution.currentConfiguration.releaseBranch && !execution.currentConfiguration.hotfixBranch) return "release";
  if (execution.labels.isHotfix) return "hotfix";
  if (execution.labels.isRelease) return "release";
  throw new Error("The launcher issue does not identify exactly one release or hotfix source branch.");
}

function reconciliationTargetRole(
  operation: DeploymentOperationSnapshot,
  targetBranch: string,
): MergeQueueTargetRole {
  if (targetBranch === operation.productionBranch) return "production";
  if (targetBranch === operation.developmentBranch) return "development";
  return "active-release";
}

function presentationContext(execution: DeploymentOrchestrationContext): DeploymentPresentationContext {
  return {
    owner: execution.owner,
    repository: execution.repo,
    issue: execution.singleAction.issue,
    issueLocale: execution.locale.issue,
    pullRequestLocale: execution.locale.pullRequest,
    packageName: execution.owner === "vypdev" && execution.repo === "copilot" ? "@vypdev/copilot" : undefined,
  };
}

function replaceTarget(operation: DeploymentOperationSnapshot, index: number, target: ReconciliationTargetState): DeploymentOperationSnapshot {
  return {
    ...operation,
    reconciliationTargets: operation.reconciliationTargets.map((current, currentIndex) => currentIndex === index ? target : current),
  };
}

function success(step: string): Result {
  return new Result({ id: TASK_ID, success: true, executed: true, steps: [step] });
}

function blockedResult(operation: DeploymentOperationSnapshot, fallback: string): Result {
  const message = operation.lastFailure?.message ?? fallback;
  return new Result({ id: TASK_ID, success: false, executed: true, steps: [message], errors: [new Error(message)] });
}

function sameCheckpoint(
  actual: DeploymentOperationSnapshot | undefined,
  expected: { operationId: string; phase: DeploymentPhase } | undefined,
): boolean {
  if (!actual || !expected) return actual === undefined && expected === undefined;
  return actual.operationId === expected.operationId && actual.phase === expected.phase;
}
