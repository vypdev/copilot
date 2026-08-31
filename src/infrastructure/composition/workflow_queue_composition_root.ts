import { WaitForPreviousWorkflowRunsUseCase } from '../../application/usecases/workflow/wait_for_previous_workflow_runs_use_case';
import { ActivePreviousWorkflowRunsRepository } from '../../data/repository/workflow/active_previous_workflow_runs_repository';
import { TimerWorkflowPollingDelayAdapter } from '../time/timer_workflow_polling_delay_adapter';
import { LoggerWorkflowPollingObserverAdapter } from '../logging/logger_workflow_polling_observer_adapter';
import { SystemWorkflowQueueClockAdapter } from '../time/system_workflow_queue_clock_adapter';
import { SystemWorkflowPollingRandomAdapter } from '../time/system_workflow_polling_random_adapter';
import { createWorkflowRunsClient } from './github_workflow_client_factory';

export function createWaitForPreviousWorkflowRunsUseCase(token: string): WaitForPreviousWorkflowRunsUseCase {
    const client = createWorkflowRunsClient().getClient(token);
    const delayPort = new TimerWorkflowPollingDelayAdapter();
    const observerPort = new LoggerWorkflowPollingObserverAdapter();

    return new WaitForPreviousWorkflowRunsUseCase(
        new ActivePreviousWorkflowRunsRepository(
            client,
            delayPort,
            undefined,
            new SystemWorkflowQueueClockAdapter(),
            new SystemWorkflowPollingRandomAdapter(),
            observerPort,
        ),
        delayPort,
        observerPort,
    );
}
