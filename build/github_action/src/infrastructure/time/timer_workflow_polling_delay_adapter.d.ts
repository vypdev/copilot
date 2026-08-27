import type { WorkflowPollingDelayPort } from '../../application/ports/workflow_run_ports';
export declare class TimerWorkflowPollingDelayAdapter implements WorkflowPollingDelayPort {
    wait(milliseconds: number): Promise<void>;
}
