import { expect, it, vi } from 'vitest';
import { cacheSchedulerFixture, CACHE_SUCCESS } from '../fixtures/cache_scheduler.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';

it('bexh3-cache-C08 clears real cached bodies and ETags without HTTP or changing persisted budgets and cooldowns', async () => {
    const h = cacheSchedulerFixture(); expect(await h.run()).toEqual(CACHE_SUCCESS); h.advance(10001);
    expect(await h.run('response', false)).toEqual(CACHE_SUCCESS); expect(h.reader.read).toHaveBeenCalledOnce();
    const before = JSON.stringify([...h.values]); const writes = vi.mocked(h.port.set).mock.calls.length;
    const witness = h.scheduler.captureApiCache(); expect(Object.isFrozen(witness)).toBe(true); expect(Object.keys(witness)).toEqual([]);
    expect(h.scheduler.clearApiCache(witness, () => true)).toBe(true);
    expect(h.reader.read).toHaveBeenCalledOnce(); expect(h.port.set).toHaveBeenCalledTimes(writes); expect(JSON.stringify([...h.values])).toBe(before);
    expect(h.scheduler.clearApiCache(witness, () => true)).toBe(false);
    expect(await h.run('response', false)).toMatchObject({ state: 'cooldown', retryAt: 170001 });
    expect(h.reader.read).toHaveBeenCalledOnce(); expect(JSON.stringify([...h.values])).toBe(before);
    h.advance(60001); vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'unchanged', bytes: 0 });
    expect(await h.run('response', false)).toMatchObject({ state: 'invalid' }); expect(h.reader.read).toHaveBeenCalledTimes(2);
    expect(vi.mocked(h.reader.read).mock.calls[1][3]).toBeUndefined();
});

it('bexh3-cache-C09 aborts actual shared pending reads and their late responses cannot repopulate a cleared generation', async () => {
    const h = cacheSchedulerFixture(); const pending = deferred<ReadResult>(); const entered = deferred<void>();
    vi.mocked(h.reader.read).mockImplementation(() => { if (vi.mocked(h.reader.read).mock.calls.length === 2) entered.resolve(); return pending.promise; });
    const first = h.run('one'); const second = h.run('two'); await entered.promise;
    const before = JSON.stringify([...h.values]); const witness = h.scheduler.captureApiCache();
    expect(h.scheduler.clearApiCache(witness, () => true)).toBe(true);
    expect(vi.mocked(h.reader.read).mock.calls.every(call => call[2].aborted)).toBe(true);
    expect(h.reader.read).toHaveBeenCalledTimes(2); expect(JSON.stringify([...h.values])).toBe(before);
    pending.resolve(CACHE_SUCCESS); expect(await first).toMatchObject({ state: 'aborted' }); expect(await second).toMatchObject({ state: 'aborted' });
    expect(JSON.stringify([...h.values])).toBe(before);
    h.advance(10001); vi.mocked(h.reader.read).mockResolvedValueOnce(CACHE_SUCCESS);
    expect(await h.run('one', false)).toEqual(CACHE_SUCCESS); expect(h.reader.read).toHaveBeenCalledTimes(3);
    expect(vi.mocked(h.reader.read).mock.calls[2][3]).toBeUndefined();
});

it('bexh3-cache-C10 rejects foreign, retired and synchronously invalidated cache witnesses before an extra clear', () => {
    const h = cacheSchedulerFixture(); const other = cacheSchedulerFixture(); const witness = h.scheduler.captureApiCache(); const guard = vi.fn(() => true);
    expect(other.scheduler.clearApiCache(witness, guard)).toBe(false); expect(h.scheduler.clearApiCache(Object.freeze({}), guard)).toBe(false); expect(guard).not.toHaveBeenCalled();
    expect(h.scheduler.clearApiCache(witness, () => false)).toBe(false); expect(h.scheduler.apiCacheCurrent(witness)).toBe(true);
    expect(h.scheduler.clearApiCache(witness, () => { throw new Error('private source details'); })).toBe(false);
    expect(h.scheduler.apiCacheCurrent(witness)).toBe(true);
    expect(h.scheduler.clearApiCache(witness, () => { h.scheduler.invalidate(); return true; })).toBe(false);
    expect(h.scheduler.apiCacheCurrent(witness)).toBe(false); expect(h.scheduler.clearApiCache(witness, guard)).toBe(false); expect(guard).not.toHaveBeenCalled();
    const current = h.scheduler.captureApiCache(); let nested: boolean | undefined;
    expect(h.scheduler.clearApiCache(current, () => { nested = h.scheduler.clearApiCache(current, () => true); return true; })).toBe(false);
    expect(nested).toBe(true); expect(h.scheduler.apiCacheCurrent(current)).toBe(false);
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
