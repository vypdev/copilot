import { setupBatchRateLimitDelay } from '../setup_batch_retry_policy';
const now = Date.parse('2026-10-17T14:00:00Z');
describe('bounded provider-directed setup read waits', () => {
  it.each([['0', 1000], ['1', 1000], ['15', 15000]])('honors numeric Retry-After %s', (header, expected) => {
    expect(setupBatchRateLimitDelay({ 'retry-after': header }, now)).toBe(expected);
  });
  it('honors HTTP-date Retry-After', () => {
    expect(setupBatchRateLimitDelay({ 'retry-after': 'Sat, 17 Oct 2026 14:00:05 GMT' }, now)).toBe(5000);
  });
  it('uses a bounded reset timestamp when Retry-After is absent', () => {
    expect(setupBatchRateLimitDelay({ 'x-ratelimit-reset': String(now / 1000 + 12) }, now)).toBe(12000);
  });
  it.each([undefined, {}, { 'retry-after': 5 }, { 'retry-after': '-1' }, { 'retry-after': '1.5' },
    { 'retry-after': 'bad' }, { 'retry-after': '60' }, { 'retry-after': 'Sat, 17 Oct 2026 13:59:59 GMT' },
    { 'retry-after': 'Sat, 99 Oct 2026 14:00:05 GMT' }, { 'x-ratelimit-reset': 'invalid' },
    { 'x-ratelimit-reset': String(now / 1000 + 16) }])('pauses without guessing invalid, missing or long waits: %j', headers => {
    expect(setupBatchRateLimitDelay(headers, now)).toBeUndefined();
  });
  it('rejects an unavailable clock instead of deriving a wait', () => {
    expect(setupBatchRateLimitDelay({ 'retry-after': '1' }, NaN)).toBeUndefined();
  });
});
