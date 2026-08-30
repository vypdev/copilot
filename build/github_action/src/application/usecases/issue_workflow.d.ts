import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
export interface IssueWorkflowPorts {
    recommendStepsUseCase: ParamUseCase<Execution, Result[]>;
    answerIssueHelpUseCase: ParamUseCase<Execution, Result[]>;
    workflowSteps: IssueWorkflowSteps;
}
/** Coordinates issue lifecycle steps in their required sequential order. */
export declare function runIssueWorkflow(param: Execution, taskId: string, ports: IssueWorkflowPorts): Promise<Result[]>;
