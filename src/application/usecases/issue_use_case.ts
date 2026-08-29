import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logError, logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";

export class IssueUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "IssueUseCase";
  constructor(
    private readonly recommendStepsUseCase: ParamUseCase<Execution, Result[]>,
    private readonly answerIssueHelpUseCase: ParamUseCase<Execution, Result[]>,
    private readonly workflowSteps: IssueWorkflowSteps,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

    const results: Result[] = [];

    const permissionResult = await this.workflowSteps.checkPermissions.invoke(param);
    const lastAction = permissionResult[permissionResult.length - 1];
    if (!lastAction) {
      const permissionError = new Error('Permission check returned no result.');
      logError(`Unable to continue ${this.taskId}: ${permissionError.message}`);
      return [
        new Result({
          id: this.taskId,
          success: false,
          executed: true,
          steps: ['Unable to verify whether the issue action is authorized.'],
          errors: [permissionError],
        }),
      ];
    }
    if (!lastAction.success && lastAction.executed) {
      results.push(...permissionResult);
      results.push(...(await this.workflowSteps.closeNotAllowedIssue.invoke(param)));
      return results;
    }

    if (param.cleanIssueBranches) {
      results.push(
        ...(await this.workflowSteps.removeIssueBranches.invoke(param)),
      );
    }

    /**
     * Assignees
     */
    results.push(
      ...(await this.workflowSteps.assignMemberToIssue.invoke(param)),
    );

    /**
     * Update title
     */
    results.push(
      ...(await this.workflowSteps.updateTitle.invoke(param)),
    );

    /**
     * Update issue type
     */
    results.push(
      ...(await this.workflowSteps.updateIssueType.invoke(param)),
    );

    /**
     * Link issue to project
     */
    results.push(
      ...(await this.workflowSteps.linkIssueProject.invoke(param)),
    );

    /**
     * Check priority issue size
     */
    results.push(
      ...(await this.workflowSteps.checkPriorityIssueSize.invoke(param)),
    );

    /**
     * Prepare branches
     */
    if (param.isBranched) {
      results.push(
        ...(await this.workflowSteps.prepareBranches.invoke(param)),
      );
    } else {
      results.push(
        ...(await this.workflowSteps.removeIssueBranches.invoke(param)),
      );
    }

    /**
     * Remove unnecessary branches
     */
    results.push(
      ...(await this.workflowSteps.removeNotNeededBranches.invoke(param)),
    );

    /**
     * Check if deploy label was added
     */
    results.push(
      ...(await this.workflowSteps.deployAdded.invoke(param)),
    );

    /**
     * Check if deployed label was added
     */
    results.push(...(await this.workflowSteps.deployedAdded.invoke(param)));

    /**
     * Analyze new issues and issue-description changes. Other edits (title,
     * project, assignment, labels) must not invoke the agent again.
     */
    if (param.issue.opened || param.issue.descriptionEdited) {
      const isRelease = param.labels.isRelease;
      const isQuestionOrHelp = param.labels.isQuestion || param.labels.isHelp;
      if (!isRelease && !isQuestionOrHelp) {
        results.push(...(await this.recommendStepsUseCase.invoke(param)));
      } else if (isQuestionOrHelp) {
        results.push(...(await this.answerIssueHelpUseCase.invoke(param)));
      }
    }

    return results;
  }
}
