import type { WorkflowPollingObserverPort } from '../../application/ports/workflow_run_ports';
export declare class LoggerWorkflowPollingObserverAdapter implements WorkflowPollingObserverPort {
    noActivePreviousRuns(): void;
    waitingForPreviousRuns(activeRunCount: number, delayMilliseconds: number): void;
}
