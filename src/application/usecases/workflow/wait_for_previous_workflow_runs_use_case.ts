import type {
    PreviousWorkflowRunsQuery,
    PreviousWorkflowRunsQueryPort,
    WorkflowPollingDelayPort,
    WorkflowPollingObserverPort,
    WorkflowPollingRandomPort,
    WorkflowQueueClockPort,
} from '../../ports/workflow_run_ports';
import {
    calculateWorkflowPollingDelay,
    WORKFLOW_QUEUE_POLICY,
    type WorkflowPollingPolicy,
} from '../../policies/workflow_queue_policy';
import type { ParamUseCase } from '../base/param_usecase';

const SYSTEM_CLOCK: WorkflowQueueClockPort = { nowMilliseconds: () => Date.now() };
const SYSTEM_RANDOM: WorkflowPollingRandomPort = { next: () => Math.random() };

export class WaitForPreviousWorkflowRunsUseCase implements ParamUseCase<PreviousWorkflowRunsQuery, void> {
    taskId = 'WaitForPreviousWorkflowRunsUseCase';

    constructor(
        private readonly queryPort: PreviousWorkflowRunsQueryPort,
        private readonly delayPort: WorkflowPollingDelayPort,
        private readonly observerPort: WorkflowPollingObserverPort,
        private readonly policy: WorkflowPollingPolicy = WORKFLOW_QUEUE_POLICY,
        private readonly clock: WorkflowQueueClockPort = SYSTEM_CLOCK,
        private readonly random: WorkflowPollingRandomPort = SYSTEM_RANDOM,
    ) {}

    async invoke(query: PreviousWorkflowRunsQuery): Promise<void> {
        const deadlineAtMilliseconds = this.clock.nowMilliseconds() + this.policy.maximumQueueWaitMilliseconds;
        let pollIndex = 0;

        while (true) {
            if (this.clock.nowMilliseconds() >= deadlineAtMilliseconds) {
                throw new Error('Timeout waiting for previous runs to finish.');
            }
            const activeRunCount = await this.queryPort.countActivePreviousRuns(query, {
                deadlineAtMilliseconds,
            });
            if (this.clock.nowMilliseconds() >= deadlineAtMilliseconds) {
                throw new Error('Timeout waiting for previous runs to finish.');
            }
            if (activeRunCount === 0) {
                this.observerPort.noActivePreviousRuns();
                return;
            }

            const delayMilliseconds = calculateWorkflowPollingDelay(
                pollIndex,
                this.random.next(),
                this.policy,
            );
            if (this.clock.nowMilliseconds() + delayMilliseconds >= deadlineAtMilliseconds) {
                throw new Error('Timeout waiting for previous runs to finish.');
            }
            this.observerPort.waitingForPreviousRuns(activeRunCount, delayMilliseconds);
            await this.delayPort.wait(delayMilliseconds);
            pollIndex += 1;
        }
    }
}
