import type { PreviousWorkflowRunsQuery, PreviousWorkflowRunsQueryPort, WorkflowPollingDelayPort } from '../../../application/ports/workflow_run_ports';
import type { GithubWorkflowRunsClient } from '../../../infrastructure/github/ports/github_workflow_provider_ports';
import { type WorkflowRunsRetryPolicy } from './workflow_runs_retry';
export declare class ActivePreviousWorkflowRunsRepository implements PreviousWorkflowRunsQueryPort {
    private readonly client;
    private readonly retryDelayPort;
    private readonly retryPolicy;
    constructor(client: GithubWorkflowRunsClient, retryDelayPort?: WorkflowPollingDelayPort, retryPolicy?: WorkflowRunsRetryPolicy);
    countActivePreviousRuns(query: PreviousWorkflowRunsQuery): Promise<number>;
    private countActiveRunsForStatus;
    private extractWorkflowRuns;
}
