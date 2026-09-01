import type { WorkflowPollingRandomPort } from '../../application/ports/workflow_run_ports';

export class SystemWorkflowPollingRandomAdapter implements WorkflowPollingRandomPort {
    next(): number {
        return Math.random();
    }
}