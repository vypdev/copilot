import { expect, it } from 'vitest';
import { decideJournal, validJournalSnapshot, type JournalSnapshot } from '../../src/domain/local_journal.ts';
import type { SessionFact } from '../../src/domain/session_fact.ts';
import { journalWriterFixture } from '../fixtures/journal_writer.ts';
import { previewHistoryExport } from '../../src/domain/history_export.ts';

const admission: SessionFact = { kind: 'session-operation', action: 'connect', state: 'running', result: 'pending', effects: [], incomplete: false };
const complete: SessionFact = { ...admission, state: 'settled', result: 'ready', effects: Array.from({ length: 16 }, (_, i) => ({ ordinal: i + 1, effect: 'retire-active', state: 'settled', acknowledgement: 'accepted', observation: 'committed' })) };
function append(raw: JournalSnapshot | undefined, fact: SessionFact = complete): JournalSnapshot {
    const decision = decideJournal('diagnostics', raw, { type: 'append', now: 1000, at: 1000, epoch: raw?.epoch ?? 0, fact });
    if (!('snapshot' in decision.result)) throw new Error(decision.result.state); return decision.result.snapshot;
}
function almostFull(): JournalSnapshot {
    let value = append(undefined, admission);
    for (let i = 0; i < 200; i++) { const next = append(value); if (!next.entries.some(e => e.sequence === 1)) return value; value = next; }
    throw new Error('byte-bound-not-exercised');
}
function oldExportOverflow(): JournalSnapshot {
    const entries: { sequence: number; at: number; fact: { effects: { ordinal: number; effect: 'retire-active'; state: 'settled'; acknowledgement: 'unknown' | 'accepted'; observation: 'committed' }[] } & Omit<SessionFact, 'effects'> }[] = [];
    const value = (): JournalSnapshot => ({ schemaVersion: 1, kind: 'diagnostics', epoch: 0, revision: entries.length, nextSequence: entries.length + 1, lastTime: 1000, entries });
    for (let n = 0; n < 200; n++) {
        let added = false;
        for (let length = 16; length >= 0; length--) {
            const effects = Array.from({ length }, (_, i) => ({ ordinal: i + 1, effect: 'retire-active' as const, state: 'settled' as const, acknowledgement: 'unknown' as 'unknown' | 'accepted', observation: 'committed' as const }));
            const entry = { sequence: entries.length + 1, at: 1000, fact: { ...complete, effects } }; entries.push(entry);
            if (Buffer.byteLength(JSON.stringify(value())) <= 65520) { added = true; break; } entries.pop();
        }
        if (!added) break;
    }
    for (const entry of entries) for (const effect of entry.fact.effects) if (Buffer.byteLength(JSON.stringify(value())) < 65520) effect.acknowledgement = 'accepted';
    expect(Buffer.byteLength(JSON.stringify(value()))).toBe(65520); expect(validJournalSnapshot('diagnostics', value())).toBe(true); return value();
}
it('bounded session phase facts evict old generated rows to keep the complete envelope within64KiB', () => {
    let value: JournalSnapshot | undefined;
    for (let i = 0; i < 80; i++) value = append(value);
    expect(validJournalSnapshot('diagnostics', value)).toBe(true); expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(65536);
    expect(value!.entries.length).toBeLessThan(80); expect(value!.entries.at(-1)?.sequence).toBe(80); expect(value!.nextSequence).toBe(81);
    expect(previewHistoryExport('diagnostics', value)).not.toBeNull();
});
it('growing a known early row preserves that exact row and every phase while evicting the oldest other row', () => {
    const before = almostFull(); const decision = decideJournal('diagnostics', before, { type: 'update', epoch: 0, now: 1000, sequence: 1, fact: complete });
    expect(decision.result.state).toBe('written'); if (!('snapshot' in decision.result)) throw new Error('missing-snapshot');
    const next = decision.result.snapshot; expect(next.entries[0]).toMatchObject({ sequence: 1, fact: complete }); expect(next.entries.some(e => e.sequence === 2)).toBe(false);
    expect(next.entries.at(-1)?.sequence).toBe(before.entries.at(-1)?.sequence); expect(next.nextSequence).toBe(before.nextSequence); expect(Buffer.byteLength(JSON.stringify(next))).toBeLessThanOrEqual(65536);
});
it('eviction never reuses sequence identity and a late update cannot reconstruct a missing row', () => {
    let value: JournalSnapshot | undefined; for (let i = 0; i < 80; i++) value = append(value);
    const before = JSON.stringify(value); expect(decideJournal('diagnostics', value, { type: 'update', epoch: 0, now: 1000, sequence: 1, fact: complete }).result).toEqual({ state: 'stale' }); expect(JSON.stringify(value)).toBe(before);
});
it('ordinary compact session rows still preserve the200-row bound and exact current fact', () => {
    let value: JournalSnapshot | undefined; for (let i = 0; i < 205; i++) value = append(value, admission);
    expect(value!.entries).toHaveLength(200); expect(value!.entries[0].sequence).toBe(6); expect(value!.entries.at(-1)?.fact).toEqual(admission);
});
it('invalid oversized/private phase data is preserved as corrupt rather than being silently trimmed into validity', () => {
    const before = append(undefined); const raw = { ...before, entries: [{ ...before.entries[0], fact: { ...complete, secret: 'private' } }] };
    const result = decideJournal('diagnostics', raw, { type: 'append', epoch: 0, now: 1000, at: 1000, fact: admission }); expect(result).toEqual({ result: { state: 'corrupt' } }); expect(raw.entries[0].fact.secret).toBe('private');
});
it('a semantic phase replay does not change revision, retention order or current contents', () => {
    const before = append(undefined); const reordered = Object.fromEntries(Object.entries(complete).reverse()) as unknown as SessionFact;
    const result = decideJournal('diagnostics', before, { type: 'update', epoch: 0, now: 1000, sequence: 1, fact: reordered }); expect(result.write).toBeUndefined(); expect(result.result).toMatchObject({ state: 'unchanged', snapshot: { revision: before.revision } });
});
it('canonical byte eviction retires a known writer ticket, and no late event can append it again', async () => {
    const f = await journalWriterFixture(); await f.ready(); const first = f.writer.admit('diagnostics', admission, () => true)!; await f.writer.flush();
    for (let i = 0; i < 80; i++) { f.writer.admit('diagnostics', complete, () => true); await f.writer.flush(); }
    expect(f.writer.retention(first)).toBe('untracked'); const count = f.commands.length; expect(f.writer.update(first, complete)).toBe('untracked'); await f.writer.flush(); expect(f.commands).toHaveLength(count);
});
it('canonical same-epoch row absence retires its ticket even when no clear occurred', async () => {
    const f = await journalWriterFixture(); await f.ready(); const ticket = f.writer.admit('diagnostics', admission, () => true)!; await f.writer.flush();
    const before = f.journals.get('diagnostics') as JournalSnapshot; expect(f.writer.observe('diagnostics', { ...before, revision: before.revision + 1, entries: [] })).toBe(true);
    expect(f.writer.retention(ticket)).toBe('untracked'); expect(f.writer.update(ticket, complete)).toBe('untracked');
});
it('a canonical read applies generated capacity to an older full journal so its exact JSON export also fits', () => {
    const before = oldExportOverflow(); const original = JSON.stringify(before); expect(previewHistoryExport('diagnostics', before)).toBeNull();
    const decision = decideJournal('diagnostics', before, { type: 'read', now: 1000 }); expect(decision.write).toBeDefined();
    if (!('snapshot' in decision.result)) throw new Error('read-failed'); expect(previewHistoryExport('diagnostics', decision.result.snapshot)).not.toBeNull();
    expect(decision.result.snapshot.nextSequence).toBe(before.nextSequence); expect(decision.result.snapshot.epoch).toBe(before.epoch); expect(JSON.stringify(before)).toBe(original);
});
