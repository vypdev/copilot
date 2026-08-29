import type { PreviousWorkflowRunsQuery, PreviousWorkflowRunsQueryPort, WorkflowPollingDelayPort } from '../../../application/ports/workflow_run_ports';
import type { GithubWorkflowRunsClient } from '../../../infrastructure/github/ports/github_workflow_provider_ports';
export interface WorkflowRunsRetryPolicy {
    maximumAttempts: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
}
export declare class ActivePreviousWorkflowRunsRepository implements PreviousWorkflowRunsQueryPort {
    private readonly client;
    private readonly retryDelayPort;
    private readonly retryPolicy;
    constructor(client: GithubWorkflowRunsClient, retryDelayPort?: WorkflowPollingDelayPort, retryPolicy?: WorkflowRunsRetryPolicy);
    countActivePreviousRuns(query: PreviousWorkflowRunsQuery): Promise<number>;
    private countActiveRunsForStatus;
    private withTransientErrorRetry;
    private isTransientError;
    private extractWorkflowRuns;
    private isActivePreviousRun;
}
