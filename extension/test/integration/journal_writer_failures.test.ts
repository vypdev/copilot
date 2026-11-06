import { expect, it, vi } from 'vitest';
import { journalWriterFixture, writerFact } from '../fixtures/journal_writer.ts';
import type { JournalSnapshot } from '../../src/domain/local_journal.ts';
import { deferred } from '../fixtures/runtime.ts';

it.each([true, false])('never guesses row identity or retries an unknown append (actually applied: %s)', async applied => {
    const f = await journalWriterFixture(); await f.ready(); const native = vi.mocked(f.native.execute).getMockImplementation()!;
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => {
        if (applied) await native(...args); return { state: 'unavailable', effect: 'unknown' };
    });
    const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('unknown'); expect(f.writer.update(ticket, writerFact('settled'))).toBe('untracked');
    await f.writer.prime('diagnostics'); f.writer.wake(); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('unknown'); expect(f.commands.filter(c => c[1].type === 'append')).toHaveLength(applied ? 1 : 0);
    expect(f.commands.some(c => c[1].type === 'update')).toBe(false);
    expect(f.writer.state('diagnostics')).toMatchObject({ incomplete: true, issue: 'unknown' });
});
it('observational reread establishes an applied update even when its acknowledgement was lost', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('submitted'), () => true)!;
    await f.writer.flush(); const native = vi.mocked(f.native.execute).getMockImplementation()!;
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => { await native(...args); return { state: 'unavailable', effect: 'unknown' }; });
    f.writer.update(ticket, writerFact('settled')); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('stored'); expect(f.commands.filter(c => c[1].type === 'update')).toHaveLength(1);
    expect(f.writer.state('diagnostics').incomplete).toBe(false);
});
it('does not retry an unapplied unknown update; a different explicit observation may advance the known row', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('submitted'), () => true)!;
    await f.writer.flush(); vi.mocked(f.native.execute).mockResolvedValueOnce({ state: 'unavailable', effect: 'unknown' });
    const unknown = { ...writerFact('settled', 'unavailable'), acknowledgement: 'unknown' as const };
    f.writer.update(ticket, unknown); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('not-retained'); expect(f.writer.update(ticket, unknown)).toBe('unchanged');
    await f.writer.flush(); expect(f.commands.some(c => c[1].type === 'update')).toBe(false);
    expect(f.writer.update(ticket, writerFact('settled'))).toBe('queued'); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('stored'); expect(f.commands.filter(c => c[1].type === 'update')).toHaveLength(1);
});
it('rereads a previously unknown known-row outcome before a new explicit observation writes', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('submitted'), () => true)!;
    await f.writer.flush(); vi.mocked(f.native.execute).mockRejectedValueOnce(new Error('private')).mockRejectedValueOnce(new Error('private'));
    f.writer.update(ticket, { ...writerFact('settled', 'unavailable'), acknowledgement: 'unknown' }); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('unknown'); f.commands.length = 0;
    f.writer.update(ticket, writerFact('settled')); await f.writer.flush();
    expect(f.commands.map(c => c[1].type)).toEqual(['read', 'update']); expect(f.writer.retention(ticket)).toBe('stored');
});
it('a late failed response cannot erase a stronger already observed committed row', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('submitted'), () => true)!;
    await f.writer.flush(); const native = vi.mocked(f.native.execute).getMockImplementation()!; const response = deferred<void>(); const entered = deferred<void>();
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => {
        const result = await native(...args); if ('snapshot' in result) f.writer.observe('diagnostics', result.snapshot);
        entered.resolve(); await response.promise; return { state: 'unavailable', effect: 'aborted' };
    });
    f.writer.update(ticket, writerFact('settled')); const pending = f.writer.flush(); await entered.promise;
    expect(f.writer.retention(ticket)).toBe('stored'); response.resolve(); await pending;
    expect(f.writer.retention(ticket)).toBe('stored'); expect(f.writer.state('diagnostics').incomplete).toBe(false);
});
it.each(['not-started', 'aborted'] as const)('known provider failure %s affects only retention', async effect => {
    const f = await journalWriterFixture(); await f.ready(); vi.mocked(f.native.execute).mockResolvedValueOnce({ state: 'unavailable', effect });
    const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('not-retained'); expect(f.writer.state('diagnostics')).toMatchObject({ issue: 'unavailable', incomplete: true, pending: 0 });
    expect(await f.repository.read()).toMatchObject({ state: 'ready', settings: { revision: 0 } });
});
it('does not accept a forged sequence acknowledgement as a stored row', async () => {
    const f = await journalWriterFixture(); await f.ready(); const native = vi.mocked(f.native.execute).getMockImplementation()!;
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => {
        const result = await native(...args); return 'snapshot' in result ? { ...result, sequence: 999 } : result;
    });
    const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('unknown'); expect(f.writer.update(ticket, writerFact('settled'))).toBe('untracked');
    expect((f.journals.get('diagnostics') as JournalSnapshot).entries).toHaveLength(1);
});
