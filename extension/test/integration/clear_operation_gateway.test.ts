import { afterEach, expect, it, vi } from 'vitest';
import { clearGatewayFixture } from '../fixtures/clear_gateway.ts';
import { deferred } from '../fixtures/runtime.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { clearRunning, clearSettled } from '../fixtures/clear_fact.ts';

const fixtures: Awaited<ReturnType<typeof clearGatewayFixture>>[] = [];
const fixture = async (retaining = false) => { const f = await clearGatewayFixture(retaining); fixtures.push(f); return f; };
afterEach(() => { for (const f of fixtures.splice(0)) { f.history.stop(); f.main.shutdown(); } });
it('the actual clear preview owns current metadata while optional collection is off', async () => {
    const f = await fixture(); await f.preview(); expect(await f.current()).toMatchObject({ state: 'current', operation: { family: 'clear', stage: 'reviewed',
        fact: { collection: 'diagnostics', submitted: false }, target: { location: { route: 'privacy' }, label: null }, retention: 'untracked' } });
    expect(f.rows()).toHaveLength(1);
});
it('reading current clear metadata performs no settings, journal, permission or provider I/O', async () => {
    const f = await fixture(); await f.preview(); const counts = [vi.mocked(f.port.get).mock.calls.length, vi.mocked(f.journals.execute).mock.calls.length,
        vi.mocked(f.sessions.reader.read).mock.calls.length, vi.mocked(f.browser.api.permissions.contains).mock.calls.length];
    await f.current(); await f.current(); expect([vi.mocked(f.port.get).mock.calls.length, vi.mocked(f.journals.execute).mock.calls.length,
        vi.mocked(f.sessions.reader.read).mock.calls.length, vi.mocked(f.browser.api.permissions.contains).mock.calls.length]).toEqual(counts);
});
it('clearing diagnostics leaves its canonical generation empty and reports the outcome only in current memory', async () => {
    const f = await fixture(); const preview = await f.preview(); expect(await f.confirm(preview.operationId)).toMatchObject({ state: 'observed-cleared' }); await f.history.writer.flush();
    expect(f.rows()).toHaveLength(0); expect(await f.current()).toMatchObject({ operation: { stage: 'settled', retention: 'untracked', fact: { observation: 'cleared', acknowledgement: 'accepted' } } });
    expect(vi.mocked(f.journals.execute).mock.calls.some(([, command]) => command.type === 'append')).toBe(false); expect(f.rows('recents')).toHaveLength(1);
});
it('a recents clear retains a single same-row diagnostic while the cleared recents generation stays empty', async () => {
    const f = await fixture(true); const preview = await f.preview('recents'); await f.history.writer.flush(); expect(f.rows()).toHaveLength(2);
    await f.confirm(preview.operationId); await f.history.writer.flush(); expect(f.rows('recents')).toHaveLength(0); expect(f.rows()).toHaveLength(2);
    expect(f.rows().at(-1)?.fact).toMatchObject({ kind: 'clear-operation', collection: 'recents', state: 'settled', acknowledgement: 'accepted', observation: 'cleared' });
    expect(await f.current()).toMatchObject({ operation: { retention: 'stored' } }); expect(JSON.stringify(f.rows())).not.toContain(preview.operationId);
});
it('a failed secondary append does not block the recents clear or cause another record attempt', async () => {
    const f = await fixture(true); const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation((...args) => args[1].type === 'append' ? Promise.reject(new Error('secondary quota')) : execute(...args));
    const preview = await f.preview('recents'); await f.history.writer.flush(); expect(await f.confirm(preview.operationId)).toMatchObject({ state: 'observed-cleared' }); await f.history.writer.flush();
    expect(f.rows('recents')).toHaveLength(0); expect(await f.current()).toMatchObject({ operation: { stage: 'settled', fact: { result: 'observed-cleared' } } });
    expect(vi.mocked(f.journals.execute).mock.calls.filter(([, command]) => command.type === 'append')).toHaveLength(1);
});
it('inspection and replay never resubmit native clear or append a new observation', async () => {
    const f = await fixture(true); const preview = await f.preview('recents'); await f.history.writer.flush(); const outcome = await f.confirm(preview.operationId); await f.history.writer.flush();
    const counts = vi.mocked(f.journals.execute).mock.calls.length;
    expect(await f.call({ ...f.owner, method: 'center.history.clear.result', operationId: preview.operationId })).toEqual(outcome); expect(await f.confirm(preview.operationId)).toEqual(outcome);
    expect(vi.mocked(f.journals.execute)).toHaveBeenCalledTimes(counts); expect(f.rows()).toHaveLength(2);
});
it('a late clear cannot replace a newer settings review while its original ticket can still settle', async () => {
    const f = await fixture(true); const preview = await f.preview('recents'); await f.history.writer.flush(); const gate = deferred<void>(); const entered = deferred<void>(); const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation(async (...args) => { if (args[1].type === 'clear') { entered.resolve(); await gate.promise; } return execute(...args); });
    const pending = f.confirm(preview.operationId); await entered.promise;
    expect(await f.call({ ...f.owner, method: 'center.preview', expectedRevision: 0, intent: { type: 'preferences', values: { locale: 'es' } } })).toMatchObject({ state: 'preview' });
    gate.resolve(); expect(await pending).toMatchObject({ state: 'observed-cleared' }); await f.history.writer.flush();
    expect(await f.current()).toMatchObject({ operation: { family: 'settings', stage: 'reviewed' } }); expect(f.rows().some(row => row.fact.kind === 'clear-operation' && row.fact.state === 'settled')).toBe(true);
});
it('canonical diagnostics clear retires older admitted tickets before a late update can recreate their rows', async () => {
    const f = await fixture(true); const ticket = f.history.writer.admit('diagnostics', clearRunning(), () => true); expect(ticket).not.toBeNull(); await f.history.writer.flush();
    const stop = await f.call({ ...f.owner, method: 'center.collection.preview', kind: 'diagnostics', action: 'stop' }) as { state: string; operationId: string }; expect(stop.state).toBe('preview');
    await f.call({ ...f.owner, method: 'center.collection.confirm', operationId: stop.operationId }); await f.history.writer.flush();
    const preview = await f.preview(); await f.confirm(preview.operationId); f.history.writer.update(ticket!, clearSettled()); await f.history.writer.flush();
    expect(f.rows()).toHaveLength(0); expect(f.history.writer.retention(ticket!)).toBe('untracked');
});
it('a controller handoff retires current clear metadata and cannot rebuild it from the retained diagnostic', async () => {
    const f = await fixture(true); await f.preview('recents'); await f.history.writer.flush(); const sender = { ...CENTER_SENDER, documentId: 'replacement', tab: { id: 2, incognito: false } };
    const other = await f.open(sender); await f.call({ clientId: other.clientId, controllerEpoch: other.controllerEpoch, method: 'center.claim' }, sender);
    expect(await f.current()).toEqual({ state: 'empty' }); expect(f.rows()).toHaveLength(2);
});
it('malformed clear previews produce no operation, retained row or native mutation', async () => {
    const f = await fixture(); expect(await f.call({ ...f.owner, method: 'center.history.clear.preview', kind: 'private' })).toMatchObject({ state: 'rejected' });
    expect(await f.current()).toEqual({ state: 'empty' }); expect(f.rows()).toHaveLength(1); expect(vi.mocked(f.journals.execute).mock.calls.some(([, command]) => command.type === 'clear')).toBe(false);
});
