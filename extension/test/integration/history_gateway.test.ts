import { expect, it, vi } from 'vitest';
import { historyGatewayFixture } from '../fixtures/history_gateway.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { writerFact } from '../fixtures/journal_writer.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

type Preview = { state: string; operationId: string };
it('actual native-center routes preserve stop/start and clear as distinct reviewed effects through the shared preference owner', async () => {
    const f = historyGatewayFixture(); const owner = await f.open();
    expect(await f.call({ method: 'center.history.read', kind: 'diagnostics', clientId: owner.clientId })).toMatchObject({ state: 'ready', collection: { preference: 'off' }, retained: { snapshot: { entries: [] } } });
    const start = await f.call({ ...owner, method: 'center.collection.preview', kind: 'diagnostics', action: 'start' }) as Preview;
    expect(start.state).toBe('preview'); expect(f.port.set).not.toHaveBeenCalled();
    expect(await f.call({ ...owner, method: 'center.collection.confirm', operationId: start.operationId })).toMatchObject({ state: 'settled', reason: 'done', admittedAtObservation: true });
    const ticket = f.history.writer.admit('diagnostics', writerFact('settled'), () => true)!; await f.history.writer.flush();
    const stop = await f.call({ ...owner, method: 'center.collection.preview', kind: 'diagnostics', action: 'stop' }) as Preview;
    expect(await f.call({ ...owner, method: 'center.collection.confirm', operationId: stop.operationId })).toMatchObject({ state: 'settled', reason: 'done' });
    expect(f.history.writer.retention(ticket)).toBe('stored');
    const clear = await f.call({ ...owner, method: 'center.history.clear.preview', kind: 'diagnostics' }) as Preview; expect(clear.state).toBe('preview');
    expect(await f.call({ ...owner, method: 'center.history.clear.confirm', operationId: clear.operationId })).toMatchObject({ state: 'observed-cleared', acknowledgement: 'accepted' });
    expect(f.history.writer.retention(ticket)).toBe('untracked'); expect(f.sessions.reader.read).not.toHaveBeenCalled();
});
it.each([{ schemaVersion: 99 }, { malformed: true }])('history inspection preserves exact unreadable preferences %j; native source admission still applies', async initial => {
    const f = historyGatewayFixture(); const owner = await f.open(); f.values.set(SETTINGS_KEY, initial);
    for (const kind of ['recents', 'diagnostics']) {
        expect(await f.call({ method: 'center.history.read', kind, clientId: owner.clientId })).toMatchObject({ state: 'ready', collection: { preference: 'unknown' }, retained: { state: 'ready' } });
        const preview = await f.call({ ...owner, method: 'center.collection.preview', kind, action: 'start' });
        expect(preview).toEqual({ state: 'schemaVersion' in initial ? 'future' : 'corrupt' });
    }
    expect(f.values.get(SETTINGS_KEY)).toEqual(initial);
    expect(f.port.set).not.toHaveBeenCalled();
});
it('observers may inspect but cannot change collection or clear; takeover invalidates both kinds of old retained plan', async () => {
    const f = historyGatewayFixture(); const owner = await f.open();
    const start = await f.call({ ...owner, method: 'center.collection.preview', kind: 'recents', action: 'start' }) as Preview;
    const clear = await f.call({ ...owner, method: 'center.history.clear.preview', kind: 'diagnostics' }) as Preview;
    const source = { ...CENTER_SENDER, documentId: 'second-document', tab: { id: 2, incognito: false } }; const observer = await f.open(source);
    expect(await f.call({ method: 'center.history.read', kind: 'diagnostics', clientId: observer.clientId }, source)).toMatchObject({ state: 'ready' });
    expect(await f.call({ ...observer, method: 'center.collection.preview', kind: 'recents', action: 'start' }, source)).toEqual({ state: 'denied' });
    expect(await f.call({ ...observer, method: 'center.history.clear.confirm', operationId: clear.operationId }, source)).toEqual({ state: 'denied' });
    const claimed = await f.call({ method: 'center.claim', clientId: observer.clientId, controllerEpoch: observer.controllerEpoch }, source) as typeof owner;
    const next = { clientId: observer.clientId, controllerEpoch: claimed.controllerEpoch, credentialEpoch: observer.credentialEpoch };
    expect(await f.call({ ...owner, method: 'center.collection.confirm', operationId: start.operationId })).toEqual({ state: 'stale' });
    expect(await f.call({ ...next, method: 'center.collection.confirm', operationId: start.operationId }, source)).toEqual({ state: 'expired' });
    expect(await f.call({ ...next, method: 'center.history.clear.confirm', operationId: clear.operationId }, source)).toEqual({ state: 'expired' });
});
it('cancels retained operations without writes and never treats one review family as another', async () => {
    const f = historyGatewayFixture(); const owner = await f.open();
    const start = await f.call({ ...owner, method: 'center.collection.preview', kind: 'recents', action: 'start' }) as Preview;
    expect(await f.call({ ...owner, method: 'center.history.clear.confirm', operationId: start.operationId })).toEqual({ state: 'expired' });
    expect(await f.call({ ...owner, method: 'center.collection.cancel', operationId: start.operationId })).toEqual({ state: 'cancelled' });
    const clear = await f.call({ ...owner, method: 'center.history.clear.preview', kind: 'recents' }) as Preview;
    expect(await f.call({ ...owner, method: 'center.history.clear.cancel', operationId: clear.operationId })).toEqual({ state: 'cancelled' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('credential movement and foreign, private or reloaded native contexts cannot reuse an old client', async () => {
    const f = historyGatewayFixture(); const owner = await f.open();
    expect(await f.call({ ...owner, credentialEpoch: 9, method: 'center.collection.preview', kind: 'recents', action: 'start' })).toEqual({ state: 'stale' });
    for (const sender of [{ ...CENTER_SENDER, id: 'foreign' }, { ...CENTER_SENDER, url: 'https://github.com/octo/example' },
        { ...CENTER_SENDER, tab: { id: 1, incognito: true } }]) {
        expect(await f.call({ method: 'center.history.read', kind: 'diagnostics', clientId: owner.clientId }, sender)).toEqual({ state: 'rejected' });
    }
    expect(await f.call({ method: 'center.history.read', kind: 'diagnostics', clientId: owner.clientId }, { ...CENTER_SENDER, documentId: 'replacement' })).toEqual({ state: 'stale' });
    expect(f.policies.execute).not.toHaveBeenCalled(); expect(f.journals.execute).not.toHaveBeenCalled();
});
it('a stale credential during canonical read cannot publish a history view into the old context', async () => {
    const f = historyGatewayFixture(); const owner = await f.open(); const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementationOnce(async (...args) => { await f.sessions.service.revoke(); return execute(...args); });
    expect(await f.call({ method: 'center.history.read', kind: 'diagnostics', clientId: owner.clientId })).toEqual({ state: 'stale' });
});
it('a center without the history capability cannot turn a valid protocol message into a storage fallback', async () => {
    const f = historyGatewayFixture(false); const owner = await f.open();
    expect(await f.call({ method: 'center.history.read', kind: 'diagnostics', clientId: owner.clientId })).toEqual({ state: 'unavailable' });
    expect(f.policies.execute).not.toHaveBeenCalled(); expect(f.journals.execute).not.toHaveBeenCalled();
});
