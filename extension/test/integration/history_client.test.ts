import { afterEach, expect, it, vi } from 'vitest';
import { historyClientFixture } from '../fixtures/history_client.ts';
import { writerFact } from '../fixtures/journal_writer.ts';
import { deferred } from '../fixtures/runtime.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); });
async function fixture() { const f = await historyClientFixture(); stops.push(f.stop); return f; }
it('reads each independently bounded kind without exposing reusable native selectors', async () => {
    const f = await fixture(); await f.client.reader.read('diagnostics'); await f.client.reader.read('recents');
    expect(f.client.view.slots.diagnostics).toMatchObject({ phase: 'ready', current: true, data: { collection: { preference: 'off' } } });
    expect(f.client.view.slots.recents.data?.kind).toBe('recents');
    const owner = f.send.mock.calls.find(c => c[0].method === 'center.read')![0]; if (owner.method !== 'center.read') throw new Error('missing-owner');
    expect(JSON.stringify(f.client.view)).not.toContain(owner.clientId); expect(Object.isFrozen(f.client.view.slots)).toBe(true);
});
it('composes actual reviewed start/stop/clear, separate phase facts and a known clear epoch', async () => {
    const f = await fixture(); await f.client.reader.read('diagnostics');
    await f.client.reviews.preview('collection', 'diagnostics', 'start'); expect(f.client.view.review).toMatchObject({ family: 'collection', phase: 'preview', plan: { action: 'start' } });
    expect(f.client.view.review!.plan).not.toHaveProperty('operationId'); await f.client.reviews.confirm();
    expect(f.client.view.review).toMatchObject({ phase: 'result', outcome: { state: 'settled', preference: { state: 'committed' }, policy: { observation: 'active' } } });
    await f.client.reader.read('diagnostics'); expect(f.client.view.slots.diagnostics.data?.collection.collecting).toBe(true);
    f.history.writer.admit('diagnostics', writerFact('settled'), () => true); await f.history.writer.flush();
    await f.client.reviews.dismiss(); await f.client.reviews.preview('collection', 'diagnostics', 'stop'); await f.client.reviews.confirm();
    await f.client.reviews.dismiss(); await f.client.reviews.preview('clear', 'diagnostics'); await f.client.reviews.confirm(); await f.client.reader.read('diagnostics');
    expect(f.client.view.review).toMatchObject({ phase: 'result', outcome: { state: 'observed-cleared', epoch: 1 } });
    expect(f.client.view.slots.diagnostics.data?.retained).toMatchObject({ state: 'ready', snapshot: { entries: [], epoch: 1 } }); expect(f.sessions.reader.read).not.toHaveBeenCalled();
});
it('a lost confirmation response remains unknown until read-only result inspection, with no repeated effects', async () => {
    const f = await fixture(); await f.client.reviews.preview('collection', 'diagnostics', 'start'); const send = f.send.getMockImplementation()!;
    f.send.mockImplementationOnce(async message => { await send(message); return null; });
    await f.client.reviews.confirm(); expect(f.client.view.review?.phase).toBe('unknown'); expect(f.parent.view.issue).toBeNull();
    const writes = vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set').length;
    await f.client.reviews.inspect(); expect(f.client.view.review).toMatchObject({ phase: 'result', outcome: { state: 'settled', reason: 'done' } });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(writes);
});
it('an inspected completed fact survives a later weaker original transport response', async () => {
    const f = await fixture(); await f.client.reviews.preview('collection', 'diagnostics', 'start'); const send = f.send.getMockImplementation()!;
    const entered = deferred<void>(); const release = deferred<void>();
    f.send.mockImplementationOnce(async message => { await send(message); entered.resolve(); await release.promise; return null; });
    const confirming = f.client.reviews.confirm(); await entered.promise; expect(f.client.view.busy).toBe(true);
    await f.client.reviews.inspect(); const result = f.client.view.review; expect(result?.phase).toBe('result'); expect(f.client.view.busy).toBe(false);
    release.resolve(); await confirming; expect(f.client.view.review).toEqual(result); expect(f.client.view.issue).toBeNull();
});
it('keeps one review, cancels an unsubmitted preview on dismissal and leaves primary preferences untouched', async () => {
    const f = await fixture(); await f.client.reviews.preview('collection', 'diagnostics', 'start'); const count = f.send.mock.calls.length;
    await f.client.reviews.preview('clear', 'recents'); expect(f.send).toHaveBeenCalledTimes(count);
    expect(await f.client.reviews.dismiss()).toBe(true); expect(f.client.view.review).toBeNull(); expect(f.port.set).not.toHaveBeenCalled();
});
it.each(['expired', 'clock-backwards', 'invalid-clock'])('does not submit a retained review after a local %s fence', async mode => {
    const f = await fixture(); await f.client.reviews.preview('collection', 'diagnostics', 'start');
    const expiry = f.client.view.review!.plan.expiresAt;
    f.ports.now.mockReturnValue(mode === 'expired' ? expiry : mode === 'clock-backwards' ? 0 : NaN); const count = f.send.mock.calls.length;
    await f.client.reviews.confirm(); expect(f.client.view.review?.phase).toBe('stale'); expect(f.client.view.issue).toBe('expired'); expect(f.send).toHaveBeenCalledTimes(count);
});
it('denied or failed mutation eligibility never sends a preview and never poisons primary preference availability', async () => {
    const f = await fixture(); const count = f.send.mock.calls.length; f.ports.canMutate.mockReturnValue(false);
    await f.client.reviews.preview('clear', 'diagnostics'); expect(f.client.view.issue).toBe('denied'); expect(f.send).toHaveBeenCalledTimes(count);
    f.ports.canMutate.mockImplementation(() => { throw new Error('private'); }); await f.client.reviews.preview('collection', 'recents');
    expect(f.client.view.issue).toBe('denied'); expect(f.parent.view.issue).toBeNull();
});
it('a replacement or stopped view cannot publish late preview data or retain a selector', async () => {
    const f = await fixture(); const entered = deferred<void>(); const gate = deferred<Record<string, unknown>>();
    f.ports.request.mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
    const pending = f.client.reviews.preview('clear', 'diagnostics'); await entered.promise; f.client.stop(); gate.resolve({ state: 'unavailable' }); await pending;
    expect(f.client.view.review).toBeNull(); expect(f.client.view.busy).toBe(false);
});
it('a failed observational check cannot erase an acknowledged unknown clear or retry its effect', async () => {
    const f = await fixture(); await f.client.reviews.preview('clear', 'diagnostics');
    f.ports.request.mockResolvedValueOnce({ state: 'unknown', acknowledgement: 'accepted', observation: 'changed', sourceCurrentAtObservation: false });
    await f.client.reviews.confirm(); const known = f.client.view.review; f.ports.request.mockResolvedValueOnce(null); await f.client.reviews.inspect();
    expect(f.client.view.review).toEqual(known); expect(f.client.view.issue).toBe('unavailable'); expect(f.client.view.checking).toBe(false);
    const methods = f.ports.request.mock.calls.map(([message]) => message.method); expect(methods.filter(method => method === 'center.history.clear.confirm')).toHaveLength(1);
});
it('a completed operation stays immutable if an old queued inspection gesture is delivered after its result', async () => {
    const f = await fixture(); await f.client.reviews.preview('collection', 'diagnostics', 'start'); await f.client.reviews.confirm();
    const known = f.client.view.review; const count = f.ports.request.mock.calls.length; await f.client.reviews.inspect();
    expect(f.client.view.review).toEqual(known); expect(f.ports.request).toHaveBeenCalledTimes(count);
});
