import { expect, it, vi } from 'vitest';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { temporaryStoreFixture as fixture } from '../fixtures/temporary_pause_store.ts';
import { deferred } from '../fixtures/runtime.ts';

it('performs exactly one native write and canonical observation, keeping source preferences outside the record', async () => {
    const h = fixture(); expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: true });
    expect(h.port.set).toHaveBeenCalledExactlyOnceWith(TEMPORARY_PAUSES_KEY, h.after); expect(h.port.get).toHaveBeenCalledTimes(2);
    expect(h.guard.blocked).toBe(false); expect(h.guard.uncertain).toBe(false); expect(h.port.remove).not.toHaveBeenCalled();
});
it('inspects a missing key without writing defaults or clearing a precaution', async () => {
    const h = fixture(); h.values.delete(TEMPORARY_PAUSES_KEY); h.guard.settle(h.guard.hold()!, true);
    expect(await h.store.inspect()).toMatchObject({ loaded: { state: 'ready', value: h.before }, precaution: true, pending: false });
    expect(h.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
it.each([
    ['invalid before', null, { schemaVersion: 1, revision: 1, emergency: true, tabs: [] }],
    ['invalid after', { schemaVersion: 1, revision: 0, emergency: false, tabs: [] }, null],
    ['unchanged scopes', { schemaVersion: 1, revision: 0, emergency: false, tabs: [] }, { schemaVersion: 1, revision: 1, emergency: false, tabs: [] }],
    ['skipped revision', { schemaVersion: 1, revision: 0, emergency: false, tabs: [] }, { schemaVersion: 1, revision: 2, emergency: true, tabs: [] }],
    ['exhausted revision', { schemaVersion: 1, revision: Number.MAX_SAFE_INTEGER, emergency: false, tabs: [] }, { schemaVersion: 1, revision: Number.MAX_SAFE_INTEGER, emergency: true, tabs: [] }],
])('rejects %s without an effect or volatile hold', async (_, before, after) => {
    const h = fixture(); expect(await h.store.commit(before, after, h.current)).toEqual({ state: 'invalid' });
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.guard.blocked).toBe(false); expect(h.ports.changed).not.toHaveBeenCalled();
});
it('allows a tab-only delta and compares all source fields, not only the revision', async () => {
    const h = fixture(); const after = { ...h.before, revision: 1, tabs: [7] };
    expect(await h.store.commit(h.before, after, h.current)).toMatchObject({ state: 'committed' });
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(after);
    const other = fixture(); other.values.set(TEMPORARY_PAUSES_KEY, { ...other.before, emergency: true });
    expect(await other.store.commit(other.before, other.after, other.current)).toEqual({ state: 'conflict' }); expect(other.port.set).not.toHaveBeenCalled();
});
it('detaches both reviewed snapshots before queued work without freezing the caller', async () => {
    const h = fixture(); const request = h.store.commit(h.before, h.after, h.current); h.before.tabs.push(9); h.after.emergency = false;
    expect(await request).toMatchObject({ state: 'committed' }); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toMatchObject({ emergency: true, tabs: [] });
    expect(Object.isFrozen(h.before)).toBe(false); expect(Object.isFrozen(h.after)).toBe(false);
});
it.each(['future', 'corrupt', 'unavailable'] as const)('preserves a %s native document before any write', async state => {
    const h = fixture();
    if (state === 'unavailable') vi.mocked(h.port.get).mockRejectedValue(new Error('native-unavailable'));
    else h.values.set(TEMPORARY_PAUSES_KEY, state === 'future' ? { schemaVersion: 9 } : null);
    const original = h.values.get(TEMPORARY_PAUSES_KEY); expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state });
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(original); expect(h.port.set).not.toHaveBeenCalled(); expect(h.guard.uncertain).toBe(false);
});
it('a protection refusal is unavailable and cannot fall back to an ordinary store', async () => {
    const h = fixture(); h.ports.protectedArea.mockResolvedValue(false);
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'unavailable' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['false', 'throw'] as const)('a %s source before reservation cannot create a precaution or inspect storage', async state => {
    const h = fixture(); if (state === 'false') h.retire(); else h.current.mockImplementation(() => { throw new Error('source-gone'); });
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'stale' }); expect(h.guard.blocked).toBe(false); expect(h.port.get).not.toHaveBeenCalled();
});
it('source loss during protected observation retires the plan without a native attempt', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const request = h.store.commit(h.before, h.after, h.current); expect(h.guard.blocked).toBe(true);
    await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.retire(); pending.resolve(h.before);
    expect(await request).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled(); expect(h.guard.blocked).toBe(false);
});
it('a final source recheck precedes the native attempt even when the preceding callback retired it', async () => {
    const h = fixture(); h.current.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a lost acknowledgement and matching canonical observation remain separate facts', async () => {
    const h = fixture(); const original = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await original(key, value); throw new Error('ack-lost'); });
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'committed', revision: 1, acknowledgement: 'unknown', current: true });
    expect(h.port.set).toHaveBeenCalledTimes(1); expect(h.guard.blocked).toBe(false);
});
it.each(['sync', 'async'] as const)('a %s failed attempt is inspected once and retains uncertainty without retrying', async stage => {
    const h = fixture(); if (stage === 'sync') vi.mocked(h.port.set).mockImplementation(() => { throw new Error('write-failed'); });
    else vi.mocked(h.port.set).mockRejectedValue(new Error('write-failed'));
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'unknown', acknowledgement: 'unknown', observation: 'different', observedRevision: 0, current: true });
    expect(h.port.set).toHaveBeenCalledTimes(1); expect(h.guard.uncertain).toBe(true); expect(await h.reader.read()).toEqual({ state: 'unavailable' });
});
it('an accepted no-op write is not success and does not release the precaution', async () => {
    const h = fixture(); vi.mocked(h.port.set).mockResolvedValue(undefined);
    expect(await h.store.commit(h.before, h.after, h.current)).toMatchObject({ state: 'unknown', acknowledgement: 'accepted', observation: 'different', observedRevision: 0 }); expect(h.guard.blocked).toBe(true);
});
it.each(['exception', 'future', 'corrupt', 'unprotected'] as const)('a final %s observation does not certify the accepted write', async stage => {
    const h = fixture(); const original = vi.mocked(h.port.get).getMockImplementation()!; let reads = 0;
    if (stage === 'unprotected') h.ports.protectedArea.mockResolvedValueOnce(true).mockResolvedValue(false);
    else vi.mocked(h.port.get).mockImplementation(key => ++reads === 2 ? stage === 'exception' ? Promise.reject(new Error('lost'))
        : Promise.resolve(stage === 'future' ? { schemaVersion: 9 } : null) : original(key));
    expect(await h.store.commit(h.before, h.after, h.current)).toMatchObject({ state: 'unknown', acknowledgement: 'accepted', observation: 'unavailable', observedRevision: null });
    expect(h.guard.uncertain).toBe(true); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a confirmed effect after source loss survives as a fact without becoming current authority', async () => {
    const h = fixture(); const original = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await original(key, value); h.retire(); });
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: false }); expect(h.guard.uncertain).toBe(true);
});
it('secondary notification failure cannot erase a completed native effect', async () => {
    const h = fixture(); h.ports.changed.mockImplementation(() => { throw new Error('view-failed'); });
    expect(await h.store.commit(h.before, h.after, h.current)).toMatchObject({ state: 'committed', current: true }); expect(h.guard.blocked).toBe(false);
});
it('a successful later write never silently clears an earlier precaution', async () => {
    const h = fixture(); h.guard.settle(h.guard.hold()!, true);
    expect(await h.store.commit(h.before, h.after, h.current)).toMatchObject({ state: 'committed' }); expect(h.guard.uncertain).toBe(true);
});
