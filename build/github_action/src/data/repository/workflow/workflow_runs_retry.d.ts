import type { WorkflowPollingDelayPort } from '../../../application/ports/workflow_run_ports';
export interface WorkflowRunsRetryPolicy {
    maximumAttempts: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
}
export declare function withWorkflowRunsRetry<T>(operation: () => Promise<T>, delayPort: WorkflowPollingDelayPort, policy: WorkflowRunsRetryPolicy): Promise<T>;
