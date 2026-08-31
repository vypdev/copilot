import type {
  PreviousWorkflowRunsQuery,
  PreviousWorkflowRunsQueryPort,
  WorkflowPollingDelayPort,
  WorkflowPollingObserverPort,
  WorkflowPollingRandomPort,
  WorkflowQueueClockPort,
} from '../../../ports/workflow_run_ports';
import { WORKFLOW_QUEUE_POLICY, type WorkflowPollingPolicy } from '../../../policies/workflow_queue_policy';
import { WaitForPreviousWorkflowRunsUseCase } from '../wait_for_previous_workflow_runs_use_case';

const query: PreviousWorkflowRunsQuery = {
  owner: 'org',
  repository: 'repo',
  currentRunId: 200,
  workflowName: 'Copilot - Issue',
};

function observer(): jest.Mocked<WorkflowPollingObserverPort> {
  return {
    noActivePreviousRuns: jest.fn(),
    waitingForPreviousRuns: jest.fn(),
    providerRetry: jest.fn(),
  };
}

function policy(overrides: Partial<WorkflowPollingPolicy> = {}): WorkflowPollingPolicy {
  return { ...WORKFLOW_QUEUE_POLICY, ...overrides };
}

describe('WaitForPreviousWorkflowRunsUseCase', () => {
  it('queries immediately and reports when no previous runs are active', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn().mockResolvedValue(0),
    };
    const delayPort: WorkflowPollingDelayPort = { wait: jest.fn() };
    const observerPort = observer();
    const clock: WorkflowQueueClockPort = { nowMilliseconds: () => 1000 };
    const useCase = new WaitForPreviousWorkflowRunsUseCase(queryPort, delayPort, observerPort, policy(), clock, { next: () => 0.5 });

    await useCase.invoke(query);

    expect(queryPort.countActivePreviousRuns).toHaveBeenCalledWith(query, { deadlineAtMilliseconds: 5401000 });
    expect(delayPort.wait).not.toHaveBeenCalled();
    expect(observerPort.noActivePreviousRuns).toHaveBeenCalledTimes(1);
  });

  it('uses deterministic exponential polling capped at one minute', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
    };
    const delays: number[] = [];
    const delayPort: WorkflowPollingDelayPort = {
      wait: jest.fn(async milliseconds => { delays.push(milliseconds); }),
    };
    const observerPort = observer();
    const useCase = new WaitForPreviousWorkflowRunsUseCase(
      queryPort,
      delayPort,
      observerPort,
      policy({ maximumQueueWaitMilliseconds: 10 * 60 * 1000 }),
      { nowMilliseconds: () => 0 },
      { next: () => 0.5 },
    );

    await useCase.invoke(query);

    expect(delays).toEqual([5000, 10000, 20000]);
    expect(observerPort.waitingForPreviousRuns).toHaveBeenNthCalledWith(1, 2, 5000);
    expect(observerPort.waitingForPreviousRuns).toHaveBeenNthCalledWith(2, 1, 10000);
  });

  it('continues polling through the configured delay cap before observing an empty queue', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
    };
    const delays: number[] = [];
    const delayPort: WorkflowPollingDelayPort = {
      wait: jest.fn(async milliseconds => { delays.push(milliseconds); }),
    };
    const observerPort = observer();
    const useCase = new WaitForPreviousWorkflowRunsUseCase(
      queryPort,
      delayPort,
      observerPort,
      policy({ maximumQueueWaitMilliseconds: 10 * 60 * 1000 }),
      { nowMilliseconds: () => 0 },
      { next: () => 0.5 },
    );

    await useCase.invoke(query);

    expect(delays).toEqual([5000, 10000, 20000, 40000, 60000, 60000, 60000]);
    expect(queryPort.countActivePreviousRuns).toHaveBeenCalledTimes(8);
    expect(observerPort.noActivePreviousRuns).toHaveBeenCalledTimes(1);
  });

  it('applies injected jitter and fails closed at the queue deadline', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn().mockResolvedValue(1),
    };
    const delayPort: WorkflowPollingDelayPort = { wait: jest.fn().mockResolvedValue(undefined) };
    const observerPort = observer();
    let now = 0;
    const clock: WorkflowQueueClockPort = { nowMilliseconds: () => now };
    delayPort.wait = jest.fn(async milliseconds => { now += milliseconds; });
    const useCase = new WaitForPreviousWorkflowRunsUseCase(
      queryPort,
      delayPort,
      observerPort,
      policy({ maximumQueueWaitMilliseconds: 10000 }),
      clock,
      { next: () => 0 },
    );

    await expect(useCase.invoke(query)).rejects.toThrow('Timeout waiting for previous runs to finish.');
    expect(delayPort.wait).toHaveBeenCalledWith(4000);
    expect(observerPort.noActivePreviousRuns).not.toHaveBeenCalled();
  });

  it('does not start a provider query after the deadline', async () => {
    const queryPort: PreviousWorkflowRunsQueryPort = {
      countActivePreviousRuns: jest.fn().mockResolvedValue(0),
    };
    const observerPort = observer();
    await expect(new WaitForPreviousWorkflowRunsUseCase(
      queryPort,
      { wait: jest.fn() },
      observerPort,
      policy({ maximumQueueWaitMilliseconds: 100 }),
      { nowMilliseconds: jest.fn().mockReturnValueOnce(0).mockReturnValue(100) },
      { next: () => 0.5 },
    ).invoke(query)).rejects.toThrow('Timeout waiting for previous runs to finish.');
    expect(queryPort.countActivePreviousRuns).not.toHaveBeenCalled();
  });
});