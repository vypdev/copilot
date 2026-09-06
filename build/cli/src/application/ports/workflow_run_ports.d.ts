export interface PreviousWorkflowRunsQuery {
    owner: string;
    repository: string;
    currentRunId: number;
    /** Workflow file name accepted by GitHub to scope the queue query. */
    workflowIdentifier?: string;
}
export interface WorkflowQueueRequestContext {
    deadlineAtMilliseconds: number;
}
export interface PreviousWorkflowRunsQueryPort {
    countActivePreviousRuns(query: PreviousWorkflowRunsQuery, context: WorkflowQueueRequestContext): Promise<number>;
}
export interface WorkflowPollingDelayPort {
    wait(milliseconds: number): Promise<void>;
}
export interface WorkflowQueueClockPort {
    nowMilliseconds(): number;
}
export interface WorkflowPollingRandomPort {
    next(): number;
}
export interface WorkflowProviderRetryObservation {
    reason: 'rate_limit' | 'transient';
    attempt: number;
    delayMilliseconds: number;
    resetEpochSeconds?: number;
}
export interface WorkflowPollingObserverPort {
    noActivePreviousRuns(): void;
    waitingForPreviousRuns(activeRunCount: number, delayMilliseconds: number): void;
    providerRetry?(observation: WorkflowProviderRetryObservation): void;
}
