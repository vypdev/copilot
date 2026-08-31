import { withWorkflowRunsRetry, WORKFLOW_RUNS_RETRY_POLICY, WorkflowQueueDeadlineError } from '../workflow_runs_retry';

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    delayPort: { wait: jest.fn().mockResolvedValue(undefined) },
    clock: { nowMilliseconds: jest.fn().mockReturnValue(0) },
    random: { next: jest.fn().mockReturnValue(0.5) },
    observer: { providerRetry: jest.fn() },
    policy: { ...WORKFLOW_RUNS_RETRY_POLICY, jitterRatio: 0 },
    deadlineAtMilliseconds: 10 * 60 * 1000,
    ...overrides,
  };
}

describe('workflow runs retry policy', () => {
  it.each([
    [{ statusCode: 503 }],
    [{ response: { status: 502 } }],
    [new Error('Server Error')],
    [{ code: 'ECONNREFUSED' }],
  ])('retries transient error %p with bounded backoff', async error => {
    const operation = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');
    const deps = dependencies();

    await expect(withWorkflowRunsRetry(operation, deps)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(deps.delayPort.wait).toHaveBeenCalledWith(1000);
  });

  it('honors numeric Retry-After for 429 without jitter', async () => {
    const operation = jest.fn().mockRejectedValueOnce({ status: 429, response: { headers: { 'retry-after': '7' } } }).mockResolvedValue('ok');
    const deps = dependencies();

    await expect(withWorkflowRunsRetry(operation, deps)).resolves.toBe('ok');
    expect(deps.delayPort.wait).toHaveBeenCalledWith(7000);
    expect(deps.observer.providerRetry).toHaveBeenCalledWith(expect.objectContaining({ reason: 'rate_limit' }));
  });

  it('honors x-ratelimit-reset for a rate-limited 403', async () => {
    const operation = jest.fn().mockRejectedValueOnce({
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '12' } },
    }).mockResolvedValue('ok');
    const deps = dependencies();

    await expect(withWorkflowRunsRetry(operation, deps)).resolves.toBe('ok');
    expect(deps.delayPort.wait).toHaveBeenCalledWith(12000);
    expect(deps.observer.providerRetry).toHaveBeenCalledWith(expect.objectContaining({ resetEpochSeconds: 12 }));
  });

  it('does not retry an unrelated 403 and never converts failures to zero', async () => {
    const operation = jest.fn().mockRejectedValue({ status: 403, message: 'forbidden' });
    const deps = dependencies();

    await expect(withWorkflowRunsRetry(operation, deps)).rejects.toMatchObject({ status: 403 });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(deps.delayPort.wait).not.toHaveBeenCalled();
  });

  it('stops a retry whose delay would cross the absolute queue deadline', async () => {
    const operation = jest.fn().mockRejectedValue({ status: 429, response: { headers: { 'retry-after': '60' } } });
    const deps = dependencies({ deadlineAtMilliseconds: 1000 });

    await expect(withWorkflowRunsRetry(operation, deps)).rejects.toBeInstanceOf(WorkflowQueueDeadlineError);
    expect(deps.delayPort.wait).not.toHaveBeenCalled();
  });
});