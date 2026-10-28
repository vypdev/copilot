export interface PreviousWorkflowRunsQuery {
    owner: string;
    repository: string;
    currentRunId: number;
    /** Workflow file name accepted by GitHub to scope the queue query. */
    workflowIdentifier?: string;
    /** GitHub-provided executing workflow metadata; never an opt-out flag. */
    nativeCoordination?: NativeWorkflowCoordinationContext;
}

export interface NativeWorkflowCoordinationContext {
    readonly workflowRef: string;
    readonly workflowRevision: string;
    readonly jobId: string;
    readonly eventName: string;
    readonly ref?: string;
    readonly pullRequestNumber?: number;
    readonly issueNumber?: number;
}

export interface NativeWorkflowCoordinationQueryPort {
    isCoordinated(query: PreviousWorkflowRunsQuery, context: WorkflowQueueRequestContext): Promise<boolean>;
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
    nativeCoordinationVerified?(): void;
    noActivePreviousRuns(): void;
    waitingForPreviousRuns(activeRunCount: number, delayMilliseconds: number): void;
    providerRetry?(observation: WorkflowProviderRetryObservation): void;
}
