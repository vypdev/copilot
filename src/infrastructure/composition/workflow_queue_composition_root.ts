import { WaitForPreviousWorkflowRunsUseCase } from '../../application/usecases/workflow/wait_for_previous_workflow_runs_use_case';
import { ActivePreviousWorkflowRunsRepository } from '../../data/repository/workflow/active_previous_workflow_runs_repository';
import { TimerWorkflowPollingDelayAdapter } from '../time/timer_workflow_polling_delay_adapter';
import { LoggerWorkflowPollingObserverAdapter } from '../logging/logger_workflow_polling_observer_adapter';
import { SystemWorkflowQueueClockAdapter } from '../time/system_workflow_queue_clock_adapter';
import { SystemWorkflowPollingRandomAdapter } from '../time/system_workflow_polling_random_adapter';
import { NativeWorkflowCoordinationRepository } from '../../data/repository/workflow/native_workflow_coordination_repository';
import { getOctokitClient } from '../github/octokit_client_resolver';
import type { GithubWorkflowDefinitionClient, GithubWorkflowRunsClient } from '../github/ports/github_workflow_provider_ports';

export function createWaitForPreviousWorkflowRunsUseCase(token: string): WaitForPreviousWorkflowRunsUseCase {
    const client = getOctokitClient<GithubWorkflowRunsClient & GithubWorkflowDefinitionClient>(token);
    const delayPort = new TimerWorkflowPollingDelayAdapter();
    const observerPort = new LoggerWorkflowPollingObserverAdapter();
    const clock = new SystemWorkflowQueueClockAdapter();
    const random = new SystemWorkflowPollingRandomAdapter();

    return new WaitForPreviousWorkflowRunsUseCase(
        new ActivePreviousWorkflowRunsRepository(
            client,
            delayPort,
            undefined,
            clock,
            random,
            observerPort,
        ),
        delayPort,
        observerPort,
        undefined,
        clock,
        random,
        new NativeWorkflowCoordinationRepository(client, {
            delayPort, clock, random, observer: observerPort,
        }),
    );
}
