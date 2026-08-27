import { WaitForPreviousWorkflowRunsUseCase } from '../../application/usecases/workflow/wait_for_previous_workflow_runs_use_case';
import { ActivePreviousWorkflowRunsRepository } from '../../data/repository/workflow/active_previous_workflow_runs_repository';
import { TimerWorkflowPollingDelayAdapter } from '../time/timer_workflow_polling_delay_adapter';
import { LoggerWorkflowPollingObserverAdapter } from '../logging/logger_workflow_polling_observer_adapter';
import { createWorkflowRunsClient } from './github_workflow_client_factory';

export function createWaitForPreviousWorkflowRunsUseCase(token: string): WaitForPreviousWorkflowRunsUseCase {
    const client = createWorkflowRunsClient().getClient(token);

    return new WaitForPreviousWorkflowRunsUseCase(
        new ActivePreviousWorkflowRunsRepository(client),
        new TimerWorkflowPollingDelayAdapter(),
        new LoggerWorkflowPollingObserverAdapter(),
    );
}
