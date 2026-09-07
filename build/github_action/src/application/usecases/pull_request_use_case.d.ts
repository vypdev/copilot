import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
export declare class PullRequestUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly updatePullRequestDescriptionUseCase;
    private readonly workflowSteps;
    private readonly reviewPotentialProblemsUseCase?;
    private readonly actorAuthorizationPort?;
    taskId: string;
    constructor(updatePullRequestDescriptionUseCase: ParamUseCase<Execution, Result[]>, workflowSteps: PullRequestWorkflowSteps, reviewPotentialProblemsUseCase?: ParamUseCase<Execution, Result[]> | undefined, actorAuthorizationPort?: ActorAuthorizationPort | undefined);
    invoke(param: Execution): Promise<Result[]>;
}
