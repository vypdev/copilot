import type { PreviousWorkflowRunsQuery, PreviousWorkflowRunsQueryPort, WorkflowPollingDelayPort, WorkflowPollingObserverPort } from '../../ports/workflow_run_ports';
import type { ParamUseCase } from '../base/param_usecase';
export interface WorkflowPollingPolicy {
    maximumAttempts: number;
    delayMilliseconds: number;
}
export declare class WaitForPreviousWorkflowRunsUseCase implements ParamUseCase<PreviousWorkflowRunsQuery, void> {
    private readonly queryPort;
    private readonly delayPort;
    private readonly observerPort;
    private readonly policy;
    taskId: string;
    constructor(queryPort: PreviousWorkflowRunsQueryPort, delayPort: WorkflowPollingDelayPort, observerPort: WorkflowPollingObserverPort, policy?: WorkflowPollingPolicy);
    invoke(query: PreviousWorkflowRunsQuery): Promise<void>;
}
