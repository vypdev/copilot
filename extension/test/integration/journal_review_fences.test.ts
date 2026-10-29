import { expect, it } from 'vitest';
import { clearPreview, JOURNAL_OWNER, journalReviewsFixture } from '../fixtures/journal_reviews.ts';
import { NOW, saved } from '../fixtures/local_journal.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { JournalResult } from '../../src/domain/local_journal.ts';

it('rejects malformed scope/owner, unavailable or unsafe time, and unknown editor authority before reading history', async () => {
    const f = journalReviewsFixture();
    expect(await f.reviews.preview('notes' as never, JOURNAL_OWNER)).toEqual({ state: 'invalid' });
    expect(await f.reviews.preview('diagnostics', 'bad')).toEqual({ state: 'denied' });
    expect(await f.reviews.preview('diagnostics', 'b'.repeat(32))).toEqual({ state: 'denied' });
    for (const now of [NaN, Number.MAX_SAFE_INTEGER, -1]) { f.setTime(now); expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' }); }
    f.ports.now.mockImplementation(() => { throw new Error('clock'); });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' }); expect(f.store.execute).not.toHaveBeenCalled();
});
it('contains malformed or throwing editor fences instead of granting authority', async () => {
    const f = journalReviewsFixture(); f.ports.fence.mockReturnValueOnce({ controllerEpoch: -1, credentialEpoch: 0 });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'denied' });
    f.ports.fence.mockReturnValueOnce({ controllerEpoch: 0, credentialEpoch: NaN });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'denied' });
    f.ports.fence.mockImplementation(() => { throw new Error('private'); });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'denied' });
});
it('requires a settled writer rather than trusting an unavailable idle check', async () => {
    const f = journalReviewsFixture(); f.ports.idle.mockReturnValueOnce(false);
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'busy' });
    f.ports.idle.mockImplementation(() => { throw new Error('writer'); });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'busy' }); expect(f.store.execute).not.toHaveBeenCalled();
});
it('a takeover while preferences are read retires a preview before it reaches history', async () => {
    const f = journalReviewsFixture(); const gate = deferred<unknown>(); f.get.mockImplementationOnce(() => gate.promise);
    const pending = f.reviews.preview('diagnostics', JOURNAL_OWNER); f.takeover(); gate.resolve(undefined);
    expect(await pending).toEqual({ state: 'stale' }); expect(f.store.execute).not.toHaveBeenCalled();
});
it('a disconnect while history is being read cannot issue a current preview', async () => {
    const f = journalReviewsFixture(); const gate = deferred<JournalResult>(); f.store.execute.mockImplementationOnce(() => gate.promise);
    const pending = f.reviews.preview('diagnostics', JOURNAL_OWNER);
    for (let turn = 0; turn < 20 && !f.store.execute.mock.calls.length; turn++) await Promise.resolve();
    expect(f.store.execute).toHaveBeenCalledTimes(1); f.disconnect(); gate.resolve({ state: 'ready', snapshot: saved() });
    expect(await pending).toEqual({ state: 'stale' });
});
it('rereads privacy after history and rejects collection activation or a moved settings revision', async () => {
    for (const active of [false, true]) {
        const f = journalReviewsFixture(); const execute = f.store.execute.getMockImplementation()!;
        f.store.execute.mockImplementationOnce(async (...args) => { const result = await execute(...args); f.privacy(active); return result; });
        expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: active ? 'collection-active' : 'stale' });
    }
});
it('checks lifetime again after the final privacy read and after generating an operation identifier', async () => {
    const f = journalReviewsFixture(); const get = f.get.getMockImplementation()!;
    f.get.mockImplementationOnce(get).mockImplementationOnce(async key => { f.takeover(); return get(key); });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'stale' });
    const other = journalReviewsFixture(); other.ports.identifier.mockImplementation(() => { other.takeover(); return 'f'.repeat(32); });
    expect(await other.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'stale' });
});
it('contains failed preference/history reads and rejects invalid provider snapshots without copying error text', async () => {
    const f = journalReviewsFixture(); f.get.mockRejectedValueOnce(new Error('private-account'));
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
    f.store.execute.mockRejectedValueOnce(new Error('private-repository'));
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
    f.store.execute.mockResolvedValueOnce({ state: 'ready', snapshot: { private: 'secret' } } as never);
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
});
it.each(['future', 'corrupt', 'clock-invalid', 'exhausted', 'invalid', 'stale', 'written', 'unchanged', 'unavailable'] as const)('maps history read %s honestly without offering a clear', async state => {
    const f = journalReviewsFixture(); f.store.execute.mockResolvedValueOnce({ state } as never);
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: ['future', 'corrupt', 'clock-invalid', 'exhausted'].includes(state) ? state : 'unavailable' });
});
it('bounds retained previews at16 including concurrently admitted readers', async () => {
    const f = journalReviewsFixture(); const results = await Promise.all(Array.from({ length: 17 }, () => f.reviews.preview('diagnostics', JOURNAL_OWNER)));
    expect(results.filter(result => result.state === 'preview')).toHaveLength(16); expect(results.filter(result => result.state === 'busy')).toHaveLength(1);
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'busy' });
});
it('rechecks writer availability after reading and rejects missing/colliding/throwing identifiers', async () => {
    const f = journalReviewsFixture(); f.ports.idle.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'busy' });
    const first = await clearPreview(f); f.ports.identifier.mockReturnValueOnce(first.operationId);
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
    f.ports.identifier.mockReturnValueOnce('bad'); expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
    f.ports.identifier.mockImplementation(() => { throw new Error('identifier'); });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
});
it('cannot offer clear from an unknown or invalid paused-policy observation', async () => {
    for (const revision of [null, -1, NaN]) {
        const f = journalReviewsFixture(); f.ports.pausedPolicyRevision.mockReturnValue(revision);
        expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' }); expect(f.store.execute).not.toHaveBeenCalled();
    }
    const f = journalReviewsFixture(); f.ports.pausedPolicyRevision.mockImplementation(() => { throw new Error('policy'); });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
});
it('requires a new review if paused policy changes during history read or before clear confirmation', async () => {
    const f = journalReviewsFixture(); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementationOnce(async (...args) => { const result = await execute(...args); f.ports.pausedPolicyRevision.mockReturnValue(1); return result; });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'stale' });
    const other = journalReviewsFixture(); const preview = await clearPreview(other); other.ports.pausedPolicyRevision.mockReturnValue(1);
    expect(await other.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'stale' }); expect(other.store.execute.mock.calls).toHaveLength(1);
});
it('expires previews at five minutes, rejects clock rollback and never borrows a different owner', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f);
    expect(await f.reviews.confirm(preview.operationId, 'b'.repeat(32))).toEqual({ state: 'denied' });
    expect(f.reviews.cancel('bad', JOURNAL_OWNER)).toEqual({ state: 'invalid' });
    expect(await f.reviews.confirm(preview.operationId, 'bad')).toEqual({ state: 'invalid' });
    f.setTime(NaN); expect(f.reviews.cancel(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
    f.setTime(NOW + 300000); expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'expired' });
    f.setTime(NOW); const next = await clearPreview(f); f.setTime(NOW - 1);
    expect(f.reviews.cancel(next.operationId, JOURNAL_OWNER)).toEqual({ state: 'expired' });
});
it('fences takeover, credential replacement, invalidation and a retired shared lease before deletion', async () => {
    for (const retire of ['takeover', 'disconnect', 'invalidate', 'lease'] as const) {
        const f = journalReviewsFixture(); const preview = await clearPreview(f);
        if (retire === 'takeover') f.takeover(); else if (retire === 'disconnect') f.disconnect();
        else if (retire === 'invalidate') f.reviews.invalidate(); else f.retireLease();
        expect((await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).state).toBe(retire === 'invalidate' ? 'expired' : 'stale');
        expect(f.documents.get('diagnostics')).toMatchObject({ epoch: 0 });
    }
});
it('does not submit a clear when reservation or refreshed privacy is unavailable', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); f.ports.reserve.mockReturnValueOnce(null as never);
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'busy' }); expect(f.lease.release).not.toHaveBeenCalled();
    const next = await clearPreview(f); f.ports.reserve.mockImplementationOnce(() => { throw new Error('reserve'); });
    expect(await f.reviews.confirm(next.operationId, JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
    const last = await clearPreview(f); f.get.mockRejectedValueOnce(new Error('settings'));
    expect(await f.reviews.confirm(last.operationId, JOURNAL_OWNER)).toEqual({ state: 'unavailable' }); expect(f.lease.release).toHaveBeenCalledTimes(1);
});
it('rechecks the reserved source and writer after canonical preferences were read', async () => {
    for (const mode of ['retire', 'busy', 'throw'] as const) {
        const f = journalReviewsFixture(); const preview = await clearPreview(f);
        if (mode === 'retire') f.lease.current.mockImplementation(() => { throw new Error('lease'); });
        else if (mode === 'busy') f.ports.idle.mockReturnValue(false);
        else f.lease.current.mockImplementation(() => { f.takeover(); return true; });
        expect((await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).state).toBe(mode === 'busy' ? 'busy' : 'stale');
        expect(f.lease.release).toHaveBeenCalledTimes(1); expect(f.documents.get('diagnostics')).toMatchObject({ epoch: 0 });
    }
});
it('preserves committed facts after source retirement while explicitly marking them noncurrent', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementationOnce(async (...args) => { const result = await execute(...args); f.takeover(); return result; });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toMatchObject({ state: 'observed-cleared', acknowledgement: 'accepted', sourceCurrentAtObservation: false });
});
it('cannot fabricate observed completion if the clock or history read becomes unavailable after commit', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementationOnce(async (...args) => { const result = await execute(...args); f.setTime(NaN); return result; });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'unknown', acknowledgement: 'accepted', observation: 'unavailable', sourceCurrentAtObservation: false });
    f.setTime(NOW); expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'expired' });
});
it('does not submit when the wall clock becomes invalid between checking the settled writer and admission', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f);
    f.ports.idle.mockImplementation(() => { f.setTime(NaN); return true; });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
    expect(f.store.execute.mock.calls.map(([, command]) => command.type)).toEqual(['read']); expect(f.lease.release).toHaveBeenCalledTimes(1);
});
it.each(['stale', 'invalid', 'future', 'corrupt', 'clock-invalid', 'exhausted', 'ready', 'unchanged'] as const)('does not invent a completed clear for native %s', async state => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); f.store.execute.mockResolvedValueOnce({ state } as never);
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: state === 'ready' || state === 'unchanged' ? 'unavailable' : state });
    expect(f.store.execute.mock.calls).toHaveLength(2); expect(f.lease.release).toHaveBeenCalledTimes(1);
});
it('bounds completed replay facts at32 and never repeats an evicted operation', async () => {
    const f = journalReviewsFixture(); let first = '';
    for (let i = 0; i < 33; i++) { const preview = await clearPreview(f); if (!i) first = preview.operationId; await f.reviews.confirm(preview.operationId, JOURNAL_OWNER); }
    const before = f.store.execute.mock.calls.length;
    expect(await f.reviews.confirm(first, JOURNAL_OWNER)).toEqual({ state: 'expired' }); expect(f.store.execute.mock.calls).toHaveLength(before);
});
