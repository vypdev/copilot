import { expect, it, vi } from 'vitest';
import { NativeMutationGuard } from '../../src/application/native_mutation_guard.ts';
import { TemporaryPauseGuard } from '../../src/application/temporary_pause_guard.ts';
import { SESSION_PREFERENCES_KEY, SessionPreferencesReader } from '../../src/application/session_preferences_reader.ts';
import { deferred, memoryStore } from '../fixtures/runtime.ts';
import { sessionPreferenceDocument } from '../fixtures/session_preferences.ts';

function fixture() {
    const storage = memoryStore(); const guard = new NativeMutationGuard(); const protectedArea = vi.fn(async () => true);
    const reader = new SessionPreferencesReader(storage.port, protectedArea, () => guard.condition); return { ...storage, guard, protectedArea, reader };
}
it('a canonical protected read retains the exact authored document without writing, and only genuine absence becomes empty', async () => {
    const h = fixture(); expect(await h.reader.read()).toMatchObject({ state: 'ready', value: { scope: null, preferences: {} } });
    h.values.set(SESSION_PREFERENCES_KEY, sessionPreferenceDocument()); expect(await h.reader.observe()).toMatchObject({ condition: 'clear', loaded: { state: 'ready', value: sessionPreferenceDocument() } });
    expect(h.port.set).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled();
});
it.each(['pending', 'precaution', 'both'] as const)('a %s restriction prevents protected/native IO and never exposes an old source snapshot', async condition => {
    const h = fixture(); if (condition !== 'precaution') h.guard.hold(); if (condition !== 'pending') h.guard.protect();
    expect(await h.reader.observe()).toMatchObject({ condition: condition === 'both' ? 'pending-precaution' : condition, loaded: { state: 'unavailable' } });
    expect(h.protectedArea).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled();
});
it.each(['protection', 'native-read'] as const)('a new guard hold during %s retires the observation before another dependent read', async phase => {
    const h = fixture(); const gate = deferred<unknown>();
    if (phase === 'protection') h.protectedArea.mockImplementationOnce(async () => { await gate.promise; return true; }); else vi.mocked(h.port.get).mockReturnValueOnce(gate.promise);
    const reading = h.reader.observe(); await vi.waitFor(() => expect(phase === 'protection' ? h.protectedArea : h.port.get).toHaveBeenCalledOnce()); h.guard.hold(); gate.resolve(sessionPreferenceDocument());
    expect(await reading).toEqual({ condition: 'pending', loaded: { state: 'unavailable' } }); if (phase === 'protection') expect(h.port.get).not.toHaveBeenCalled();
});
it.each(['denied', 'failed-protection', 'failed-read', 'failed-condition'] as const)('the %s source cannot grant access, initialize data or erase the protected record', async kind => {
    const h = fixture(); h.values.set(SESSION_PREFERENCES_KEY, sessionPreferenceDocument());
    if (kind === 'denied') h.protectedArea.mockResolvedValue(false); if (kind === 'failed-protection') h.protectedArea.mockRejectedValue(new Error('private'));
    if (kind === 'failed-read') vi.mocked(h.port.get).mockRejectedValue(new Error('private'));
    const reader = kind === 'failed-condition' ? new SessionPreferencesReader(h.port, h.protectedArea, () => { throw new Error('private'); }) : h.reader;
    expect(await reader.read()).toEqual({ state: 'unavailable' }); expect(h.values.get(SESSION_PREFERENCES_KEY)).toEqual(sessionPreferenceDocument()); expect(h.port.set).not.toHaveBeenCalled();
});
it('session preference adoption and native pause adoption cannot settle, overwrite or reconcile the other owner guard', () => {
    const preferences = new NativeMutationGuard(); const pauses = new TemporaryPauseGuard(); const prefToken = preferences.hold()!; const pauseToken = pauses.hold()!;
    preferences.settle(pauseToken, false); pauses.settle(prefToken, false); expect(preferences.pending).toBe(true); expect(pauses.pending).toBe(true);
    preferences.settle(prefToken, true); pauses.settle(pauseToken, true); const prefWitness = preferences.capture(); const pauseWitness = pauses.capture();
    expect(preferences.reconcile(pauseWitness)).toBe(false); expect(pauses.reconcile(prefWitness)).toBe(false); expect(preferences.reconcile(prefWitness)).toBe(true); expect(pauses.uncertain).toBe(true);
    expect(pauses.reconcile(pauseWitness)).toBe(true); expect(preferences.condition).toBe('clear'); expect(pauses.condition).toBe('clear');
});
it('an invalid process-condition enum from a semantic port is unavailable rather than an assumed clear guard', async () => {
    const h = memoryStore(); const protect = vi.fn(async () => true); const reader = new SessionPreferencesReader(h.port, protect, () => 'foreign' as never);
    expect(await reader.observe()).toEqual({ condition: 'unavailable', loaded: { state: 'unavailable' } }); expect(protect).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled();
});
