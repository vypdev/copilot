export interface PreviousWorkflowRunsQuery {
    owner: string;
    repository: string;
    currentRunId: number;
    workflowName: string;
    /** Workflow file name accepted by GitHub to scope the queue query. */
    workflowIdentifier?: string;
    /** All Copilot workflow names share one queue so different event workflows cannot overlap. */
    workflowNames?: readonly string[];
}
export interface PreviousWorkflowRunsQueryPort {
    countActivePreviousRuns(query: PreviousWorkflowRunsQuery): Promise<number>;
}
export interface WorkflowPollingDelayPort {
    wait(milliseconds: number): Promise<void>;
}
export interface WorkflowPollingObserverPort {
    noActivePreviousRuns(): void;
    waitingForPreviousRuns(activeRunCount: number, delayMilliseconds: number): void;
}
