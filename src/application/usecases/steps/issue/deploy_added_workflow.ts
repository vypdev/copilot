import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchWorkflowPort } from "../../../ports/branch_workflow_ports";
import { injectJsonAsMarkdownBlock } from "../../../../utils/content_utils";
import { logError } from "../../../ports/logging_ports";
import type { ParamUseCase } from "../../base/param_usecase";
import { resolveDeployWorkflowPlan } from "../../../policies/deploy_workflow_policy";

export async function runDeployAddedWorkflow(
  param: Execution,
  taskId: string,
  branchWorkflowPort: BranchWorkflowPort,
  moveIssueToInProgressUseCase: ParamUseCase<Execution, Result[]>,
): Promise<Result[]> {
  const plan = resolveDeployWorkflowPlan(param);
  if (!plan) return [new Result({ id: taskId, success: true, executed: false })];

  try {
    const result = await moveIssueToInProgressUseCase.invoke(param);
    const parameters = {
      version: plan.version,
      title: plan.title,
      changelog: plan.changelog,
      issue: plan.kind === "release" ? `${plan.issue}` : plan.issue,
    };
    await branchWorkflowPort.executeWorkflow(
      param.owner,
      param.repo,
      plan.branch,
      plan.workflow,
      parameters,
      param.tokens.token,
    );

    const branchUrl = `https://github.com/${param.owner}/${param.repo}/tree/${plan.branch}`;
    result.push(
      new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [
          `Executed ${plan.kind} workflow [**${plan.workflow}**](https://github.com/${param.owner}/${param.repo}/actions/workflows/${plan.workflow}) on [**${plan.branch}**](${branchUrl}).\n\n${injectJsonAsMarkdownBlock("Workflow Parameters", parameters)}`,
        ],
      }),
    );
    return result;
  } catch (error) {
    logError(error);
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to work with workflows, but there was a problem."],
        errors: [error?.toString() ?? "Unknown error"],
      }),
    ];
  }
}
