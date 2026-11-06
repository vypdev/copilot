import { expect, it, vi } from 'vitest';
import { TemporaryPauseReader, TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import type { TemporaryPauseCondition } from '../../src/domain/temporary_pause_observation.ts';
import { DEFAULT_TEMPORARY_PAUSES } from '../../src/domain/temporary_pauses.ts';
import { memoryStore, deferred } from '../fixtures/runtime.ts';

function fixture() {
    const store = memoryStore(); let condition: boolean | TemporaryPauseCondition = false;
    const protectedArea = vi.fn(async () => true); const restricted = vi.fn(() => condition);
    const reader = new TemporaryPauseReader(store.port, protectedArea, restricted);
    return { ...store, reader, protectedArea, restricted, condition: (value: boolean | TemporaryPauseCondition) => { condition = value; } };
}
it.each([false, 'clear'] as const)('an explicitly %s worker allows a protected read of the canonical native record without any native mutation', async condition => {
    const h = fixture(); h.condition(condition); expect(await h.reader.observe()).toEqual({ condition: 'clear', loaded: { state: 'ready', value: DEFAULT_TEMPORARY_PAUSES } });
    expect(h.protectedArea).toHaveBeenCalledOnce(); expect(h.port.get).toHaveBeenCalledExactlyOnceWith(TEMPORARY_PAUSES_KEY); expect(h.port.set).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled();
});
it.each(['pending', 'precaution', 'pending-precaution', 'unavailable', true] as const)('a %s worker observation blocks even native prerequisite IO without misattributing the restriction', async condition => {
    const h = fixture(); h.condition(condition); const result = await h.reader.observe();
    expect(result).toEqual({ condition: condition === true ? 'unavailable' : condition, loaded: { state: 'unavailable' } });
    expect(Object.isFrozen(result)).toBe(true); expect(h.protectedArea).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled();
});
it('a failed worker sampler is explicitly unavailable, never the clear default and never a native storage error leak', async () => {
    const h = fixture(); h.restricted.mockImplementation(() => { throw new Error('private witness'); }); expect(await h.reader.observe()).toEqual({ condition: 'unavailable', loaded: { state: 'unavailable' } }); expect(h.port.get).not.toHaveBeenCalled();
});
it('an unknown callback value cannot bypass the positive worker restriction', async () => {
    const h = fixture(); h.restricted.mockReturnValue('foreign' as TemporaryPauseCondition); expect(await h.reader.observe()).toMatchObject({ condition: 'unavailable' }); expect(h.port.get).not.toHaveBeenCalled();
});
it.each(['pending', 'precaution', 'pending-precaution', 'unavailable'] as const)('a new %s condition during protected-area verification prevents the native read before invocation', async condition => {
    const h = fixture(); const gate = deferred<boolean>(); h.protectedArea.mockReturnValueOnce(gate.promise); const pending = h.reader.observe(); h.condition(condition); gate.resolve(true);
    expect(await pending).toEqual({ condition, loaded: { state: 'unavailable' } }); expect(h.port.get).not.toHaveBeenCalled();
});
it.each(['pending', 'precaution', 'pending-precaution', 'unavailable'] as const)('a new %s condition during native IO discards its old usable snapshot and reports independent worker facts', async condition => {
    const h = fixture(); const gate = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(gate.promise); const pending = h.reader.observe();
    await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.condition(condition); gate.resolve(DEFAULT_TEMPORARY_PAUSES);
    expect(await pending).toEqual({ condition, loaded: { state: 'unavailable' } }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['denied', 'rejected-protection', 'rejected-native'] as const)('%s preserves unknown native availability without inventing a pending or uncertain operation', async failure => {
    const h = fixture(); if (failure === 'denied') h.protectedArea.mockResolvedValue(false);
    else if (failure === 'rejected-protection') h.protectedArea.mockRejectedValue(new Error('private native error'));
    else vi.mocked(h.port.get).mockRejectedValue(new Error('private storage error'));
    expect(await h.reader.observe()).toEqual({ condition: 'clear', loaded: { state: 'unavailable' } }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a native failure cannot erase a precaution acquired while the failed call was pending', async () => {
    const h = fixture(); const gate = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(gate.promise); const pending = h.reader.observe();
    await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.condition('precaution'); gate.reject(new Error('failed'));
    expect(await pending).toEqual({ condition: 'precaution', loaded: { state: 'unavailable' } });
});
it.each([{ state: 'future', raw: { schemaVersion: 99, private: true } }, { state: 'corrupt', raw: { damaged: true } }] as const)('a preserved $state native record stays distinct from worker state and is never repaired', async ({ state, raw }) => {
    const h = fixture(); h.values.set(TEMPORARY_PAUSES_KEY, raw); expect(await h.reader.observe()).toEqual({ condition: 'clear', loaded: { state } });
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(raw); expect(h.port.set).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled();
});
it('legacy admission still receives the same fail-closed load while richer observations remain immutable and detached', async () => {
    const h = fixture(); const native = { ...DEFAULT_TEMPORARY_PAUSES, tabs: [7] }; h.values.set(TEMPORARY_PAUSES_KEY, native);
    const result = await h.reader.observe(); expect(result.loaded).toEqual({ state: 'ready', value: native }); expect(Object.isFrozen(result.loaded)).toBe(true); expect(Object.isFrozen(native)).toBe(false);
    h.condition('pending-precaution'); expect(await h.reader.read()).toEqual({ state: 'unavailable' });
});
