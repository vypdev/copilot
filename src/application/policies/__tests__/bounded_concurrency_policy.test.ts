import { runWithConcurrencyLimit } from '../bounded_concurrency_policy';

describe('bounded concurrency policy', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid limit %s',
    async (limit) => {
      await expect(runWithConcurrencyLimit([], limit)).rejects.toThrow(
        'Concurrency limit must be a positive safe integer.',
      );
    },
  );

  it('never exceeds the limit and preserves task order', async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    const tasks = [0, 1, 2, 3].map((value) => async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return value;
    });

    const result = runWithConcurrencyLimit(tasks, 2);
    await Promise.resolve();
    expect(active).toBe(2);
    releases.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(2);
    releases.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    releases.shift()?.();
    releases.shift()?.();

    await expect(result).resolves.toEqual([0, 1, 2, 3]);
    expect(maximumActive).toBe(2);
  });

  it('returns an empty result without starting workers', async () => {
    await expect(runWithConcurrencyLimit([], 2)).resolves.toEqual([]);
  });

  it('propagates task failures', async () => {
    await expect(runWithConcurrencyLimit([
      async () => 1,
      async () => { throw new Error('provider failed'); },
    ], 1)).rejects.toThrow('provider failed');
  });

  it('does not start queued work after one active task fails', async () => {
    const queued = jest.fn(async () => 3);
    await expect(runWithConcurrencyLimit([
      async () => { throw new Error('provider failed'); },
      async () => 2,
      queued,
    ], 2)).rejects.toThrow('provider failed');

    expect(queued).not.toHaveBeenCalled();
  });

  it('drains already active work before exposing a failure', async () => {
    let releaseActive!: () => void;
    const active = new Promise<void>((resolve) => { releaseActive = resolve; });
    let rejected = false;
    const run = runWithConcurrencyLimit([
      async () => { throw new Error('provider failed'); },
      async () => { await active; return 2; },
    ], 2).catch((error: unknown) => {
      rejected = true;
      throw error;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(rejected).toBe(false);
    releaseActive();
    await expect(run).rejects.toThrow('provider failed');
  });

  it('retains the first failure while draining another failing active task', async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const second = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const run = runWithConcurrencyLimit([
      async () => { await first; throw new Error('first failure'); },
      async () => { await second; throw new Error('second failure'); },
    ], 2);

    releaseFirst();
    await Promise.resolve();
    await Promise.resolve();
    releaseSecond();
    await expect(run).rejects.toThrow('first failure');
  });
});
