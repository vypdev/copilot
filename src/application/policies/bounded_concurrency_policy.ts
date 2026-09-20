export async function runWithConcurrencyLimit<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Concurrency limit must be a positive safe integer.");
  }
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let stopped = false;
  let failed = false;
  let firstError: unknown;
  const worker = async (): Promise<void> => {
    while (!stopped && nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        stopped = true;
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  };
  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw firstError;
  return results;
}
