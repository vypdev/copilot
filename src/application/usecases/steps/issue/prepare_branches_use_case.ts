import { Result } from "../../../../data/model/result";
import type {
  BoundBranchLifecyclePort,
  BranchNamePort,
} from "../../../ports/branch_lifecycle_ports";
import type {
  BoundLinkedBranchCommandPort,
  BranchPropagationDelayPort,
  CommitTagQueryPort,
  RemoteBranchSyncPort,
} from "../../../ports/branch_preparation_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { selectBranchPreparationStrategy } from "./branch_preparation_strategy";
import { prepareManagedBranch } from "./prepare_managed_branch";
import { prepareHotfixBranch } from "./prepare_hotfix_branch";
import { prepareReleaseBranch } from "./prepare_release_branch";
import { toApplicationError } from "../../../errors/application_error";
import {
  branchPreparationOutcome,
  type BranchPreparationContext,
  type BranchPreparationOutcome,
  type MoveIssueToInProgressContext,
} from '../../issue_workflow_context';

export class PrepareBranchesUseCase implements ParamUseCase<
  BranchPreparationContext,
  BranchPreparationOutcome
> {
  taskId = "PrepareBranchesUseCase";

  constructor(
    private readonly branchListQueryPort: BoundBranchLifecyclePort,
    private readonly branchNamePort: BranchNamePort,
    private readonly remoteBranchSyncPort: RemoteBranchSyncPort,
    private readonly commitTagQueryPort: CommitTagQueryPort,
    private readonly linkedBranchCommandPort: BoundLinkedBranchCommandPort,
    private readonly branchPropagationDelayPort: BranchPropagationDelayPort,
    private readonly moveIssueToInProgressUseCase: ParamUseCase<MoveIssueToInProgressContext, Result[]>,
  ) {}

  async invoke(param: BranchPreparationContext): Promise<BranchPreparationOutcome> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    const result: Result[] = [];
    try {
      const issueTitle = param.issueTitle ?? '';
      if (!param.mandatoryBranchRequired && issueTitle.length === 0) {
        return branchPreparationOutcome([
          new Result({
            id: this.taskId,
            success: false,
            executed: false,
            reminders: ["Tried to check the title but no one was found."],
          }),
        ]);
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
      const branches = await this.branchListQueryPort.getListOfBranches();
      branches.forEach((branch) => logDebugInfo(`- ${branch}`));
      const prepared = await this.prepareBranchByStrategy(param, issueTitle, branches);
      return branchPreparationOutcome(
        [...result, ...prepared.results],
        prepared.configurationPatch,
      );
    } catch (error) {
      const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to prepare the issue branch.');
      logError(semanticError);
      result.push(
        new Result({
          id: this.taskId,
          success: false,
          executed: true,
          steps: [
            "Tried to prepare the branch for the issue, but there was a problem.",
          ],
          errors: [semanticError],
        }),
      );
      return branchPreparationOutcome(result);
    }
  }

  private async prepareBranchByStrategy(
    param: BranchPreparationContext,
    issueTitle: string,
    branches: readonly string[],
  ): Promise<BranchPreparationOutcome> {
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
