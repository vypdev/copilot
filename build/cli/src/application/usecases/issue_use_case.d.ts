import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
export declare class IssueUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly recommendStepsUseCase;
    private readonly answerIssueHelpUseCase;
    private readonly workflowSteps;
    taskId: string;
    constructor(recommendStepsUseCase: ParamUseCase<Execution, Result[]>, answerIssueHelpUseCase: ParamUseCase<Execution, Result[]>, workflowSteps: IssueWorkflowSteps);
    invoke(param: Execution): Promise<Result[]>;
}
