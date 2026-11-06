import { expect, it, vi } from 'vitest';
import { SessionPreferencesStore } from '../../src/application/session_preferences_store.ts';
import { SESSION_PREFERENCES_KEY, SessionPreferencesReader } from '../../src/application/session_preferences_reader.ts';
import { EMPTY_SESSION_PREFERENCES, planSessionPreferences } from '../../src/domain/session_preferences.ts';
import { TemporaryPauseGuard } from '../../src/application/temporary_pause_guard.ts';
import { memoryStore, deferred } from '../fixtures/runtime.ts';
import { SESSION_PREFERENCE_SCOPE as scope } from '../fixtures/session_preferences.ts';
import { namedSessionsFixture, CONNECTION_INPUT } from '../fixtures/named_sessions.ts';

function desired(density: 'compact' | 'comfortable' = 'compact') {
    const plan = planSessionPreferences(EMPTY_SESSION_PREFERENCES, scope, { type: 'replace', preferences: { density } }, 0);
    if (plan.state !== 'ready') throw new Error('fixture-plan-unavailable'); return plan.after;
}
function fixture() {
    const h = memoryStore(); const protectedArea = vi.fn(async () => true); const changed = vi.fn();
    const store = new SessionPreferencesStore(h.port, { protectedArea, changed }); const current = vi.fn(() => true); const preflight = vi.fn(async () => true);
    const reader = new SessionPreferencesReader(h.port, protectedArea, () => store.guard.condition);
    return { ...h, store, current, preflight, protectedArea, changed, reader, commit: () => store.commit(EMPTY_SESSION_PREFERENCES, desired(), current, preflight) };
}
it('one protected submission and canonical read produce independent acknowledgement/current facts and release only this owner guard', async () => {
    const h = fixture(); const conditions: string[] = []; h.changed.mockImplementation(() => conditions.push(h.store.guard.condition));
    expect(await h.commit()).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: true });
    expect(h.values.get(SESSION_PREFERENCES_KEY)).toEqual(desired()); expect(h.port.set).toHaveBeenCalledTimes(1); expect(h.preflight).toHaveBeenCalledOnce(); expect(conditions).toEqual(['pending', 'clear']);
});
it('lost native acknowledgement is not a failed save when exact readback agrees, and no second write is made', async () => {
    const h = fixture(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await set(key, value); throw new Error('private lost acknowledgement'); });
    expect(await h.commit()).toEqual({ state: 'committed', revision: 1, acknowledgement: 'unknown', current: true }); expect(h.port.set).toHaveBeenCalledOnce(); expect(h.store.guard.uncertain).toBe(false);
});
it('accepted native no-op remains unknown and inspection does not adopt it; an explicit reviewed adoption changes only the guard', async () => {
    const h = fixture(); vi.mocked(h.port.set).mockResolvedValue(undefined);
    expect(await h.commit()).toEqual({ state: 'unknown', acknowledgement: 'accepted', observation: 'different', observedRevision: 0, current: true });
    expect(h.store.guard.condition).toBe('precaution'); const inspection = await h.store.inspect(); expect(inspection.loaded).toEqual({ state: 'ready', value: EMPTY_SESSION_PREFERENCES });
    expect(await h.reader.read()).toEqual({ state: 'unavailable' }); expect(h.store.guard.uncertain).toBe(true);
    expect(await h.store.reconcile(EMPTY_SESSION_PREFERENCES, inspection.witness, h.current, h.preflight)).toEqual({ state: 'reconciled', revision: 0, current: true });
    expect(h.store.guard.uncertain).toBe(false); expect(h.port.set).toHaveBeenCalledOnce();
});
it('a missing post-write observation preserves the actual desired record and retains precaution instead of guessing success or repeating', async () => {
    const h = fixture(); const read = vi.mocked(h.port.get).getMockImplementation()!; let reads = 0;
    vi.mocked(h.port.get).mockImplementation(async key => { if (++reads === 2) throw new Error('private readback failure'); return read(key); });
    expect(await h.commit()).toMatchObject({ state: 'unknown', acknowledgement: 'accepted', observation: 'unavailable', observedRevision: null });
    expect(h.values.get(SESSION_PREFERENCES_KEY)).toEqual(desired()); expect(h.port.set).toHaveBeenCalledOnce(); expect(h.store.guard.uncertain).toBe(true);
});
it('a source retiring during a real native attempt keeps the factual commit separate from its lost current authority', async () => {
    const h = fixture(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await set(key, value); h.current.mockReturnValue(false); });
    expect(await h.commit()).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: false }); expect(h.store.guard.uncertain).toBe(true);
});
it.each(['stale', 'failed'] as const)('a %s binding preflight cannot submit a native change or invent a new unknown write', async state => {
    const h = fixture(); if (state === 'stale') h.preflight.mockResolvedValue(false); else h.preflight.mockRejectedValue(new Error('private native source failure'));
    expect(await h.commit()).toEqual({ state: state === 'stale' ? 'stale' : 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled(); expect(h.store.guard.blocked).toBe(false);
});
it.each([{ schemaVersion: 2 }, { schemaVersion: 1 }])('unknown native document %j is preserved rather than overwritten by a review of absence', async value => {
    const h = fixture(); h.values.set(SESSION_PREFERENCES_KEY, value); expect(await h.commit()).toEqual({ state: value.schemaVersion === 2 ? 'future' : 'corrupt' });
    expect(h.values.get(SESSION_PREFERENCES_KEY)).toEqual(value); expect(h.port.set).not.toHaveBeenCalled(); expect(h.store.guard.blocked).toBe(false);
});
it('invalid transitions, no-op revisions and stale or conflicting sources cannot reserve a native effect', async () => {
    const h = fixture(); expect(await h.store.commit(null, desired(), h.current, h.preflight)).toEqual({ state: 'invalid' });
    expect(await h.store.commit(EMPTY_SESSION_PREFERENCES, { ...EMPTY_SESSION_PREFERENCES, revision: 1 }, h.current, h.preflight)).toEqual({ state: 'invalid' });
    h.current.mockReturnValue(false); expect(await h.commit()).toEqual({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled();
    h.current.mockReturnValue(true); h.values.set(SESSION_PREFERENCES_KEY, desired()); expect(await h.commit()).toEqual({ state: 'conflict' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a malformed truthy preflight result is not a positive native source observation', async () => {
    const h = fixture(); expect(await h.store.commit(EMPTY_SESSION_PREFERENCES, desired(), h.current, async () => 'true' as unknown as boolean)).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('native queue capacity is bounded at16 and releasing it cannot replay fifteen stale snapshots after the first write', async () => {
    const h = fixture(); const gate = deferred<boolean>(); h.protectedArea.mockReturnValueOnce(gate.promise);
    const pending = Array.from({ length: 16 }, () => h.commit()); expect(await h.commit()).toEqual({ state: 'busy' }); expect(h.store.guard.pending).toBe(true); gate.resolve(true);
    const results = await Promise.all(pending); expect(results.map(result => result.state)).toEqual(['committed', ...Array(15).fill('conflict')]); expect(h.port.set).toHaveBeenCalledOnce(); expect(h.store.guard.blocked).toBe(false);
});
it('FIFO reservation precedes a reentrant notification so a later intent cannot overtake its admitting native review', async () => {
    const h = fixture(); let entered = false; let nested: ReturnType<typeof h.commit> | undefined;
    h.changed.mockImplementation(() => { if (!entered) { entered = true; nested = h.store.commit(EMPTY_SESSION_PREFERENCES, desired('comfortable'), h.current, h.preflight); } });
    expect(await h.commit()).toMatchObject({ state: 'committed' }); expect(await nested).toEqual({ state: 'conflict' }); expect(h.values.get(SESSION_PREFERENCES_KEY)).toEqual(desired()); expect(h.port.set).toHaveBeenCalledOnce();
});
it('a native selection mutation overtaking the final async preflight blocks submission through the private synchronous source fence', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current); const source = h.connections.capturePreferenceSource();
    const store = new SessionPreferencesStore(h.port, { protectedArea: async () => true, changed: () => undefined }); const entered = deferred<void>(); const gate = deferred<boolean>();
    const committing = store.commit(EMPTY_SESSION_PREFERENCES, desired(), source, async () => { entered.resolve(); return gate.promise; }); await entered.promise;
    expect(await h.connections.change({ type: 'remove', id: 'not-saved' }, 1, h.current)).toEqual({ state: 'invalid' }); gate.resolve(true);
    expect(await committing).toEqual({ state: 'stale' }); expect(h.values.has(SESSION_PREFERENCES_KEY)).toBe(false); expect(store.guard.blocked).toBe(false);
});
it('a temporary-pause witness cannot adopt session preference precaution, and new preference work also retires an old adoption witness', async () => {
    const h = fixture(); h.store.protectUnknown(); const witness = h.store.guard.capture(); const pauses = new TemporaryPauseGuard(); pauses.protect();
    expect(await h.store.reconcile(EMPTY_SESSION_PREFERENCES, pauses.capture(), h.current, h.preflight)).toEqual({ state: 'conflict' }); expect(h.store.guard.uncertain).toBe(true);
    const changed = async () => { h.store.protectUnknown(); return true; };
    expect(await h.store.reconcile(EMPTY_SESSION_PREFERENCES, witness, h.current, changed)).toEqual({ state: 'conflict' }); expect(pauses.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
