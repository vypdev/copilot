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
  workflowIdentifier: 'copilot_issue.yml',
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
  it('delegates to proven native coordination without enumerating or waiting for queued predecessors', async () => {
    const predecessors = { countActivePreviousRuns: jest.fn().mockResolvedValue(1) };
    const native = { isCoordinated: jest.fn().mockResolvedValue(true) };
    const delay = { wait: jest.fn() };
    const observed = { ...observer(), nativeCoordinationVerified: jest.fn() };
    await new WaitForPreviousWorkflowRunsUseCase(predecessors, delay, observed, undefined,
      { nowMilliseconds: () => 0 }, undefined, native).invoke(query);
    expect(native.isCoordinated).toHaveBeenCalledWith(query, { deadlineAtMilliseconds: 5400000 });
    expect(predecessors.countActivePreviousRuns).not.toHaveBeenCalled();
    expect(delay.wait).not.toHaveBeenCalled();
    expect(observed.nativeCoordinationVerified).toHaveBeenCalledTimes(1);
    expect(observed.noActivePreviousRuns).not.toHaveBeenCalled();
  });

  it('keeps the predecessor fence when native proof is absent and inspects proof only once', async () => {
    const predecessors = { countActivePreviousRuns: jest.fn().mockResolvedValueOnce(1).mockResolvedValue(0) };
    const native = { isCoordinated: jest.fn().mockResolvedValue(false) };
    const delay = { wait: jest.fn() };
    await new WaitForPreviousWorkflowRunsUseCase(predecessors, delay, observer(), undefined,
      { nowMilliseconds: () => 0 }, { next: () => 0.5 }, native).invoke(query);
    expect(predecessors.countActivePreviousRuns).toHaveBeenCalledTimes(2);
    expect(delay.wait).toHaveBeenCalledWith(5000);
    expect(native.isCoordinated).toHaveBeenCalledTimes(1);
  });

  it('propagates proof errors without treating the predecessor queue as empty', async () => {
    const predecessors = { countActivePreviousRuns: jest.fn() };
    const native = { isCoordinated: jest.fn().mockRejectedValue(new Error('denied')) };
    await expect(new WaitForPreviousWorkflowRunsUseCase(predecessors, { wait: jest.fn() }, observer(),
      undefined, { nowMilliseconds: () => 0 }, undefined, native).invoke(query)).rejects.toThrow('denied');
    expect(predecessors.countActivePreviousRuns).not.toHaveBeenCalled();
  });

  it('includes native proof in the absolute queue deadline', async () => {
    let now = 0;
    const predecessors = { countActivePreviousRuns: jest.fn() };
    const native = { isCoordinated: jest.fn(async () => { now = 100; return true; }) };
    await expect(new WaitForPreviousWorkflowRunsUseCase(predecessors, { wait: jest.fn() }, observer(),
      policy({ maximumQueueWaitMilliseconds: 100 }), { nowMilliseconds: () => now }, undefined, native)
      .invoke(query)).rejects.toThrow('Timeout');
    expect(predecessors.countActivePreviousRuns).not.toHaveBeenCalled();
  });

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
