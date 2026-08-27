import type { WorkflowPollingDelayPort } from '../../application/ports/workflow_run_ports';

export class TimerWorkflowPollingDelayAdapter implements WorkflowPollingDelayPort {
    async wait(milliseconds: number): Promise<void> {
        await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    }
}
