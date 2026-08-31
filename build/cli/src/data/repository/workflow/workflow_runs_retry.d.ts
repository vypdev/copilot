import type { WorkflowPollingDelayPort, WorkflowPollingObserverPort, WorkflowPollingRandomPort, WorkflowQueueClockPort } from '../../../application/ports/workflow_run_ports';
export interface WorkflowRunsRetryPolicy {
    maximumAttempts: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
    jitterRatio?: number;
    rateLimitInitialDelayMilliseconds?: number;
    rateLimitMaximumDelayMilliseconds?: number;
}
export declare const WORKFLOW_RUNS_RETRY_POLICY: WorkflowRunsRetryPolicy;
export declare class WorkflowQueueDeadlineError extends Error {
    constructor();
}
export interface WorkflowRunsRetryDependencies {
    delayPort: WorkflowPollingDelayPort;
    clock: WorkflowQueueClockPort;
    random: WorkflowPollingRandomPort;
    observer?: Pick<WorkflowPollingObserverPort, 'providerRetry'>;
    policy: WorkflowRunsRetryPolicy;
    deadlineAtMilliseconds: number;
}
export declare function withWorkflowRunsRetry<T>(operation: () => Promise<T>, dependencies: WorkflowRunsRetryDependencies): Promise<T>;
export declare function withWorkflowRunsRetry<T>(operation: () => Promise<T>, delayPort: WorkflowPollingDelayPort, policy: WorkflowRunsRetryPolicy): Promise<T>;
