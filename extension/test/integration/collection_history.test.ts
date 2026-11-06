import { expect, it, vi } from 'vitest';
import { collectionHistoryFixture, HISTORY_OWNER } from '../fixtures/collection_history.ts';
import { writerFact } from '../fixtures/journal_writer.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';

it('constructs one owner without storage, native reads or notifications and keeps off collection unprimed', async () => {
    const f = collectionHistoryFixture(); expect(f.port.get).not.toHaveBeenCalled(); expect(f.journals.execute).not.toHaveBeenCalled(); expect(f.policies.execute).not.toHaveBeenCalled();
    expect(f.ports.changed).not.toHaveBeenCalled(); await f.history.refresh(); expect(f.journals.execute).not.toHaveBeenCalled();
    expect(f.history.writer.state('diagnostics').epoch).toBeNull(); expect(f.history.coordinator.state('diagnostics')).toMatchObject({ preference: 'off', collecting: false });
});
it('restores only verified active consent and primes its exact journal epoch before retaining subsequent observations', async () => {
    const f = collectionHistoryFixture(true); await f.history.refresh();
    expect(f.journals.execute).toHaveBeenCalledTimes(2); expect(f.history.writer.state('diagnostics').epoch).toBe(0);
    const ticket = f.history.writer.admit('diagnostics', writerFact(), () => true)!; await f.history.writer.flush(); expect(f.history.writer.retention(ticket)).toBe('stored');
});
it('existing closed history remains readable when preferences are unreadable and admits no new capture', async () => {
    const f = collectionHistoryFixture(true); await f.history.refresh(); f.history.writer.admit('diagnostics', writerFact('settled'), () => true); await f.history.writer.flush();
    f.values.set(SETTINGS_KEY, { schemaVersion: 99 }); const read = await f.history.read('diagnostics', () => true);
    expect(read).toMatchObject({ state: 'ready', collection: { preference: 'unknown', collecting: false }, retained: { state: 'ready', snapshot: { entries: [{ fact: { phase: 'settled' } }] } } });
    expect(f.history.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
});
it('the actual preference repository uses mandatory restriction preflight; unavailable history cannot prevent unrelated saves', async () => {
    const f = collectionHistoryFixture(true); await f.history.refresh();
    vi.mocked(f.journals.execute).mockRejectedValue(new Error('private')); vi.mocked(f.policies.execute).mockRejectedValue(new Error('private'));
    const saved = await f.history.settings.update(value => ({ ...value, density: 'compact' })); expect(saved.density).toBe('compact');
    await f.history.refresh(); const rejected = f.history.writer.admit('diagnostics', writerFact(), () => true); expect(rejected).toBeNull();
    const enabled = await f.history.settings.update(value => ({ ...value, center: { ...value.center, diagnostics: false } })); expect(enabled.center.diagnostics).toBe(false);
    await f.history.refresh(); expect(JSON.stringify(await f.history.read('diagnostics', () => true))).not.toContain('private');
});
it('shares real reviewed collection and clear ownership, with retained history surviving stop until its separate clear', async () => {
    const f = collectionHistoryFixture(); await f.history.read('diagnostics', () => true);
    const start = await f.controls.previewCollection('diagnostics', 'start', HISTORY_OWNER); if (start.state !== 'preview') throw new Error(start.state);
    expect(await f.controls.collection.confirm(start.operationId, HISTORY_OWNER)).toMatchObject({ state: 'settled', reason: 'done', admittedAtObservation: true });
    const ticket = f.history.writer.admit('diagnostics', writerFact('settled'), () => true)!; await f.history.writer.flush();
    const stop = await f.controls.previewCollection('diagnostics', 'stop', HISTORY_OWNER); if (stop.state !== 'preview') throw new Error(stop.state);
    expect(await f.controls.collection.confirm(stop.operationId, HISTORY_OWNER)).toMatchObject({ state: 'settled', reason: 'done' });
    expect(f.history.writer.retention(ticket)).toBe('stored');
    const clear = await f.controls.previewClear('diagnostics', HISTORY_OWNER); if (clear.state !== 'preview') throw new Error(clear.state);
    expect(await f.controls.clear.confirm(clear.operationId, HISTORY_OWNER)).toMatchObject({ state: 'observed-cleared', acknowledgement: 'accepted' });
    expect(f.history.writer.retention(ticket)).toBe('untracked'); expect(await f.history.read('diagnostics', () => true)).toMatchObject({ retained: { snapshot: { entries: [], epoch: 1 } } });
});
it('editor invalidation expires both retained plan families without writing', async () => {
    const f = collectionHistoryFixture(); await f.history.refresh();
    const clear = await f.controls.previewClear('diagnostics', HISTORY_OWNER); const start = await f.controls.previewCollection('recents', 'start', HISTORY_OWNER);
    if (clear.state !== 'preview' || start.state !== 'preview') throw new Error('missing-plan'); f.controls.invalidate();
    expect(await f.controls.clear.confirm(clear.operationId, HISTORY_OWNER)).toMatchObject({ state: 'expired' });
    expect(await f.controls.collection.confirm(start.operationId, HISTORY_OWNER)).toMatchObject({ state: 'expired' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('checks current editor source before IO and after a late history read, without publishing into its replacement', async () => {
    const f = collectionHistoryFixture(); expect(await f.history.read('diagnostics', () => false)).toEqual({ state: 'stale' }); expect(f.policies.execute).not.toHaveBeenCalled();
    let current = true; const entered = deferred<void>(); const release = deferred<void>(); const native = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return native(...args); });
    const reading = f.history.read('diagnostics', () => current); await entered.promise; current = false; release.resolve(); expect(await reading).toEqual({ state: 'stale' });
});
it.each(['future', 'corrupt', 'clock-invalid', 'exhausted', 'invalid'] as const)('keeps %s history state separate from readable preferences', async state => {
    const f = collectionHistoryFixture(); vi.mocked(f.journals.execute).mockResolvedValueOnce({ state });
    expect(await f.history.read('diagnostics', () => true)).toMatchObject({ state: 'ready', collection: { preference: 'off' }, retained: { state: state === 'invalid' ? 'unavailable' : state } });
});
it('closed lifecycle, malformed kinds and invalid time fail safely without authorizing history IO', async () => {
    const f = collectionHistoryFixture(); expect(await f.history.read('foreign' as JournalKind, () => true)).toEqual({ state: 'invalid' });
    f.ports.now.mockReturnValue(NaN); expect(await f.history.read('diagnostics', () => true)).toEqual({ state: 'unavailable' }); expect(f.journals.execute).not.toHaveBeenCalled();
    f.history.stop(); await f.history.refresh(); expect(await f.history.read('recents', () => true)).toEqual({ state: 'stale' });
});
it('source retirement during the policy refresh prevents even starting a history read', async () => {
    const f = collectionHistoryFixture(); let current = true; const entered = deferred<void>(); const release = deferred<void>();
    const native = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return native(...args); });
    const reading = f.history.read('diagnostics', () => current); await entered.promise; current = false; release.resolve();
    expect(await reading).toEqual({ state: 'stale' }); expect(f.journals.execute).not.toHaveBeenCalled();
});
it('a provider rejection after source retirement cannot publish an unavailable result into the replacement', async () => {
    const f = collectionHistoryFixture(); let current = true;
    vi.mocked(f.journals.execute).mockImplementationOnce(async () => { current = false; throw new Error('private'); });
    expect(await f.history.read('diagnostics', () => current)).toEqual({ state: 'stale' });
});
it('a malformed ready native snapshot is unavailable instead of becoming invented history', async () => {
    const f = collectionHistoryFixture(); vi.mocked(f.journals.execute).mockResolvedValueOnce({ state: 'ready', snapshot: {
        schemaVersion: 1, kind: 'diagnostics', epoch: 0, revision: 0, nextSequence: 0, lastTime: 0, entries: [],
    } });
    expect(await f.history.read('diagnostics', () => true)).toMatchObject({ retained: { state: 'unavailable' }, writer: { epoch: null } });
});
it('shutdown during bootstrap cannot prime late active consent or perform later native reads', async () => {
    const f = collectionHistoryFixture(true); const entered = deferred<void>(); const release = deferred<void>();
    const native = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return native(...args); });
    const reading = f.history.refresh(); await entered.promise; f.history.stop(); release.resolve(); await reading;
    expect(f.journals.execute).not.toHaveBeenCalled(); expect(f.history.coordinator.state('diagnostics').collecting).toBe(false);
});
