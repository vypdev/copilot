import { expect, it, vi } from 'vitest';
import { journalWriterFixture, writerFact } from '../fixtures/journal_writer.ts';
import { deferred } from '../fixtures/runtime.ts';

it('admits at most 200 pending logical records and coalesces observations without consuming more slots', async () => {
    const f = await journalWriterFixture(); await f.ready(); const tickets = Array.from({ length: 200 }, () => f.writer.admit('diagnostics', writerFact(), () => true)!);
    expect(tickets.every(Boolean)).toBe(true); tickets.forEach(ticket => f.writer.update(ticket, writerFact('submitted')));
    expect(f.writer.state('diagnostics').pending).toBe(200); expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
    expect(f.writer.state('diagnostics')).toMatchObject({ pending: 200, dropped: 1, issue: 'capacity' });
    await f.writer.flush(); expect(f.writer.state('diagnostics').pending).toBe(0);
    expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
    f.writer.update(tickets[0], writerFact('settled')); await f.writer.flush();
    expect(f.writer.admit('diagnostics', writerFact(), () => true)).not.toBeNull(); await f.writer.flush();
    expect(f.writer.retention(tickets[0])).toBe('untracked');
});
it.each([300_000, -1])('prunes expired or clock-reversed pending private tickets (clock shift %s)', async shift => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!;
    f.advance(shift); expect(f.writer.update(ticket, writerFact('submitted'))).toBe('untracked'); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('untracked'); expect(f.writer.state('diagnostics')).toMatchObject({ incomplete: true, issue: shift < 0 ? 'clock-invalid' : 'stale' });
    expect(f.commands.some(c => c[1].type === 'append')).toBe(false);
});
it('does not retain a pending append whose five-minute guard expired while the native request waited', async () => {
    const f = await journalWriterFixture(); await f.ready(); const entered = deferred<void>(); const release = deferred<void>();
    const native = vi.mocked(f.native.execute).getMockImplementation()!;
    vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return native(...args); });
    const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; const pending = f.writer.flush(); await entered.promise;
    f.advance(300_000); release.resolve(); await pending;
    expect(f.writer.retention(ticket)).toBe('not-retained'); expect(f.writer.state('diagnostics').issue).toBe('stale');
});
it('invalid clocks and throwing notification/source ports fail closed without throwing into producers', async () => {
    const f = await journalWriterFixture(); await f.ready(); f.writerPorts.changed.mockImplementation(() => { throw new Error('private'); });
    expect(f.writer.admit('diagnostics', writerFact(), () => { throw new Error('private'); })).toBeNull();
    f.writerPorts.now.mockReturnValue(NaN); expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
    expect(f.writer.state('diagnostics').issue).toBe('clock-invalid'); f.writerPorts.now.mockReturnValue(1000);
    const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; f.writerPorts.now.mockImplementation(() => { throw new Error('private'); });
    expect(f.writer.update(ticket, writerFact('submitted'))).toBe('invalid'); await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('not-retained'); expect(JSON.stringify(f.writer.state('diagnostics'))).not.toContain('private');
});
it('disposal prevents any queued mutation and future admission or priming', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; f.writer.dispose();
    await f.writer.flush(); expect(f.writer.retention(ticket)).toBe('untracked'); expect(f.writer.idle('diagnostics')).toBe(false);
    expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull(); expect(f.writer.update(ticket, writerFact('submitted'))).toBe('untracked');
    const calls = vi.mocked(f.native.execute).mock.calls.length; await f.writer.prime('diagnostics'); expect(f.native.execute).toHaveBeenCalledTimes(calls);
});
it('expires an idle completed tracking slot without declaring loss of its already stored history', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('settled'), () => true)!; await f.writer.flush();
    f.advance(300_000); const next = f.writer.admit('diagnostics', writerFact('settled'), () => true)!; await f.writer.flush();
    expect(f.writer.retention(ticket)).toBe('untracked'); expect(f.writer.retention(next)).toBe('stored'); expect(f.writer.state('diagnostics').incomplete).toBe(false);
});
it('a saturated tracker can replace an idle failed unproven append without retrying it', async () => {
    const f = await journalWriterFixture(); await f.ready(); vi.mocked(f.native.execute).mockResolvedValueOnce({ state: 'unavailable', effect: 'unknown' });
    const tickets = Array.from({ length: 200 }, () => f.writer.admit('diagnostics', writerFact(), () => true)!); await f.writer.flush();
    expect(f.writer.retention(tickets[0])).toBe('unknown'); expect(f.writer.admit('recents', { kind: 'destination', route: 'work' }, () => true)).not.toBeNull();
    await f.writer.flush(); expect(f.writer.retention(tickets[0])).toBe('untracked');
});
it('coordinator retirement fences pending new IO even when the writer itself has not yet shut down', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!;
    f.coordinator.dispose(); expect(f.coordinator.writerMayRun('diagnostics')).toBe(false); await f.writer.flush();
    expect(f.writer.state('diagnostics').pending).toBe(1); expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
    f.writer.dispose(); expect(f.writer.retention(ticket)).toBe('untracked');
});
