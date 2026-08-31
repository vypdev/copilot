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

  it('uses the bounded fallback when Retry-After is non-positive', async () => {
    const operation = jest.fn().mockRejectedValueOnce({ status: 429, response: { headers: { 'retry-after': '0' } } }).mockResolvedValue('ok');
    const deps = dependencies();

    await expect(withWorkflowRunsRetry(operation, deps)).resolves.toBe('ok');
    expect(deps.delayPort.wait).toHaveBeenCalledWith(60000);
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

  it('uses the bounded fallback when x-ratelimit-reset is expired', async () => {
    const operation = jest.fn().mockRejectedValueOnce({
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '12' } },
    }).mockResolvedValue('ok');
    const deps = dependencies({ clock: { nowMilliseconds: jest.fn().mockReturnValue(13_000) } });

    await expect(withWorkflowRunsRetry(operation, deps)).resolves.toBe('ok');
    expect(deps.delayPort.wait).toHaveBeenCalledWith(60000);
  });

  it('classifies a message-based rate-limited 403 and retries it', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce({ status: 403, response: { data: { message: 'You have exceeded the secondary rate limit.' } } })
      .mockResolvedValue('ok');
    const deps = dependencies({
      policy: { ...WORKFLOW_RUNS_RETRY_POLICY, jitterRatio: 0 },
    });

    await expect(withWorkflowRunsRetry(operation, deps)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(deps.delayPort.wait).toHaveBeenCalledWith(60000);
    expect(deps.observer.providerRetry).toHaveBeenCalledWith(expect.objectContaining({ reason: 'rate_limit' }));
  });

  it('uses bounded rate-limit fallback backoff with jitter and a cap', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue('ok');
    const deps = dependencies({
      random: { next: jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValueOnce(1) },
      policy: {
        ...WORKFLOW_RUNS_RETRY_POLICY,
        rateLimitInitialDelayMilliseconds: 100,
        rateLimitMaximumDelayMilliseconds: 250,
        jitterRatio: 0.5,
      },
    });

    await expect(withWorkflowRunsRetry(operation, deps)).resolves.toBe('ok');
    expect(deps.delayPort.wait.mock.calls.map(([delay]: [number]) => delay)).toEqual([50, 250, 250]);
  });

  it('exhausts rate-limit retries independently and preserves the original provider error', async () => {
    const providerError = { status: 429, message: 'rate-limited provider failure' };
    let nowMilliseconds = 0;
    const operation = jest.fn().mockRejectedValue(providerError);
    const deps = dependencies({
      clock: { nowMilliseconds: jest.fn(() => nowMilliseconds) },
      delayPort: { wait: jest.fn(async (delay: number) => { nowMilliseconds += delay; }) },
      deadlineAtMilliseconds: 1_000_000,
    });

    await expect(withWorkflowRunsRetry(operation, deps)).rejects.toBe(providerError);
    expect(operation).toHaveBeenCalledTimes(5);
    expect(deps.delayPort.wait).toHaveBeenCalledTimes(4);
  });

  it('keeps transient and rate-limit backoff counters independent', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue('ok');
    const deps = dependencies();

    await expect(withWorkflowRunsRetry(operation, deps)).resolves.toBe('ok');
    expect(deps.delayPort.wait.mock.calls.map(([delay]: [number]) => delay)).toEqual([1000, 60000]);
    expect(deps.observer.providerRetry.mock.calls.map(([observation]) => observation.attempt)).toEqual([1, 1]);
  });

  it('exhausts transient retries without converting the provider failure to success', async () => {
    const providerError = { statusCode: 503, message: 'transient provider failure' };
    const operation = jest.fn().mockRejectedValue(providerError);
    const deps = dependencies({
      policy: { ...WORKFLOW_RUNS_RETRY_POLICY, maximumAttempts: 3, jitterRatio: 0 },
    });

    await expect(withWorkflowRunsRetry(operation, deps)).rejects.toBe(providerError);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(deps.delayPort.wait.mock.calls.map(([delay]: [number]) => delay)).toEqual([1000, 2000]);
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