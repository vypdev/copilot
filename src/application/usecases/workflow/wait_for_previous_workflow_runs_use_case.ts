import type {
    PreviousWorkflowRunsQuery,
    PreviousWorkflowRunsQueryPort,
    WorkflowPollingDelayPort,
    WorkflowPollingObserverPort,
} from '../../ports/workflow_run_ports';
import type { ParamUseCase } from '../base/param_usecase';

export interface WorkflowPollingPolicy {
    maximumAttempts: number;
    delayMilliseconds: number;
}

const DEFAULT_POLICY: WorkflowPollingPolicy = {
    maximumAttempts: 2000,
    delayMilliseconds: 2000,
};

export class WaitForPreviousWorkflowRunsUseCase implements ParamUseCase<PreviousWorkflowRunsQuery, void> {
    taskId = 'WaitForPreviousWorkflowRunsUseCase';

    constructor(
        private readonly queryPort: PreviousWorkflowRunsQueryPort,
        private readonly delayPort: WorkflowPollingDelayPort,
        private readonly observerPort: WorkflowPollingObserverPort,
        private readonly policy: WorkflowPollingPolicy = DEFAULT_POLICY,
    ) {}

    async invoke(query: PreviousWorkflowRunsQuery): Promise<void> {
        for (let attempt = 0; attempt < this.policy.maximumAttempts; attempt++) {
            const activeRunCount = await this.queryPort.countActivePreviousRuns(query);
            if (activeRunCount === 0) {
                this.observerPort.noActivePreviousRuns();
                return;
            }

            if (attempt === this.policy.maximumAttempts - 1) break;
            this.observerPort.waitingForPreviousRuns(activeRunCount, this.policy.delayMilliseconds);
            await this.delayPort.wait(this.policy.delayMilliseconds);
        }

        throw new Error('Timeout waiting for previous runs to finish.');
    }
}
