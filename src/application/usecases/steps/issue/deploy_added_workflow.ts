import { Result } from "../../../../data/model/result";
import type { BoundBranchWorkflowPort } from "../../../ports/branch_workflow_ports";
import { injectJsonAsMarkdownBlock } from "../../../../utils/content_utils";
import { logError } from "../../../ports/logging_ports";
import type { ParamUseCase } from "../../base/param_usecase";
import { resolveDeployWorkflowPlan } from "../../../policies/deploy_workflow_policy";
import { toApplicationError } from "../../../errors/application_error";
import type { DeployAddedContext, MoveIssueToInProgressContext } from '../../issue_workflow_context';

export async function runDeployAddedWorkflow(
  param: DeployAddedContext,
  taskId: string,
  branchWorkflowPort: BoundBranchWorkflowPort,
  moveIssueToInProgressUseCase: ParamUseCase<MoveIssueToInProgressContext, Result[]>,
): Promise<Result[]> {
  const plan = resolveDeployWorkflowPlan(param);
  if (!plan) return [new Result({ id: taskId, success: true, executed: false })];

  try {
    const result = await moveIssueToInProgressUseCase.invoke(param.moveToInProgress);
    const parameters = {
      version: plan.version,
      title: plan.title,
      changelog: plan.changelog,
      issue: plan.kind === "release" ? `${plan.issue}` : plan.issue,
    };
    await branchWorkflowPort.executeWorkflow(
      plan.branch,
      plan.workflow,
      parameters,
    );

    const branchUrl = `${param.repositoryWebUrl}/tree/${encodeURIComponent(plan.branch)}`;
    result.push(
      new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [
          `Executed ${plan.kind} workflow [**${plan.workflow}**](${param.repositoryWebUrl}/actions/workflows/${encodeURIComponent(plan.workflow)}) on [**${plan.branch}**](${branchUrl}).\n\n${injectJsonAsMarkdownBlock("Workflow Parameters", parameters)}`,
        ],
      }),
    );
    return result;
  } catch (error) {
    const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to start the deployment workflow.');
    logError(semanticError);
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to work with workflows, but there was a problem."],
        errors: [semanticError],
      }),
    ];
  }
}
