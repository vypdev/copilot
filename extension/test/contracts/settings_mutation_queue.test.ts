import { expect, it, vi } from 'vitest';
import { SettingsMutationQueue } from '../../src/application/settings_mutation_queue.ts';
import { deferred } from '../fixtures/runtime.ts';

it('reserves only an idle preference queue and returns an immutable nonserializable owned capability', () => {
    const queue = new SettingsMutationQueue(); const held = queue.reserve()!;
    expect(Object.isFrozen(held)).toBe(true); expect(held.current()).toBe(true); expect(queue.reserve()).toBeNull(); held.release(); expect(held.current()).toBe(false);
});
it('a queued mutation waits for release without executing or being reported as canceled', async () => {
    const queue = new SettingsMutationQueue(); const held = queue.reserve()!; const work = vi.fn(async () => 'saved');
    const result = queue.run(work); await Promise.resolve(); await Promise.resolve(); expect(work).not.toHaveBeenCalled();
    held.release(); expect(await result).toBe('saved'); expect(work).toHaveBeenCalledTimes(1);
});
it('refuses a reservation as soon as an operation is admitted, before that operation begins', async () => {
    const queue = new SettingsMutationQueue(); const result = queue.run(async () => 'saved');
    expect(queue.reserve()).toBeNull(); await result; const available = queue.reserve()!; expect(available.current()).toBe(true); available.release();
});
it('does not reserve over an executing native mutation whose outcome is still pending', async () => {
    const queue = new SettingsMutationQueue(); const gate = deferred<number>(); const result = queue.run(() => gate.promise);
    await Promise.resolve(); expect(queue.reserve()).toBeNull(); gate.resolve(3); expect(await result).toBe(3);
    const available = queue.reserve()!; available.release();
});
it('preserves FIFO across the reservation and a mixture of asynchronous and immediately completed work', async () => {
    const queue = new SettingsMutationQueue(); const held = queue.reserve()!; const order: number[] = []; const gate = deferred<void>();
    const first = queue.run(async () => { order.push(1); await gate.promise; order.push(2); });
    const second = queue.run(async () => { order.push(3); }); held.release();
    await Promise.resolve(); await Promise.resolve(); expect(order).toEqual([1]); gate.resolve(); await Promise.all([first, second]); expect(order).toEqual([1, 2, 3]);
});
it('a rejected mutation preserves the next operation and eventually releases pending bookkeeping', async () => {
    const queue = new SettingsMutationQueue(); const failed = queue.run(async () => { throw new Error('native'); });
    const next = queue.run(async () => 2); await expect(failed).rejects.toThrow('native'); expect(await next).toBe(2);
    const held = queue.reserve()!; expect(held.current()).toBe(true); held.release();
});
it('contains a synchronous task exception without poisoning the subsequent queue', async () => {
    const queue = new SettingsMutationQueue(); const failed = queue.run(() => { throw new Error('synchronous'); });
    await expect(failed).rejects.toThrow('synchronous'); expect(await queue.run(async () => 1)).toBe(1);
});
it('an old or repeatedly released capability cannot unlock a new owner', () => {
    const queue = new SettingsMutationQueue(); const first = queue.reserve()!; first.release(); const second = queue.reserve()!;
    first.release(); expect(first.current()).toBe(false); expect(second.current()).toBe(true); expect(queue.reserve()).toBeNull(); second.release(); second.release();
});
