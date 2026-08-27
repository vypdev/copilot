import type {
  PreviousWorkflowRunsQuery,
  PreviousWorkflowRunsQueryPort,
  WorkflowPollingDelayPort,
  WorkflowPollingObserverPort,
} from '../../../ports/workflow_run_ports';
import { WaitForPreviousWorkflowRunsUseCase } from '../wait_for_previous_workflow_runs_use_case';

const query: PreviousWorkflowRunsQuery = {
  owner: 'org',
  repository: 'repo',
  currentRunId: 200,
  workflowName: 'CI',
};

function observer(): jest.Mocked<WorkflowPollingObserverPort> {
  return {
    noActivePreviousRuns: jest.fn(),
    waitingForPreviousRuns: jest.fn(),
  };
}

describe('WaitForPreviousWorkflowRunsUseCase', () => {
  it('returns immediately and reports when no previous runs are active', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn().mockResolvedValue(0),
    };
    const delayPort: WorkflowPollingDelayPort = { wait: jest.fn() };
    const observerPort = observer();
    const useCase = new WaitForPreviousWorkflowRunsUseCase(queryPort, delayPort, observerPort);

    await useCase.invoke(query);

    expect(queryPort.countActivePreviousRuns).toHaveBeenCalledWith(query);
    expect(delayPort.wait).not.toHaveBeenCalled();
    expect(observerPort.noActivePreviousRuns).toHaveBeenCalledTimes(1);
  });

  it('reports and waits between queries until no previous run remains', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
    };
    const delayPort: WorkflowPollingDelayPort = { wait: jest.fn().mockResolvedValue(undefined) };
    const observerPort = observer();
    const useCase = new WaitForPreviousWorkflowRunsUseCase(queryPort, delayPort, observerPort, {
      maximumAttempts: 3,
      delayMilliseconds: 25,
    });

    await useCase.invoke(query);

    expect(queryPort.countActivePreviousRuns).toHaveBeenCalledTimes(3);
    expect(delayPort.wait).toHaveBeenNthCalledWith(1, 25);
    expect(delayPort.wait).toHaveBeenNthCalledWith(2, 25);
    expect(observerPort.waitingForPreviousRuns).toHaveBeenNthCalledWith(1, 2, 25);
    expect(observerPort.waitingForPreviousRuns).toHaveBeenNthCalledWith(2, 1, 25);
    expect(observerPort.noActivePreviousRuns).toHaveBeenCalledTimes(1);
  });

  it('uses the historical two-second polling interval by default', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
    };
    const delayPort: WorkflowPollingDelayPort = { wait: jest.fn().mockResolvedValue(undefined) };
    const observerPort = observer();

    await new WaitForPreviousWorkflowRunsUseCase(queryPort, delayPort, observerPort).invoke(query);

    expect(delayPort.wait).toHaveBeenCalledWith(2000);
    expect(observerPort.waitingForPreviousRuns).toHaveBeenCalledWith(1, 2000);
  });

  it('uses 2000 attempts by default', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn().mockResolvedValue(1),
    };
    const delayPort: WorkflowPollingDelayPort = { wait: jest.fn().mockResolvedValue(undefined) };
    const observerPort = observer();
    const useCase = new WaitForPreviousWorkflowRunsUseCase(queryPort, delayPort, observerPort);

    await expect(useCase.invoke(query)).rejects.toThrow('Timeout waiting for previous runs to finish.');

    expect(queryPort.countActivePreviousRuns).toHaveBeenCalledTimes(2000);
    expect(delayPort.wait).toHaveBeenCalledTimes(2000);
    expect(delayPort.wait).toHaveBeenCalledWith(2000);
  });

  it('throws after the configured maximum number of active queries', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn().mockResolvedValue(1),
    };
    const delayPort: WorkflowPollingDelayPort = { wait: jest.fn().mockResolvedValue(undefined) };
    const observerPort = observer();
    const useCase = new WaitForPreviousWorkflowRunsUseCase(queryPort, delayPort, observerPort, {
      maximumAttempts: 3,
      delayMilliseconds: 25,
    });

    await expect(useCase.invoke(query)).rejects.toThrow(
      'Timeout waiting for previous runs to finish.',
    );
    expect(queryPort.countActivePreviousRuns).toHaveBeenCalledTimes(3);
    expect(delayPort.wait).toHaveBeenCalledTimes(3);
    expect(observerPort.waitingForPreviousRuns).toHaveBeenCalledTimes(3);
  });
});
