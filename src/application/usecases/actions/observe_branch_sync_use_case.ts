import type { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import {
  buildAlignedBranchSyncComment,
  buildStaleBranchSyncComment,
  findLatestBranchSyncComment,
  isStaleBranchSyncComment,
  selectBranchDependenciesForPush,
} from "../../policies/branch_sync_notification_policy";
import type {
  BranchDependency,
  BranchDependencyQueryPort,
  BranchSyncComparisonPort,
  BranchSyncNotificationPort,
} from "../../ports/branch_sync_ports";
import { logError, logInfo } from "../../ports/logging_ports";
import type { ParamUseCase } from "../base/param_usecase";
import { toApplicationError } from "../../errors/application_error";

const TASK_ID = "ObserveBranchSyncUseCase";

/**
 * Cheap push-time observer. It only queries branch relationships/comparisons
 * and maintains one stateful notification per issue; no agent is reachable.
 */
export class ObserveBranchSyncUseCase implements ParamUseCase<Execution, Result[]> {
  readonly taskId = TASK_ID;

  constructor(
    private readonly dependencies: BranchDependencyQueryPort,
    private readonly comparisons: BranchSyncComparisonPort,
    private readonly notifications: BranchSyncNotificationPort,
  ) {}

  async invoke(execution: Execution): Promise<Result[]> {
    const pushedBranch = execution.commit.branch.trim();
    if (!pushedBranch || isDeletedPush(execution)) return [];

    try {
      const dependencies = selectBranchDependenciesForPush(
        await this.dependencies.listOpenDependencies(
          execution.owner,
          execution.repo,
          execution.tokens.token,
        ),
        pushedBranch,
      );
      if (dependencies.length === 0) {
        logInfo(`No open branch dependencies are affected by ${pushedBranch}.`);
        return [];
      }

      const results: Result[] = [];
      for (const dependency of dependencies) {
        results.push(await this.reconcileDependency(execution, dependency));
      }
      return results;
    } catch (cause) {
      logError("Branch synchronization observation failed.", { pushedBranch });
      return [failure("Unable to inspect branch synchronization safely.", cause)];
    }
  }

  private async reconcileDependency(
    execution: Execution,
    dependency: BranchDependency,
  ): Promise<Result> {
    try {
      const comparison = await this.comparisons.compare(
        execution.owner,
        execution.repo,
        dependency.parentBranch,
        dependency.workingBranch,
        execution.tokens.token,
      );
      const comments = await this.notifications.listIssueComments(
        execution.owner,
        execution.repo,
        dependency.issueNumber,
        execution.tokens.token,
      );
      const latest = findLatestBranchSyncComment(comments, execution.tokenUser, dependency);

      if (comparison.behindBy > 0) {
        const comment = buildStaleBranchSyncComment({
          owner: execution.owner,
          repository: execution.repo,
          dependency,
          comparison,
        });
        if (latest && isStaleBranchSyncComment(latest.body)) {
          await this.notifications.updateComment(
            execution.owner,
            execution.repo,
            dependency.issueNumber,
            latest.id,
            comment,
            execution.tokens.token,
          );
        } else {
          await this.notifications.addComment(
            execution.owner,
            execution.repo,
            dependency.issueNumber,
            comment,
            execution.tokens.token,
          );
        }
        return success(dependency, comparison.behindBy, "stale");
      }

      if (latest && isStaleBranchSyncComment(latest.body)) {
        await this.notifications.updateComment(
          execution.owner,
          execution.repo,
          dependency.issueNumber,
          latest.id,
          buildAlignedBranchSyncComment(dependency),
          execution.tokens.token,
        );
      }
      return success(dependency, 0, "aligned");
    } catch (cause) {
      logError("Branch synchronization dependency reconciliation failed.", {
        issueNumber: dependency.issueNumber,
      });
      return failure(
        `Unable to inspect branch synchronization for issue #${dependency.issueNumber}.`,
        cause,
      );
    }
  }
}

function isDeletedPush(execution: Execution): boolean {
  const after = execution.inputs?.after;
  return typeof after === "string" && /^0+$/u.test(after);
}

function success(
  dependency: BranchDependency,
  behindBy: number,
  state: "stale" | "aligned",
): Result {
  return new Result({
    id: TASK_ID,
    success: true,
    executed: true,
    steps: [
      state === "stale"
        ? `Issue #${dependency.issueNumber}: ${dependency.workingBranch} is ${behindBy} commit(s) behind ${dependency.parentBranch}.`
        : `Issue #${dependency.issueNumber}: ${dependency.workingBranch} is aligned with ${dependency.parentBranch}.`,
    ],
    payload: { ...dependency, behindBy, state },
  });
}

function failure(message: string, cause: unknown): Result {
  return new Result({
    id: TASK_ID,
    success: false,
    executed: true,
    steps: [message],
    errors: [toApplicationError(cause, 'provider.unavailable', message)],
  });
}
