import { expect, it, vi } from 'vitest';
import { TemporaryPauseGuard } from '../../src/application/temporary_pause_guard.ts';
import { TemporaryPauseReader } from '../../src/application/temporary_pause_reader.ts';
import { temporaryStoreFixture } from '../fixtures/temporary_pause_store.ts';
import { deferred } from '../fixtures/runtime.ts';

it('has no initial pending or uncertain restriction and creates opaque worker-local witnesses', () => {
    const guard = new TemporaryPauseGuard(); expect(guard.blocked).toBe(false); expect(guard.pending).toBe(false); expect(guard.uncertain).toBe(false);
    expect(guard.capture()).toBe(guard.capture()); expect(guard.capture()).not.toBe(new TemporaryPauseGuard().capture());
});
it('bounds outstanding holds at16 and changes the witness only for owned transitions', () => {
    const guard = new TemporaryPauseGuard(); const original = guard.capture(); const tokens = Array.from({ length: 16 }, () => guard.hold()!);
    expect(new Set(tokens).size).toBe(16); expect(guard.pending).toBe(true); expect(guard.blocked).toBe(true); expect(guard.capture()).not.toBe(original);
    const full = guard.capture(); expect(guard.hold()).toBeNull(); expect(guard.capture()).toBe(full);
    guard.settle({}, true); expect(guard.capture()).toBe(full); expect(guard.uncertain).toBe(false);
    for (const token of tokens) guard.settle(token, false); expect(guard.blocked).toBe(false); expect(guard.pending).toBe(false);
});
it('does not release another active hold or an earlier uncertain precaution', () => {
    const guard = new TemporaryPauseGuard(); const first = guard.hold()!; const second = guard.hold()!;
    guard.settle(first, true); expect(guard.pending).toBe(true); expect(guard.uncertain).toBe(true);
    guard.settle(second, false); expect(guard.pending).toBe(false); expect(guard.blocked).toBe(true);
    const witness = guard.capture(); guard.settle(second, false); expect(guard.capture()).toBe(witness); expect(guard.uncertain).toBe(true);
});
it('only the current idle witness can reconcile the precaution', () => {
    const guard = new TemporaryPauseGuard(); const token = guard.hold()!; const pending = guard.capture();
    expect(guard.reconcile(pending)).toBe(false); guard.settle(token, true);
    expect(guard.reconcile(pending)).toBe(false); const current = guard.capture(); expect(guard.reconcile(current)).toBe(true);
    expect(guard.blocked).toBe(false); expect(guard.uncertain).toBe(false); expect(guard.capture()).not.toBe(current);
});
it('a pending guarded native write stops even the protected pause read', async () => {
    const h = temporaryStoreFixture(); h.guard.hold(); expect(await h.reader.read()).toEqual({ state: 'unavailable' });
    expect(h.ports.protectedArea).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled();
});
it('a hold acquired during native observation retires an earlier unpaused answer', async () => {
    const h = temporaryStoreFixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const read = h.reader.read(); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.guard.hold(); pending.resolve(h.before);
    expect(await read).toEqual({ state: 'unavailable' });
});
it('an unavailable guard callback fails closed before native storage', async () => {
    const h = temporaryStoreFixture(); const reader = new TemporaryPauseReader(h.port, h.ports.protectedArea, () => { throw new Error('guard-unavailable'); });
    expect(await reader.read()).toEqual({ state: 'unavailable' }); expect(h.port.get).not.toHaveBeenCalled();
});
