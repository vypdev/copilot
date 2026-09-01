import type { WorkflowQueueClockPort } from '../../application/ports/workflow_run_ports';
export declare class SystemWorkflowQueueClockAdapter implements WorkflowQueueClockPort {
    nowMilliseconds(): number;
}
