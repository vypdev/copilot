import type { PreviousWorkflowRunsQuery, PreviousWorkflowRunsQueryPort, WorkflowPollingDelayPort, WorkflowPollingObserverPort, WorkflowPollingRandomPort, WorkflowQueueClockPort } from '../../ports/workflow_run_ports';
import { type WorkflowPollingPolicy } from '../../policies/workflow_queue_policy';
import type { ParamUseCase } from '../base/param_usecase';
export declare class WaitForPreviousWorkflowRunsUseCase implements ParamUseCase<PreviousWorkflowRunsQuery, void> {
    private readonly queryPort;
    private readonly delayPort;
    private readonly observerPort;
    private readonly policy;
    private readonly clock;
    private readonly random;
    taskId: string;
    constructor(queryPort: PreviousWorkflowRunsQueryPort, delayPort: WorkflowPollingDelayPort, observerPort: WorkflowPollingObserverPort, policy?: WorkflowPollingPolicy, clock?: WorkflowQueueClockPort, random?: WorkflowPollingRandomPort);
    invoke(query: PreviousWorkflowRunsQuery): Promise<void>;
}
