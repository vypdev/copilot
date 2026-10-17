/** Provider-directed read waits only: at most two waits of 15 seconds per call. */
export function setupBatchRateLimitDelay(headers: Readonly<Record<string, unknown>> | undefined, now: number): number | undefined {
  if (!Number.isFinite(now)) return undefined;
  const retry = headers?.['retry-after'];
  const reset = headers?.['x-ratelimit-reset'];
  let delay: number;
  if (typeof retry === 'string' && /^\d+$/u.test(retry)) delay = Number(retry) * 1000;
  else if (typeof retry === 'string' && /^[A-Za-z]{3}, .* GMT$/u.test(retry)) delay = Date.parse(retry) - now;
  else if (retry === undefined && typeof reset === 'string' && /^\d+$/u.test(reset)) delay = Number(reset) * 1000 - now;
  else return undefined;
  return Number.isFinite(delay) && delay >= 0 && delay <= 15_000 ? Math.max(1000, delay) : undefined;
}
