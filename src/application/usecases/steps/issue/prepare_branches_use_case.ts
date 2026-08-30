import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type {
  BranchListQueryPort,
  BranchNamePort,
} from "../../../ports/branch_lifecycle_ports";
import type {
  BranchPropagationDelayPort,
  CommitTagQueryPort,
  LinkedBranchCommandPort,
  RemoteBranchSyncPort,
} from "../../../ports/branch_preparation_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { selectBranchPreparationStrategy } from "./branch_preparation_strategy";
import { prepareManagedBranch } from "./prepare_managed_branch";
import { prepareHotfixBranch } from "./prepare_hotfix_branch";
import { prepareReleaseBranch } from "./prepare_release_branch";

export class PrepareBranchesUseCase implements ParamUseCase<
  Execution,
  Result[]
> {
  taskId = "PrepareBranchesUseCase";

  constructor(
    private readonly branchListQueryPort: BranchListQueryPort,
    private readonly branchNamePort: BranchNamePort,
    private readonly remoteBranchSyncPort: RemoteBranchSyncPort,
    private readonly commitTagQueryPort: CommitTagQueryPort,
    private readonly linkedBranchCommandPort: LinkedBranchCommandPort,
    private readonly branchPropagationDelayPort: BranchPropagationDelayPort,
    private readonly moveIssueToInProgressUseCase: ParamUseCase<Execution, Result[]>,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    const result: Result[] = [];
    try {
      const issueTitle = param.issue.title ?? "";
      if (!param.labels.isMandatoryBranchedLabel && issueTitle.length === 0) {
        return [
          new Result({
            id: this.taskId,
            success: false,
            executed: false,
            reminders: ["Tried to check the title but no one was found."],
          }),
        ];
      }

      await this.remoteBranchSyncPort.fetchRemoteBranches();
      result.push(
        new Result({
          id: this.taskId,
          success: true,
          executed: true,
          reminders: ["Take a coffee break while you work ☕."],
        }),
      );
      const branches = await this.branchListQueryPort.getListOfBranches(
        param.owner,
        param.repo,
        param.tokens.token,
      );
      branches.forEach((branch) => logDebugInfo(`- ${branch}`));
      result.push(...await this.prepareBranchByStrategy(param, issueTitle, branches));
      return result;
    } catch (error) {
      logError(
        `PrepareBranches: error preparing branches for issue #${param.issueNumber}.`,
        error instanceof Error ? { stack: error.stack } : undefined,
      );
      result.push(
        new Result({
          id: this.taskId,
          success: false,
          executed: true,
          steps: [
            "Tried to prepare the branch for the issue, but there was a problem.",
          ],
          errors: [error instanceof Error ? error : new Error(String(error))],
        }),
      );
      return result;
    }
  }

  private async prepareBranchByStrategy(
    param: Execution,
    issueTitle: string,
    branches: string[],
  ): Promise<Result[]> {
    const strategy = selectBranchPreparationStrategy({
      hotfixActive: param.hotfix.active,
      releaseActive: param.release.active,
    });
    if (strategy === "hotfix") {
      return prepareHotfixBranch(
        param,
        this.commitTagQueryPort,
        this.linkedBranchCommandPort,
        branches,
        this.taskId,
      );
    }
    if (strategy === "release") {
      return prepareReleaseBranch(param, this.linkedBranchCommandPort, branches, this.taskId);
    }
    return prepareManagedBranch(param, issueTitle, branches, this.taskId, {
      branchNamePort: this.branchNamePort,
      linkedBranchCommandPort: this.linkedBranchCommandPort,
      branchPropagationDelayPort: this.branchPropagationDelayPort,
      moveIssueToInProgressUseCase: this.moveIssueToInProgressUseCase,
    });
  }

}
