import type { PreviousWorkflowRunsQuery, PreviousWorkflowRunsQueryPort, WorkflowPollingDelayPort, WorkflowPollingObserverPort, WorkflowPollingRandomPort, WorkflowQueueClockPort, WorkflowQueueRequestContext } from '../../../application/ports/workflow_run_ports';
import type { GithubWorkflowRunsClient } from '../../../infrastructure/github/ports/github_workflow_provider_ports';
import { type WorkflowRunsRetryPolicy } from './workflow_runs_retry';
export declare class ActivePreviousWorkflowRunsRepository implements PreviousWorkflowRunsQueryPort {
    private readonly client;
    private readonly retryDelayPort;
    private readonly retryPolicy;
    private readonly clock;
    private readonly random;
    private readonly observer?;
    constructor(client: GithubWorkflowRunsClient, retryDelayPort?: WorkflowPollingDelayPort, retryPolicy?: WorkflowRunsRetryPolicy, clock?: WorkflowQueueClockPort, random?: WorkflowPollingRandomPort, observer?: WorkflowPollingObserverPort | undefined);
    countActivePreviousRuns(query: PreviousWorkflowRunsQuery, context?: WorkflowQueueRequestContext): Promise<number>;
}
