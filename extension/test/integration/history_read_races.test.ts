import { expect, it, vi } from 'vitest';
import { collectionHistoryFixture, HISTORY_OWNER } from '../fixtures/collection_history.ts';
import { decideJournal } from '../../src/domain/local_journal.ts';
import { writerFact } from '../fixtures/journal_writer.ts';
import { deferred } from '../fixtures/runtime.ts';

it('an old read delivered after a confirmed clear cannot publish deleted entries as current retained history', async () => {
    const f = collectionHistoryFixture();
    f.documents.set('diagnostics', decideJournal('diagnostics', undefined, { type: 'append', epoch: 0, at: 1000, now: 1000, fact: writerFact('settled') }).write!);
    const entered = deferred<void>(); const release = deferred<void>(); const native = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementationOnce(async (...args) => { const result = await native(...args); entered.resolve(); await release.promise; return result; });
    const reading = f.history.read('diagnostics', () => true); await entered.promise;
    const preview = await f.controls.previewClear('diagnostics', HISTORY_OWNER); if (preview.state !== 'preview') throw new Error(preview.state);
    expect(await f.controls.clear.confirm(preview.operationId, HISTORY_OWNER)).toMatchObject({ state: 'observed-cleared', epoch: 1 });
    release.resolve(); const result = await reading;
    expect(result).toMatchObject({ state: 'ready', writer: { epoch: 1, observedRevision: 2 }, retained: { state: 'unavailable' } });
    expect(JSON.stringify(result)).not.toContain('"phase":"settled"');
});
it('an old same-epoch read cannot replace a newer known committed row set', async () => {
    const f = collectionHistoryFixture();
    f.documents.set('diagnostics', decideJournal('diagnostics', undefined, { type: 'append', epoch: 0, at: 1000, now: 1000, fact: writerFact('settled') }).write!);
    const entered = deferred<void>(); const release = deferred<void>(); const native = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementationOnce(async (...args) => { const result = await native(...args); entered.resolve(); await release.promise; return result; });
    const reading = f.history.read('diagnostics', () => true); await entered.promise;
    const preview = await f.controls.previewCollection('diagnostics', 'start', HISTORY_OWNER); if (preview.state !== 'preview') throw new Error(preview.state);
    expect(await f.controls.collection.confirm(preview.operationId, HISTORY_OWNER)).toMatchObject({ state: 'settled', reason: 'done' });
    await f.history.writer.prime('diagnostics'); const ticket = f.history.writer.admit('diagnostics', writerFact(), () => true)!;
    await f.history.writer.flush(); expect(f.history.writer.retention(ticket)).toBe('stored'); release.resolve();
    expect(await reading).toMatchObject({ retained: { state: 'unavailable' }, writer: { epoch: 0, observedRevision: 2 } });
    expect(await f.history.read('diagnostics', () => true)).toMatchObject({ retained: { snapshot: { revision: 2, entries: [{ sequence: 1 }, { sequence: 2 }] } } });
});
