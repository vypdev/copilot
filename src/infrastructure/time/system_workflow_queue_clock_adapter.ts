import type { WorkflowQueueClockPort } from '../../application/ports/workflow_run_ports';

export class SystemWorkflowQueueClockAdapter implements WorkflowQueueClockPort {
    nowMilliseconds(): number {
        return Date.now();
    }
}