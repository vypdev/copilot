import {
  initialProgressRecoveryUsage, spendProgressRecovery, ProgressRecoveryCapacityFailure,
  PROGRESS_RECOVERY_FRAME_LIMITS, PROGRESS_RECOVERY_TOTAL_LIMITS,
  type ProgressRecoveryResource,
} from '../progress_recovery_capacity_policy';

const resources = Object.keys(PROGRESS_RECOVERY_FRAME_LIMITS) as ProgressRecoveryResource[];
it.each(resources)('advances %s automatically without resetting total credit', resource => {
  const first = spendProgressRecovery(initialProgressRecoveryUsage(), resource, PROGRESS_RECOVERY_FRAME_LIMITS[resource]);
  const second = spendProgressRecovery(first, resource, 1);
  expect(second.frames).toBe(2); expect(second.current[resource]).toBe(1);
  expect(second.total[resource]).toBe(PROGRESS_RECOVERY_FRAME_LIMITS[resource] + 1);
  expect(first.frames).toBe(1);
});
it.each(resources)('retains the exact finite total %s boundary', resource => {
  let usage = initialProgressRecoveryUsage();
  for (let frame = 0; frame < 4; frame++) usage = spendProgressRecovery(usage, resource, PROGRESS_RECOVERY_FRAME_LIMITS[resource]);
  expect(usage.frames).toBe(4); expect(usage.total[resource]).toBe(PROGRESS_RECOVERY_TOTAL_LIMITS[resource]);
  expect(() => spendProgressRecovery(usage, resource, 1)).toThrow(expect.objectContaining({ reason: 'total', resource }));
});
it.each(resources)('rejects an indivisible %s claim above one frame', resource => {
  const usage = initialProgressRecoveryUsage();
  expect(() => spendProgressRecovery(usage, resource, PROGRESS_RECOVERY_FRAME_LIMITS[resource] + 1)).toThrow(expect.objectContaining({ reason: 'single-claim', resource }));
  expect(usage.total[resource]).toBe(0);
});
it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid work amount %s without exposing arbitrary data', amount => {
  expect(() => spendProgressRecovery(initialProgressRecoveryUsage(), 'bytes', amount)).toThrow(expect.objectContaining({ reason: 'invalid-claim', resource: 'bytes' }));
});
it('closes the resource vocabulary', () => {
  expect(() => spendProgressRecovery(initialProgressRecoveryUsage(), 'REJECTED_INPUT' as ProgressRecoveryResource, 1)).toThrow(expect.objectContaining({ resource: 'invalid' }));
});
it('does not consume a frame for zero work', () => {
  const usage = initialProgressRecoveryUsage(); expect(spendProgressRecovery(usage, 'bytes', 0)).toBe(usage);
});
it('bounds mixed-resource epoch exhaustion even while global counters still have credit', () => {
  let usage = initialProgressRecoveryUsage();
  usage = spendProgressRecovery(usage, 'files', 64);
  usage = spendProgressRecovery(usage, 'files', 1);
  usage = spendProgressRecovery(usage, 'bytes', 4_194_304);
  usage = spendProgressRecovery(usage, 'bytes', 1);
  usage = spendProgressRecovery(usage, 'files', 64);
  usage = spendProgressRecovery(usage, 'files', 1);
  usage = spendProgressRecovery(usage, 'bytes', 4_194_304);
  expect(usage.frames).toBe(4);
  expect(() => spendProgressRecovery(usage, 'bytes', 1)).toThrow(expect.objectContaining({ reason: 'frames' }));
  expect(usage.frames).toBe(4); expect(usage.total.bytes).toBeLessThan(PROGRESS_RECOVERY_TOTAL_LIMITS.bytes);
});
it('freezes accounting projections and retains closed failure facts', () => {
  const usage = spendProgressRecovery(initialProgressRecoveryUsage(), 'requests', 1);
  expect(Object.isFrozen(usage)).toBe(true); expect(Object.isFrozen(usage.current)).toBe(true); expect(Object.isFrozen(usage.total)).toBe(true);
  const failure = new ProgressRecoveryCapacityFailure('frames', 'requests', usage);
  expect(failure.usage).toBe(usage); expect(failure.message).not.toContain('REJECTED_INPUT');
});
