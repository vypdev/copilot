import { expect, it, vi } from 'vitest';
import { writerFact, journalWriterFixture } from '../fixtures/journal_writer.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { JournalSnapshot } from '../../src/domain/local_journal.ts';

it('starts with no journal IO and does not retain or mark gaps while optional consent is off', async () => {
    const f = await journalWriterFixture(false); expect(f.native.execute).not.toHaveBeenCalled();
    expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
    expect(f.writer.state('diagnostics')).toMatchObject({ epoch: null, pending: 0, incomplete: false, dropped: 0 });
});
it('known consent with an unprimed journal drops visibly without inventing an epoch or retrospective capture', async () => {
    const f = await journalWriterFixture(); expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
    expect(f.writer.state('diagnostics')).toMatchObject({ epoch: null, incomplete: true, issue: 'not-ready' });
    await f.ready(); await f.writer.flush(); expect((f.journals.get('diagnostics') as JournalSnapshot | undefined)?.entries ?? []).toEqual([]);
});
it('records admitted closed facts and updates one known row through required submitted and settled transitions', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!;
    await f.writer.flush(); expect(f.writer.retention(ticket)).toBe('stored');
    expect(f.writer.update(ticket, writerFact('settled'))).toBe('queued'); await f.writer.flush();
    const commands = f.commands.map(c => c[1]); expect(commands.filter(c => c.type === 'update').map(c => c.fact.phase)).toEqual(['submitted', 'settled']);
    expect((f.journals.get('diagnostics') as JournalSnapshot).entries).toHaveLength(1);
    expect((f.journals.get('diagnostics') as JournalSnapshot).entries[0]).toMatchObject({ at: 1000, fact: { phase: 'settled', observation: 'committed' } });
});
it('coalesces pending observations before the first append and preserves the original first-observation time', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!;
    f.advance(50); f.writer.update(ticket, writerFact('submitted')); f.writer.update(ticket, writerFact('settled'));
    await f.writer.flush(); const mutations = f.commands.filter(c => c[1].type !== 'read'); expect(mutations).toHaveLength(1);
    expect(mutations[0][1]).toMatchObject({ type: 'append', at: 1000, now: 1050, fact: { phase: 'settled' } });
});
it('an admitted completion can update its known row after collection is durably off', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!; await f.writer.flush();
    await f.repository.update(s => ({ ...s, center: { ...s.center, diagnostics: false } })); await f.coordinator.refresh();
    expect(f.writer.admit('diagnostics', writerFact(), () => true)).toBeNull();
    f.writer.update(ticket, writerFact('settled')); await f.writer.flush(); expect(f.writer.retention(ticket)).toBe('stored');
    expect((f.journals.get('diagnostics') as JournalSnapshot).entries[0].fact).toMatchObject({ phase: 'settled' });
});
it('source retirement while an append waits cannot publish a new retained observation', async () => {
    const f = await journalWriterFixture(); await f.ready(); let source = true; const execute = vi.mocked(f.native.execute).getMockImplementation()!;
    const gate = deferred<void>(); vi.mocked(f.native.execute).mockImplementationOnce(async (...args) => { await gate.promise; return execute(...args); });
    const ticket = f.writer.admit('diagnostics', writerFact(), () => source)!;
    const pending = f.writer.flush(); await Promise.resolve(); source = false; gate.resolve(); await pending;
    expect(f.writer.retention(ticket)).toBe('not-retained'); expect(f.writer.state('diagnostics')).toMatchObject({ incomplete: true, issue: 'stale' });
});
it('a successful primary fact is not downgraded by a later unavailable observation of the same operation', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact('settled'), () => true)!; await f.writer.flush();
    expect(f.writer.update(ticket, { ...writerFact('settled', 'unavailable'), acknowledgement: 'unknown' })).toBe('unchanged');
    expect(f.writer.retention(ticket)).toBe('stored'); expect((f.journals.get('diagnostics') as JournalSnapshot).entries[0].fact).toMatchObject({ observation: 'committed', acknowledgement: 'accepted' });
});
it('does not turn a ticket into another action or accept private/free-form fields', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', writerFact(), () => true)!;
    expect(f.writer.update(ticket, { ...writerFact('settled'), action: 'rollback' })).toBe('invalid');
    expect(f.writer.admit('diagnostics', { ...writerFact(), rawError: 'private' }, () => true)).toBeNull();
    expect(f.writer.update({}, writerFact('settled'))).toBe('untracked'); await f.writer.flush();
    expect(JSON.stringify(f.journals.get('diagnostics'))).not.toContain('private');
});
it('records actual fixed recent destinations without providing operation updates for them', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('recents', { kind: 'destination', route: 'features', featureId: 'BEX-NAV-01' }, () => true);
    expect(ticket).not.toBeNull(); await f.writer.flush(); expect(f.writer.update(ticket!, writerFact())).toBe('untracked');
    expect((f.journals.get('recents') as JournalSnapshot).entries[0].fact).toEqual({ kind: 'destination', route: 'features', featureId: 'BEX-NAV-01' });
});
