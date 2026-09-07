import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
export interface PullRequestWorkflowPorts {
    updatePullRequestDescriptionUseCase: ParamUseCase<Execution, Result[]>;
    reviewPotentialProblemsUseCase?: ParamUseCase<Execution, Result[]>;
    workflowSteps: PullRequestWorkflowSteps;
    actorAuthorizationPort?: ActorAuthorizationPort;
}
/** Coordinates pull-request lifecycle actions while preserving their sequential order. */
export declare function runPullRequestWorkflow(param: Execution, taskId: string, ports: PullRequestWorkflowPorts): Promise<Result[]>;
