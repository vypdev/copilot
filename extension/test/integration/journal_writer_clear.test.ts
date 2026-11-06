import { expect, it, vi } from 'vitest';
import { JournalReviews } from '../../src/application/journal_reviews.ts';
import type { JournalSnapshot } from '../../src/domain/local_journal.ts';
import { journalWriterFixture, writerFact } from '../fixtures/journal_writer.ts';
import { deferred } from '../fixtures/runtime.ts';

const owner = 'a'.repeat(32);
function reviews(f: Awaited<ReturnType<typeof journalWriterFixture>>) {
    return new JournalReviews(f.store, f.repository, { now: f.writerPorts.now, identifier: f.ports.identifier,
        fence: () => ({ controllerEpoch: 1, credentialEpoch: 1 }), idle: kind => f.writer.idle(kind),
        pausedPolicyRevision: kind => f.coordinator.pausedPolicyRevision(kind), reserve: (...args) => f.coordinator.reserve(...args) });
}
async function paused(f: Awaited<ReturnType<typeof journalWriterFixture>>) {
    await f.repository.update(s => ({ ...s, center: { ...s.center, diagnostics: false } })); await f.coordinator.refresh();
}
it('a real shared clear lease defers an admitted completion and retires it before releasing the lease', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('submitted'), () => true)!;
    await f.writer.flush(); await paused(f); const clear = reviews(f); const preview = await clear.preview('diagnostics', owner);
    expect(preview.state).toBe('preview'); if (preview.state !== 'preview') return;
    const native = vi.mocked(f.native.execute).getMockImplementation()!; const entered = deferred<void>(); const release = deferred<void>();
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return native(...args); });
    const running = clear.confirm(preview.operationId, owner); await entered.promise;
    expect(f.coordinator.writerMayRun('diagnostics')).toBe(false); expect(f.writer.update(ticket, writerFact('settled'))).toBe('queued');
    await f.writer.flush(); expect(f.writer.idle('diagnostics')).toBe(true);
    release.resolve(); expect(await running).toMatchObject({ state: 'observed-cleared', acknowledgement: 'accepted' });
    await f.writer.flush(); expect(f.writer.retention(ticket)).toBe('untracked'); expect(f.writer.state('diagnostics')).toMatchObject({ epoch: 1, pending: 0 });
    expect((f.journals.get('diagnostics') as JournalSnapshot).entries).toEqual([]);
    expect(f.commands.filter(c => c[1].type === 'update')).toEqual([]);
});
it('a failed clear releases the shared lease and lets admitted known-row work continue while off', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('submitted'), () => true)!;
    await f.writer.flush(); await paused(f); const clear = reviews(f); const preview = await clear.preview('diagnostics', owner);
    if (preview.state !== 'preview') throw new Error(preview.state);
    const entered = deferred<void>(); const release = deferred<void>();
    vi.mocked(f.native.execute).mockImplementationOnce(async () => { entered.resolve(); await release.promise; return { state: 'unavailable', effect: 'aborted' }; });
    const running = clear.confirm(preview.operationId, owner); await entered.promise;
    f.writer.update(ticket, writerFact('settled')); await f.writer.flush(); release.resolve();
    expect(await running).toMatchObject({ state: 'not-applied', reason: 'aborted' }); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('stored'); expect((f.journals.get('diagnostics') as JournalSnapshot).entries[0].fact).toMatchObject({ phase: 'settled' });
});
it('a known new epoch retires queued old append work and resets incomplete status without backfilling', async () => {
    const f = await journalWriterFixture(); await f.ready(); f.writerPorts.mayRun.mockReturnValue(false);
    const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!;
    expect(f.writer.update(ticket, { ...writerFact(), secret: 'private' })).toBe('invalid');
    expect(f.writer.observe('diagnostics', { schemaVersion: 1, kind: 'diagnostics', epoch: 1, revision: 1, lastTime: 1000, nextSequence: 1, entries: [] })).toBe(true);
    f.writerPorts.mayRun.mockReturnValue(true); f.writer.wake(); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('untracked'); expect(f.writer.state('diagnostics')).toMatchObject({ pending: 0, dropped: 0, incomplete: false, issue: 'none' });
    expect(f.commands.filter(c => c[1].type !== 'read')).toEqual([]);
});
it('late pre-clear observations cannot lower the known epoch or resurrect a retired ticket', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; await f.writer.flush();
    const old = structuredClone(f.journals.get('diagnostics') as JournalSnapshot);
    f.writer.observe('diagnostics', { ...old, epoch: 1, revision: old.revision + 1, nextSequence: 1, entries: [] });
    expect(f.writer.observe('diagnostics', old)).toBe(false); expect(f.writer.retention(ticket)).toBe('untracked');
    expect(f.writer.update(ticket, writerFact('settled'))).toBe('untracked');
});
