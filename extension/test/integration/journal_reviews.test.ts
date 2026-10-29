import { expect, it } from 'vitest';
import type { JournalResult } from '../../src/domain/local_journal.ts';
import { decideJournal } from '../../src/domain/local_journal.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { clearPreview, JOURNAL_OWNER, journalReviewsFixture } from '../fixtures/journal_reviews.ts';
import { append, helper, NOW } from '../fixtures/local_journal.ts';
import { deferred } from '../fixtures/runtime.ts';

it('previews exact generated-data scope/count/revision without deleting records or writing preferences', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f);
    expect(preview).toMatchObject({ kind: 'diagnostics', epoch: 0, revision: 1, entries: 1, expiresAt: NOW + 300000 });
    expect(Object.isFrozen(preview)).toBe(true); expect(f.store.execute.mock.calls.map(([, command]) => command.type)).toEqual(['read']);
    expect(f.port.set).not.toHaveBeenCalled(); expect(f.ports.reserve).not.toHaveBeenCalled();
});
it.each(['diagnostics', 'recents'] as const)('clears only reviewed %s and separately verifies the resulting generation', async kind => {
    const f = journalReviewsFixture(); const other = structuredClone(f.documents.get(kind === 'diagnostics' ? 'recents' : 'diagnostics'));
    const preview = await clearPreview(f, kind); const result = await f.reviews.confirm(preview.operationId, JOURNAL_OWNER);
    expect(result).toEqual({ state: 'observed-cleared', acknowledgement: 'accepted', epoch: 1, revision: 2, sourceCurrentAtObservation: true });
    expect(f.ports.reserve).toHaveBeenCalledExactlyOnceWith(kind, 0, 0); expect(f.lease.release).toHaveBeenCalledTimes(1);
    expect(f.documents.get(kind === 'diagnostics' ? 'recents' : 'diagnostics')).toEqual(other);
    expect(f.port.set).not.toHaveBeenCalled(); expect(f.port.remove).not.toHaveBeenCalled();
});
it('joins duplicate confirmations and never translates cancel into cancellation of an in-flight native effect', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const gate = deferred<JournalResult>();
    f.store.execute.mockImplementationOnce(() => gate.promise);
    const first = f.reviews.confirm(preview.operationId, JOURNAL_OWNER); const replay = f.reviews.confirm(preview.operationId, JOURNAL_OWNER);
    expect(replay).toBe(first); expect(f.reviews.cancel(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'pending' });
    gate.resolve({ state: 'unavailable', effect: 'aborted' }); expect(await first).toEqual({ state: 'not-applied', reason: 'aborted' });
    const calls = f.store.execute.mock.calls.length;
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual(await first);
    expect(f.reviews.cancel(preview.operationId, JOURNAL_OWNER)).toEqual(await first); expect(f.store.execute.mock.calls).toHaveLength(calls);
});
it('cancels an unsubmitted clear without claiming to remove generated or authored data', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f);
    expect(f.reviews.cancel(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'cancelled' });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'expired' });
    expect(f.ports.reserve).not.toHaveBeenCalled();
});
it('a later history revision makes clear stale rather than deleting unreviewed records', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f);
    await f.store.execute('diagnostics', append(helper));
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'stale' });
    expect(f.documents.get('diagnostics')).toMatchObject({ epoch: 0, revision: 2 }); expect(f.lease.release).toHaveBeenCalledTimes(1);
});
it('a later preference revision or active collection requires a new privacy/review decision', async () => {
    for (const active of [false, true]) {
        const f = journalReviewsFixture(); const preview = await clearPreview(f); f.privacy(active);
        expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: active ? 'collection-active' : 'stale' });
        expect(f.store.execute.mock.calls.map(([, command]) => command.type)).toEqual(['read']); expect(f.lease.release).toHaveBeenCalledTimes(1);
    }
});
it('never offers clear while that collection is active, and does not infer paused from future/corrupt settings', async () => {
    for (const kind of ['diagnostics', 'recents'] as const) {
        const f = journalReviewsFixture(); f.privacy(kind === 'diagnostics', kind === 'recents');
        expect(await f.reviews.preview(kind, JOURNAL_OWNER)).toEqual({ state: 'collection-active' }); expect(f.store.execute).not.toHaveBeenCalled();
    }
    for (const [raw, state] of [[{ schemaVersion: 99 }, 'future'], [{ private: 'preserve' }, 'corrupt'], [{ schemaVersion: 0, compact: true }, 'migration-required']] as const) {
        const f = journalReviewsFixture(); f.values.set(SETTINGS_KEY, raw);
        expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state }); expect(f.store.execute).not.toHaveBeenCalled();
    }
});
it('preserves acknowledged completion when a later current read fails', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementationOnce(execute).mockRejectedValueOnce(new Error('private-read-error'));
    const result = await f.reviews.confirm(preview.operationId, JOURNAL_OWNER);
    expect(result).toEqual({ state: 'unknown', acknowledgement: 'accepted', observation: 'unavailable', sourceCurrentAtObservation: true });
    expect(f.documents.get('diagnostics')).toMatchObject({ epoch: 1, entries: [] });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual(result);
    expect(f.store.execute.mock.calls.filter(([, command]) => command.type === 'clear')).toHaveLength(1);
});
it('lost acknowledgement can establish an observed requested state without attributing the write or retrying clear', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementationOnce(async (kind, command, guard) => { await execute(kind, command, guard); throw new Error('ack-lost'); });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'observed-cleared', acknowledgement: 'unknown', epoch: 1, revision: 2, sourceCurrentAtObservation: true });
    expect(f.store.execute.mock.calls.filter(([, command]) => command.type === 'clear')).toHaveLength(1);
});
it('an unobserved clear remains unknown when no matching generation is observed', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); f.store.execute.mockResolvedValueOnce({ state: 'unavailable', effect: 'unknown' });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'unknown', acknowledgement: 'unknown', observation: 'changed', sourceCurrentAtObservation: true });
});
it.each(['not-started', 'aborted'] as const)('does not claim observed completion after a native %s result', async reason => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); f.store.execute.mockResolvedValueOnce({ state: 'unavailable', effect: reason });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'not-applied', reason });
    expect(f.store.execute.mock.calls).toHaveLength(2);
});
it('a later new generation or new record cannot be presented as the exact reviewed clear result', async () => {
    for (const change of ['generation', 'record', 'revision'] as const) {
        const f = journalReviewsFixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
        f.store.execute.mockImplementationOnce(async (kind, command, guard) => {
            const result = await execute(kind, command, guard);
            const cleared = decideJournal(kind, f.documents.get(kind), change === 'generation'
                ? { type: 'clear', now: NOW, epoch: 1, revision: 2 } : { ...append(helper, 1), now: NOW });
            f.documents.set(kind, change === 'revision' ? { ...cleared.write!, epoch: 1, entries: [] } : cleared.write);
            return result;
        });
        expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'unknown', acknowledgement: 'accepted', observation: 'changed', sourceCurrentAtObservation: true });
    }
});
it('preserves the clear outcome when releasing its shared reservation fails', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); f.lease.release.mockImplementation(() => { throw new Error('cleanup'); });
    expect((await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).state).toBe('observed-cleared');
});
it('rejects a malformed readback rather than displaying private or fabricated empty history', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementationOnce(execute).mockResolvedValueOnce({ state: 'ready', snapshot: { ...DEFAULT_SETTINGS, entries: [] } } as never);
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toMatchObject({ state: 'unknown', acknowledgement: 'accepted', observation: 'unavailable' });
});
it('reports an actual active native policy instead of clearing through a stale paused cache', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); f.store.execute.mockResolvedValueOnce({ state: 'collection-active' });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'collection-active' });
});
