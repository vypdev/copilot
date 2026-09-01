import type { Execution } from '../data/model/execution';
import type { Result } from '../data/model/result';
import type { ExecutableMainRunRoute, MainRunRouteHandlers } from './main_run_route_handlers';
import type { RepositoryCoordinates } from './repository_context';
import type { PreviousWorkflowRunsQuery } from '../application/ports/workflow_run_ports';
export declare const WORKFLOW_QUEUE_FAILURE_MESSAGE = "Workflow queue check failed; sequential execution was not bypassed.";
/**
 * Keeps provider diagnostics out of the action's externally visible failure
 * channel while preserving fail-closed queue behavior.
 */
export declare class WorkflowQueueFailureError extends Error {
    constructor();
}
export declare function buildPreviousWorkflowRunsQuery(repository: RepositoryCoordinates): PreviousWorkflowRunsQuery;
export declare function waitForPreviousWorkflowRuns(token: string, repository: RepositoryCoordinates): Promise<void>;
export declare function logWelcomeMessage(execution: Execution): void;
export declare function runTokenExecution(execution: Execution, routeHandlers: MainRunRouteHandlers): Promise<Result[]>;
export declare function runNoIssueExecution(execution: Execution, routeHandlers: MainRunRouteHandlers): Promise<Result[]>;
export declare function runMainRoute(execution: Execution, route: ExecutableMainRunRoute | 'unhandled', routeHandlers: MainRunRouteHandlers): Promise<Result[]>;
