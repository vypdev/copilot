export interface PreviousWorkflowRunsQuery {
    owner: string;
    repository: string;
    currentRunId: number;
    workflowName: string;
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
