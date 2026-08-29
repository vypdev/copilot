import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
export declare class PullRequestUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly updatePullRequestDescriptionUseCase;
    private readonly workflowSteps;
    taskId: string;
    constructor(updatePullRequestDescriptionUseCase: ParamUseCase<Execution, Result[]>, workflowSteps: PullRequestWorkflowSteps);
    invoke(param: Execution): Promise<Result[]>;
}
