import { expect, it, vi } from 'vitest';
import { writerIOFixture } from '../fixtures/journal_writer_io.ts';
import { writerFact } from '../fixtures/journal_writer.ts';
import type { JournalFact } from '../../src/domain/journal_facts.ts';
import { ObservedJournalStore } from '../../src/application/observed_journal_store.ts';

it.each(['retired', 'throwing'] as const)('the private current guard is fail-closed when %s', async mode => {
    const f = writerIOFixture(); f.control.current.mockImplementation(() => { if (mode === 'throwing') throw new Error('private'); return false; });
    expect(await f.run()).toMatchObject({ retention: 'not-retained', issue: 'stale' }); expect(f.store.execute).not.toHaveBeenCalled();
});
it('invalid clocks before mutation and during unknown-outcome reread never authorize a write or invent success', async () => {
    const f = writerIOFixture(true); f.control.now.mockReturnValue(null); expect(await f.run()).toMatchObject({ issue: 'clock-invalid', retention: 'not-retained' });
    expect(await f.run({ needsRead: true })).toMatchObject({ issue: 'clock-invalid', retention: 'unknown' }); expect(f.store.execute).not.toHaveBeenCalled();
});
it.each(['authority-missing', 'authority-retired', 'source-missing', 'source-retired'] as const)('append checks %s immediately before native submission', async guard => {
    const f = writerIOFixture();
    const changes = guard === 'authority-missing' ? { authority: null } : guard === 'authority-retired' ? { authority: { policyRevision: 1, current: () => false } }
        : guard === 'source-missing' ? { source: null } : { source: () => false };
    expect(await f.run(changes)).toMatchObject({ retention: 'not-retained', issue: 'stale' }); expect(f.store.execute).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt', 'malformed', 'throwing', 'cleared', 'missing-row', 'changed-at', 'different-action', 'helper-row'] as const)(
    'known-row reread preserves uncertainty or clear retirement for %s evidence', async state => {
        const f = writerIOFixture(true);
        const fact: JournalFact = state === 'different-action' ? { ...writerFact('settled'), action: 'rollback' }
            : state === 'helper-row' ? { kind: 'helper', helper: 'runtime-health', scope: 'active-at-observation', code: 'mount-failed' } : writerFact('submitted');
        const read = state === 'future' || state === 'corrupt' ? { state } as const
            : state === 'malformed' ? f.read({ nextSequence: 0 })
            : state === 'throwing' ? Object.defineProperty({ state: 'ready' }, 'snapshot', { get() { throw new Error('private'); } })
            : f.read({ ...(state === 'cleared' ? { epoch: 1, revision: 2 } : {}), entries: state === 'cleared' || state === 'missing-row' ? []
                : [{ sequence: 1, at: state === 'changed-at' ? 999 : 1000, fact }] });
        f.store.execute.mockResolvedValueOnce(read as ReturnType<typeof f.read>);
        expect(await f.run({ needsRead: true })).toMatchObject({ retention: ['cleared', 'missing-row', 'changed-at'].includes(state) ? 'not-retained' : 'unknown',
            issue: ['cleared', 'missing-row', 'changed-at'].includes(state) ? 'stale' : ['different-action', 'helper-row'].includes(state) ? 'invalid' : 'unknown' });
        expect(f.store.execute).toHaveBeenCalledTimes(1);
    });
it('a stronger read establishes an already committed completion with no resubmission', async () => {
    const f = writerIOFixture(true); f.store.execute.mockResolvedValueOnce(f.read({ entries: [{ sequence: 1, at: 1000, fact: writerFact('settled') }] }));
    expect(await f.run({ needsRead: true })).toMatchObject({ retention: 'stored', sequence: 1, stored: { observation: 'committed' }, needsRead: false });
    expect(f.store.execute).toHaveBeenCalledTimes(1);
});
it('a read cannot turn an unrelated backwards observation into an update', async () => {
    const f = writerIOFixture(true); expect(await f.run({ needsRead: true, desired: writerFact('cancelled') })).toMatchObject({ issue: 'invalid', retention: 'not-retained', sequence: 1 });
    expect(f.store.execute).toHaveBeenCalledTimes(1);
    expect(await f.run({ desired: writerFact('cancelled') })).toMatchObject({ issue: 'invalid' });
});
it.each(['no-owned-fact', 'wrong-kind'] as const)('an incomplete internal known-row plan (%s) never mutates', async plan => {
    const f = writerIOFixture(true);
    const changes = plan === 'no-owned-fact' ? { stored: null } : { desired: { kind: 'destination', route: 'features' } as const };
    expect(await f.run(changes)).toMatchObject({ retention: 'not-retained', issue: 'invalid' }); expect(f.store.execute).not.toHaveBeenCalled();
});
it.each(['stale', 'clock-invalid', 'invalid', 'ready'] as const)('a %s append response is not a stored acknowledgement', async state => {
    const f = writerIOFixture(); f.store.execute.mockResolvedValueOnce(state === 'ready' ? f.read() : { state });
    expect(await f.run()).toMatchObject({ retention: 'not-retained', issue: state === 'stale' || state === 'clock-invalid' ? state : 'unavailable' });
});
it('an unchanged known-row update is accepted only with the exact validated row and sequence', async () => {
    const f = writerIOFixture(true); f.store.execute.mockResolvedValueOnce({ state: 'unchanged', sequence: 1,
        snapshot: { ...f.initial, entries: [{ sequence: 1, at: 1000, fact: writerFact('settled') }] } });
    expect(await f.run()).toMatchObject({ retention: 'stored', sequence: 1 });
});
it.each(['missing-snapshot', 'wrong-sequence', 'wrong-at', 'different-fact', 'different-epoch'] as const)(
    'a written response with %s cannot certify the retained observation', async change => {
        const f = writerIOFixture(true); f.store.execute.mockResolvedValueOnce({ state: 'written', sequence: change === 'wrong-sequence' ? 2 : 1,
            ...(change === 'missing-snapshot' ? {} : { snapshot: { ...f.initial, ...(change === 'different-epoch' ? { epoch: 1 } : {}),
                entries: [{ sequence: 1, at: change === 'wrong-at' ? 999 : 1000, fact: writerFact(change === 'different-fact' ? 'submitted' : 'settled') }] } }) } as ReturnType<typeof f.read>);
        expect(await f.run()).toMatchObject({ retention: 'unknown', issue: 'invalid' });
    });
it('observer notification failure cannot erase a successful native result; absent snapshots do not notify', async () => {
    const f = writerIOFixture(); const observer = vi.fn(() => { throw new Error('private'); }); const store = new ObservedJournalStore(f.store, observer);
    const result = await store.execute('diagnostics', { type: 'read', now: 1000 }); expect(result.state).toBe('ready'); expect(observer).toHaveBeenCalledTimes(1);
    f.store.execute.mockResolvedValueOnce({ state: 'corrupt' }); expect((await store.execute('diagnostics', { type: 'read', now: 1000 })).state).toBe('corrupt');
    expect(observer).toHaveBeenCalledTimes(1);
});
it('a claimed written snapshot without a sequence cannot create a usable row identity', async () => {
    const f = writerIOFixture(); f.store.execute.mockResolvedValueOnce({ state: 'written', snapshot: f.initial });
    expect(await f.run()).toMatchObject({ retention: 'unknown', issue: 'invalid' });
});
