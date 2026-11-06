import { expect, it, vi } from 'vitest';
import { SessionPreferencesStore } from '../../src/application/session_preferences_store.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { EMPTY_SESSION_PREFERENCES as empty } from '../../src/domain/session_preferences.ts';
import { SESSION_PREFERENCE_SCOPE as scope } from '../fixtures/session_preferences.ts';
import { memoryStore, deferred } from '../fixtures/runtime.ts';

function fixture() {
    const h = memoryStore(); const protect = vi.fn(async () => true); const changed = vi.fn();
    const store = new SessionPreferencesStore(h.port, { protectedArea: protect, changed });
    const after = { schemaVersion: 1 as const, revision: 1, scope, preferences: { density: 'compact' as const } };
    return { ...h, store, protect, changed, after, current: vi.fn(() => true), preflight: vi.fn(async () => true) };
}
it('a throwing synchronous source predicate fails closed before native IO or queue admission', async () => {
    const h = fixture(); expect(await h.store.commit(empty, h.after, () => { throw new Error('source'); }, h.preflight)).toEqual({ state: 'stale' });
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled(); expect(h.store.guard.pending).toBe(false);
});
it('source withdrawal before the queued write starts releases its reservation without inspecting or changing the native record', async () => {
    const h = fixture(); let current = true; const operation = h.store.commit(empty, h.after, () => current, h.preflight); current = false;
    expect(await operation).toEqual({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.store.guard.pending).toBe(false);
});
it('source withdrawal during protected native read prevents even the asynchronous submission preflight', async () => {
    const h = fixture(); const gate = deferred<boolean>(); h.protect.mockReturnValueOnce(gate.promise); let current = true;
    const operation = h.store.commit(empty, h.after, () => current, h.preflight); await vi.waitFor(() => expect(h.protect).toHaveBeenCalled()); current = false; gate.resolve(true);
    expect(await operation).toEqual({ state: 'stale' }); expect(h.preflight).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('an independently exhausted guard cannot be bypassed by an otherwise empty submission queue', async () => {
    const h = fixture(); const tokens = Array.from({ length: 16 }, () => h.store.guard.hold()!);
    expect(await h.store.commit(empty, h.after, h.current, h.preflight)).toEqual({ state: 'busy' }); expect(h.port.get).not.toHaveBeenCalled();
    for (const token of tokens) h.store.guard.settle(token, false);
});
it.each(['invalid', 'retired'] as const)('an %s adoption request cannot enter native observation or release precaution', async kind => {
    const h = fixture(); h.store.protectUnknown(); const witness = h.store.guard.capture(); if (kind === 'retired') h.current.mockReturnValue(false);
    expect(await h.store.reconcile(kind === 'invalid' ? {} : empty, witness, h.current, h.preflight)).toEqual({ state: kind === 'invalid' ? 'invalid' : 'stale' });
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.store.guard.uncertain).toBe(true);
});
it('adoption without precaution is an observed no-op and makes no native write', async () => {
    const h = fixture(); expect(await h.store.reconcile(empty, h.store.guard.capture(), h.current, h.preflight)).toEqual({ state: 'unchanged' });
    expect(h.preflight).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt', 'unavailable'] as const)('an adoption encountering %s native state preserves it and keeps this owner precaution', async state => {
    const h = fixture(); h.store.protectUnknown(); const witness = h.store.guard.capture();
    if (state === 'unavailable') vi.mocked(h.port.get).mockRejectedValue(new Error('native'));
    else h.values.set(SESSION_PREFERENCES_KEY, state === 'future' ? { schemaVersion: 9 } : { malformed: true });
    expect(await h.store.reconcile(empty, witness, h.current, h.preflight)).toEqual({ state }); expect(h.store.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['queued', 'observing', 'preflight'] as const)('source withdrawal while %s cannot finish an adoption or write native data', async stage => {
    const h = fixture(); h.store.protectUnknown(); const witness = h.store.guard.capture(); const gate = deferred<boolean>(); let current = true;
    if (stage === 'observing') h.protect.mockReturnValueOnce(gate.promise);
    if (stage === 'preflight') h.preflight.mockReturnValueOnce(gate.promise);
    const operation = h.store.reconcile(empty, witness, () => current, h.preflight);
    if (stage !== 'queued') await vi.waitFor(() => expect(stage === 'observing' ? h.protect : h.preflight).toHaveBeenCalled());
    current = false; gate.resolve(true); expect(await operation).toEqual({ state: 'stale' }); expect(h.store.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['false', 'exception', 'new-precaution'] as const)('a %s adoption preflight never clears an unreviewed guard state', async kind => {
    const h = fixture(); h.store.protectUnknown(); const witness = h.store.guard.capture();
    h.preflight.mockImplementation(async () => { if (kind === 'exception') throw new Error('preflight'); if (kind === 'new-precaution') h.store.protectUnknown(); return kind !== 'false'; });
    expect(await h.store.reconcile(empty, witness, h.current, h.preflight)).toEqual({ state: kind === 'false' ? 'stale' : kind === 'exception' ? 'unavailable' : 'conflict' });
    expect(h.store.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
it('the adoption FIFO has its own bounded admission and cannot release a competing earlier state', async () => {
    const h = fixture(); h.store.protectUnknown(); const witness = h.store.guard.capture(); const gate = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(gate.promise);
    const first = h.store.reconcile(empty, witness, h.current, h.preflight); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled());
    const others = Array.from({ length: 15 }, () => h.store.reconcile(empty, witness, h.current, h.preflight));
    expect(await h.store.reconcile(empty, witness, h.current, h.preflight)).toEqual({ state: 'busy' }); gate.resolve(undefined);
    expect(await first).toMatchObject({ state: 'reconciled' }); for (const result of await Promise.all(others)) expect(result.state).toBe('conflict'); expect(h.port.set).not.toHaveBeenCalled();
});
