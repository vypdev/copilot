import { expect, it, vi } from 'vitest';
import { protectedMutation } from '../../src/application/protected_mutation.ts';
import { deferred } from '../fixtures/runtime.ts';

it.each([true, false])('a canonical desired-state match %s stays separate from accepted acknowledgement', async observed => {
    const write = vi.fn(async () => undefined); const inspect = vi.fn(async () => observed);
    const result = await protectedMutation(write, inspect); expect(result).toEqual({ acknowledgement: 'accepted', observation: observed ? 'committed' : 'different' });
    expect(write).toHaveBeenCalledOnce(); expect(inspect).toHaveBeenCalledOnce(); expect(Object.isFrozen(result)).toBe(true);
});
it.each(['sync', 'async'])('a %s native failure still permits one canonical inspection and never repeats the effect', async mode => {
    const write = vi.fn(() => { if (mode === 'sync') throw new Error('private write'); return Promise.reject(new Error('private write')); });
    const inspect = vi.fn(async () => true); expect(await protectedMutation(write, inspect)).toEqual({ acknowledgement: 'unknown', observation: 'committed' });
    expect(write).toHaveBeenCalledOnce(); expect(inspect).toHaveBeenCalledOnce();
});
it.each(['sync', 'async'])('a %s inspection failure preserves accepted acknowledgement without claiming persistence', async mode => {
    const inspect = vi.fn(() => { if (mode === 'sync') throw new Error('private read'); return Promise.reject(new Error('private read')); });
    const result = await protectedMutation(async () => undefined, inspect);
    expect(result).toEqual({ acknowledgement: 'accepted', observation: 'unavailable' }); expect(JSON.stringify(result)).not.toContain('private'); expect(inspect).toHaveBeenCalledOnce();
});
it('malformed inspection data is unavailable rather than becoming truthy proof or a copied private payload', async () => {
    const result = await protectedMutation(async () => undefined, async () => ({ secret: 'private secret' }));
    expect(result).toEqual({ acknowledgement: 'accepted', observation: 'unavailable' });
});
it('canonical readback waits for the actual native attempt and cannot settle while that attempt remains pending', async () => {
    const gate = deferred<void>(); const inspect = vi.fn(async () => true); const pending = protectedMutation(() => gate.promise, inspect);
    await Promise.resolve(); expect(inspect).not.toHaveBeenCalled(); gate.resolve(); expect(await pending).toMatchObject({ observation: 'committed' }); expect(inspect).toHaveBeenCalledOnce();
});
it('accepted acknowledgement is observed before a delayed canonical read while the primary result stays pending', async () => {
    const gate = deferred<boolean>(); const entered = deferred<void>(); const events: string[] = [];
    const result = protectedMutation(async () => undefined, async () => { entered.resolve(); return gate.promise; }, {
        submitted: () => events.push('submitted'), acknowledged: value => events.push(value), settled: () => events.push('settled'),
    });
    await entered.promise; expect(events).toEqual(['submitted', 'accepted']); gate.resolve(true); await result; expect(events).toEqual(['submitted', 'accepted', 'settled']);
});
it('a failed acknowledgement observer cannot suppress the single canonical read or repeat an accepted write', async () => {
    const write = vi.fn(async () => undefined); const inspect = vi.fn(async () => true);
    const result = await protectedMutation(write, inspect, { submitted: vi.fn(), acknowledged: () => { throw new Error('secondary observer'); }, settled: vi.fn() });
    expect(result).toEqual({ acknowledgement: 'accepted', observation: 'committed' }); expect(write).toHaveBeenCalledOnce(); expect(inspect).toHaveBeenCalledOnce();
});
it('native failure reports unknown acknowledgement before canonical effect inspection without repeating the write', async () => {
    const acknowledged = vi.fn(); const write = vi.fn(async () => { throw new Error('native result lost'); }); const inspect = vi.fn(async () => true);
    expect(await protectedMutation(write, inspect, { submitted: vi.fn(), acknowledged, settled: vi.fn() })).toMatchObject({ acknowledgement: 'unknown', observation: 'committed' });
    expect(acknowledged).toHaveBeenCalledExactlyOnceWith('unknown'); expect(write).toHaveBeenCalledOnce(); expect(inspect).toHaveBeenCalledOnce();
});
