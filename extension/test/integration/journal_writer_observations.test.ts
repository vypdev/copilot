import { expect, it, vi } from 'vitest';
import { journalWriterFixture, writerFact } from '../fixtures/journal_writer.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { JournalSnapshot } from '../../src/domain/local_journal.ts';

const empty = (revision = 0): JournalSnapshot => ({ schemaVersion: 1, kind: 'diagnostics', epoch: 0, revision, nextSequence: 1, lastTime: 0, entries: [] });
it('coalesces concurrent priming and refuses reads behind a shared reservation', async () => {
    const f = await journalWriterFixture(); const wait = deferred<void>(); const native = vi.mocked(f.native.execute).getMockImplementation()!;
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => { await wait.promise; return native(...args); });
    const first = f.writer.prime('diagnostics'); expect(f.writer.prime('diagnostics')).toBe(first); expect(f.writer.idle('diagnostics')).toBe(false);
    wait.resolve(); await first; expect(f.commands).toHaveLength(1); expect(f.writer.idle('diagnostics')).toBe(true);
    f.writerPorts.mayRun.mockReturnValue(false); await f.writer.prime('recents'); expect(f.commands).toHaveLength(1);
    f.writerPorts.mayRun.mockImplementation(() => { throw new Error('private'); }); await f.writer.prime('recents'); expect(f.commands).toHaveLength(1);
});
it.each([false, true])('a failed prime makes consent-active admission visibly unavailable (throw: %s)', async thrown => {
    const f = await journalWriterFixture(); await f.ready();
    if (thrown) vi.mocked(f.native.execute).mockRejectedValueOnce(new Error('private')); else vi.mocked(f.native.execute).mockResolvedValueOnce({ state: 'future' });
    await f.writer.prime('diagnostics'); expect(f.writer.state('diagnostics')).toMatchObject({ epoch: null, observedRevision: null, issue: 'unavailable', incomplete: true });
    expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
});
it.each([false, true])('a late failed prime cannot erase a newer canonical observation (throw: %s)', async thrown => {
    const f = await journalWriterFixture(); const wait = deferred<void>();
    vi.mocked(f.native.execute).mockImplementationOnce(async () => { await wait.promise; if (thrown) throw new Error('private'); return { state: 'corrupt' }; });
    const reading = f.writer.prime('diagnostics'); await Promise.resolve(); f.writer.observe('diagnostics', empty(2)); wait.resolve(); await reading;
    expect(f.writer.state('diagnostics')).toMatchObject({ epoch: 0, observedRevision: 2, incomplete: false });
});
it('a prime queued before a newer observation cannot reset admission with a stale snapshot', async () => {
    const f = await journalWriterFixture(true, false);
    vi.mocked(f.native.execute).mockResolvedValueOnce({ state: 'ready', snapshot: empty(1) });
    const reading = f.writer.prime('diagnostics');
    expect(f.writer.observe('diagnostics', empty(2))).toBe(true);
    await reading;
    expect(f.writer.state('diagnostics')).toMatchObject({ epoch: 0, observedRevision: 2, incomplete: false });
    expect(f.writer.admit('diagnostics', writerFact(), () => true)).not.toBeNull();
    await f.writer.flush();
});
it('invalid clocks and disposal during a prime do not expose or retain late provider data', async () => {
    const f = await journalWriterFixture(); f.writerPorts.now.mockReturnValue(NaN); await f.writer.prime('diagnostics');
    expect(f.native.execute).not.toHaveBeenCalled(); expect(f.writer.state('diagnostics').issue).toBe('clock-invalid');
    f.writerPorts.now.mockReturnValue(1000); const wait = deferred<void>();
    vi.mocked(f.native.execute).mockImplementationOnce(async () => { await wait.promise; return { state: 'ready', snapshot: empty() }; });
    const reading = f.writer.prime('diagnostics'); await Promise.resolve(); f.writer.dispose(); wait.resolve(); await reading;
    expect(f.writer.state('diagnostics').epoch).toBeNull(); expect(f.writer.observe('diagnostics', empty())).toBe(false);
});
it('preserves newer revision and rejects malformed or throwing native observations', async () => {
    const f = await journalWriterFixture(); expect(f.writer.observe('diagnostics', empty(3))).toBe(true);
    expect(f.writer.observe('diagnostics', empty(2))).toBe(false);
    expect(f.writer.observe('recents', empty())).toBe(false);
    expect(f.writer.observe('diagnostics', new Proxy(empty(), { get() { throw new Error('private'); } }))).toBe(false);
    expect(f.writer.state('diagnostics')).toMatchObject({ epoch: 0, observedRevision: 3 });
});
it('a current snapshot reconciles only known rows at the original first-observation time and same action', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; await f.writer.flush();
    const initial = structuredClone(f.journals.get('diagnostics') as JournalSnapshot);
    const observe = (fact: unknown, at = 1000) => f.writer.observe('diagnostics', { ...initial, revision: 2, lastTime: 2000,
        entries: [{ sequence: 1, at, fact }] } as JournalSnapshot);
    expect(observe(writerFact('settled'), 1001)).toBe(true); expect(f.writer.retention(ticket)).toBe('stored');
    expect(observe({ ...writerFact('settled'), action: 'rollback' })).toBe(true);
    expect(f.writer.update(ticket, writerFact('submitted'))).toBe('queued'); await f.writer.flush();
    expect((f.journals.get('diagnostics') as JournalSnapshot).entries[0].fact).toMatchObject({ phase: 'submitted' });
    expect(observe({ kind: 'helper', helper: 'runtime-health', code: 'mount-failed', scope: 'active-at-observation' })).toBe(true);
});
it('a queue-level unexpected provider payload fails softly and does not block a later record', async () => {
    const f = await journalWriterFixture(); await f.ready();
    vi.mocked(f.native.execute).mockResolvedValueOnce(new Proxy({ state: 'stale' } as const, { get(target, key) {
        if (key === 'state') throw new Error('private'); return Reflect.get(target, key);
    } }));
    const first = f.writer.admit('diagnostics', writerFact(), () => true)!;
    const second = f.writer.admit('diagnostics', writerFact(), () => true)!; await f.writer.flush();
    expect(f.writer.retention(first)).toBe('unknown'); expect(f.writer.retention(second)).toBe('stored');
    expect(f.writer.state('diagnostics')).toMatchObject({ pending: 0, issue: 'unknown' });
});
it('retirement during a running write drops its late callback without restoring private tracking', async () => {
    const f = await journalWriterFixture(); await f.ready(); const native = vi.mocked(f.native.execute).getMockImplementation()!;
    const entered = deferred<void>(); const release = deferred<void>();
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return native(...args); });
    const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; const pending = f.writer.flush(); await entered.promise;
    f.writer.dispose(); release.resolve(); await pending; expect(f.writer.retention(ticket)).toBe('untracked');
});
it('a known clear response retires a running older known-row reconciliation before its continuation', async () => {
    const f = await journalWriterFixture(true, false); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('submitted'), () => true)!; await f.writer.flush();
    vi.mocked(f.native.execute).mockResolvedValueOnce({ state: 'unavailable', effect: 'unknown' });
    const cleared = { schemaVersion: 1, kind: 'diagnostics', epoch: 1, revision: 2, lastTime: 1000, nextSequence: 1, entries: [] } as const;
    vi.mocked(f.native.execute).mockResolvedValueOnce({ state: 'ready', snapshot: cleared });
    f.writer.update(ticket, writerFact('settled')); await f.writer.flush(); expect(f.writer.retention(ticket)).toBe('untracked');
    expect(f.writer.state('diagnostics')).toMatchObject({ epoch: 1, pending: 0 });
});
it('a malformed ready prime is unavailable and cannot establish a guessed initial epoch', async () => {
    const f = await journalWriterFixture(); vi.mocked(f.native.execute).mockResolvedValueOnce({ state: 'ready', snapshot: { ...empty(), nextSequence: 0 } });
    await f.writer.prime('diagnostics'); expect(f.writer.state('diagnostics')).toMatchObject({ epoch: null, issue: 'unavailable' });
});
it('a clear invalidates only the chosen collection and preserves another kind of tracked history', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('recents', { kind: 'destination', route: 'work' }, () => true)!; await f.writer.flush();
    expect(f.writer.observe('diagnostics', { ...empty(1), epoch: 1 })).toBe(true); expect(f.writer.retention(ticket)).toBe('stored');
});
it('a later canonical terminal fact survives an older response from a delayed native boundary', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('submitted'), () => true)!; await f.writer.flush();
    const entered = deferred<void>(); const release = deferred<void>(); const native = vi.mocked(f.native.execute).getMockImplementation()!;
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => {
        const result = await native(...args); entered.resolve(); await release.promise; return result;
    });
    f.writer.update(ticket, writerFact('settled', 'unavailable')); const pending = f.writer.flush(); await entered.promise;
    const snapshot = f.journals.get('diagnostics') as JournalSnapshot;
    f.writer.observe('diagnostics', { ...snapshot, revision: snapshot.revision + 1,
        entries: [{ sequence: 1, at: 1000, fact: writerFact('settled', 'changed') }] });
    release.resolve(); await pending; expect(f.writer.retention(ticket)).toBe('stored');
    expect(f.commands.filter(c => c[1].type === 'update')).toHaveLength(1);
});
it('a retired exceptional response cannot mark a newer cleared epoch incomplete', async () => {
    const f = await journalWriterFixture(); await f.ready();
    vi.mocked(f.native.execute).mockResolvedValueOnce(new Proxy({ state: 'stale' } as const, { get(target, key) {
        if (key === 'state') {
            f.writer.observe('diagnostics', { ...empty(1), epoch: 1 }); throw new Error('private');
        }
        return Reflect.get(target, key);
    } }));
    const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('untracked');
    expect(f.writer.state('diagnostics')).toMatchObject({ epoch: 1, dropped: 0, incomplete: false, issue: 'none' });
});
