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
});
