import { expect, it, vi } from 'vitest';
import { pauseGatewayFixture as fixture } from '../fixtures/pause_gateway.ts';
import { deferred } from '../fixtures/runtime.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { initialPauseFact } from '../../src/domain/pause_fact.ts';
import { decideJournal } from '../../src/domain/local_journal.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

it('actual composed pause previews create current facts while off diagnostics retains no new row or private selector', async () => {
    const h = await fixture(); const before = h.rows().length; const plan = await h.preview({ type: 'tab', tabId: 7, paused: true });
    expect(await h.current()).toMatchObject({ state: 'current', operation: { family: 'pauses', stage: 'reviewed', fact: { action: 'pause-tab', submitted: false }, retention: 'untracked' } });
    await h.history.writer.flush(); expect(h.rows()).toHaveLength(before); expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.sessions.reader.read).not.toHaveBeenCalled();
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled(); expect(JSON.stringify(await h.current())).not.toContain(plan.operationId);
});
it('a complete native write updates one consented diagnostics row through its exact original ticket', async () => {
    const h = await fixture(true); const before = h.rows().length; const plan = await h.preview();
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed' }); await h.history.writer.flush(); expect(h.rows()).toHaveLength(before + 1);
    const rows = h.rows().filter(entry => entry.fact.kind === 'pause-operation'); expect(rows).toHaveLength(1);
    expect(rows[0].fact).toMatchObject({ result: 'committed', submitted: true, acknowledgement: 'accepted', observation: 'committed' });
    for (const forbidden of ['operationId', 'revision', 'tabId', 'github.com', 'witness', 'sourceTree']) expect(JSON.stringify(rows[0].fact)).not.toContain(forbidden);
    expect(h.native.port.set).toHaveBeenCalledTimes(1); expect(h.rows('recents')).toHaveLength(1);
});
it('pending native submission stays inspectable and repeated confirmation does not produce another native attempt or row', async () => {
    const h = await fixture(true); const plan = await h.preview(); const gate = deferred<void>(); const write = vi.mocked(h.native.port.set).getMockImplementation()!;
    vi.mocked(h.native.port.set).mockImplementation(async (...args) => { await gate.promise; await write(...args); }); const pending = h.confirm(plan);
    await vi.waitFor(() => expect(h.native.port.set).toHaveBeenCalled()); expect(await h.current()).toMatchObject({ operation: { stage: 'running', fact: { submitted: true, acknowledgement: 'unknown', observation: 'not-observed' } } });
    const repeated = h.confirm(plan); expect(h.native.port.set).toHaveBeenCalledTimes(1); gate.resolve(); await Promise.all([pending, repeated]); await h.history.writer.flush();
    expect(h.rows().filter(row => row.fact.kind === 'pause-operation')).toHaveLength(1); expect(h.native.port.set).toHaveBeenCalledTimes(1);
});
it('a confirmed native acknowledgement is visible before a delayed canonical read without claiming its result', async () => {
    const h = await fixture(); const plan = await h.preview(); const gate = deferred<unknown>(); const entered = deferred<void>(); let written = false;
    const get = vi.mocked(h.native.port.get).getMockImplementation()!; const set = vi.mocked(h.native.port.set).getMockImplementation()!;
    vi.mocked(h.native.port.set).mockImplementation(async (...args) => { await set(...args); written = true; });
    vi.mocked(h.native.port.get).mockImplementation((...args) => { if (written) { entered.resolve(); return gate.promise; } return get(...args); });
    const pending = h.confirm(plan); await entered.promise;
    expect(await h.current()).toMatchObject({ operation: { stage: 'running', fact: { acknowledgement: 'accepted', observation: 'not-observed', result: 'pending' } } });
    gate.resolve(h.native.after); expect(await pending).toMatchObject({ state: 'committed' }); expect(await h.current()).toMatchObject({ operation: { fact: { result: 'committed', observation: 'committed' } } });
});
it('an accepted no-op records an unknown different observation; later metadata cannot certify or repeat that operation', async () => {
    const h = await fixture(true); vi.mocked(h.native.port.set).mockResolvedValue(undefined); const plan = await h.preview();
    expect(await h.confirm(plan)).toMatchObject({ state: 'unknown', acknowledgement: 'accepted', observation: 'different' });
    expect(await h.current()).toMatchObject({ operation: { fact: { result: 'unknown', acknowledgement: 'accepted', observation: 'different' } } });
    h.native.values.set(TEMPORARY_PAUSES_KEY, h.native.after); await h.call({ method: 'center.pauses.read', clientId: h.owner.clientId });
    expect(await h.current()).toMatchObject({ operation: { fact: { result: 'unknown' } } }); await h.history.writer.flush(); expect(h.rows().filter(row => row.fact.kind === 'pause-operation')).toHaveLength(1); expect(h.native.port.set).toHaveBeenCalledTimes(1);
});
it('a lost native acknowledgement with canonical effect does not become an accepted acknowledgement', async () => {
    const h = await fixture(); const plan = await h.preview(); const set = vi.mocked(h.native.port.set).getMockImplementation()!;
    vi.mocked(h.native.port.set).mockImplementation(async (...args) => { await set(...args); throw new Error('private native acknowledgement'); });
    expect(await h.confirm(plan)).toMatchObject({ state: 'committed', acknowledgement: 'unknown' });
    expect(await h.current()).toMatchObject({ operation: { fact: { result: 'committed', acknowledgement: 'unknown', observation: 'committed' } } });
    expect(JSON.stringify(await h.current())).not.toContain('private native acknowledgement');
});
it('explicit adoption is observed without native write events and never rewrites an older unknown history fact', async () => {
    const h = await fixture(true); vi.mocked(h.native.port.set).mockResolvedValue(undefined); const unknown = await h.preview(); await h.confirm(unknown); await h.history.writer.flush();
    const previous = h.rows().find(row => row.fact.kind === 'pause-operation')!; const plan = await h.preview({ type: 'adopt-observed' });
    expect(await h.confirm(plan)).toMatchObject({ state: 'reconciled' }); expect(await h.current()).toMatchObject({ operation: { fact: { action: 'adopt-pauses', result: 'reconciled', submitted: false, acknowledgement: 'not-observed', observation: 'adopted' } } });
    await h.history.writer.flush(); expect(h.rows().filter(row => row.fact.kind === 'pause-operation')).toHaveLength(2); expect(h.rows().find(row => row.sequence === previous.sequence)?.fact).toEqual(previous.fact);
    expect(h.native.port.set).toHaveBeenCalledTimes(1);
});
it('cancellation and completed replay preserve one cancelled observation without any native write', async () => {
    const h = await fixture(true); const plan = await h.preview(); expect(await h.cancel(plan)).toMatchObject({ state: 'cancelled' }); expect(await h.confirm(plan)).toMatchObject({ state: 'cancelled' });
    expect(await h.current()).toMatchObject({ operation: { fact: { state: 'cancelled', result: 'cancelled', submitted: false } } });
    await h.history.writer.flush(); expect(h.rows().filter(row => row.fact.kind === 'pause-operation')).toHaveLength(1); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('saved-preference corruption cannot hide independent current native pause facts', async () => {
    const h = await fixture(); const plan = await h.preview(); const raw = { damaged: true }; h.values.set(SETTINGS_KEY, raw);
    await h.confirm(plan); expect(await h.current()).toMatchObject({ operation: { family: 'pauses', fact: { result: 'committed' } } }); expect(h.sessions.reader.read).not.toHaveBeenCalled();
    expect(h.values.get(SETTINGS_KEY)).toEqual(raw);
});
it('an unsupported retained fact is preserved inert rather than silently downgraded or repaired', () => {
    const now = 1000; const initial = decideJournal('diagnostics', undefined, { type: 'append', now, at: now, epoch: 0, fact: initialPauseFact('pause-tab') });
    if (!initial.write) throw new Error('missing test snapshot'); const raw = { ...initial.write, entries: initial.write.entries.map(row => ({ ...row, fact: { ...row.fact, kind: 'pause-operation-v2' } })) };
    const bytes = JSON.stringify(raw); const decision = decideJournal('diagnostics', raw, { type: 'read', now });
    expect(decision).toEqual({ result: { state: 'corrupt' } }); expect(JSON.stringify(raw)).toBe(bytes);
});
