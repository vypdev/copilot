import { expect, it, vi } from 'vitest';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { parseCenterMessage } from '../../src/domain/center_protocol.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { centerFixture, CENTER_BINDING, CENTER_SENDER } from '../fixtures/center.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { deferred } from '../fixtures/runtime.ts';

it('keeps session metadata and operations unavailable to GitHub content frames, foreign origins and private tabs', async () => {
    const h = namedSessionsFixture(); const owner = h.center.open();
    const gateway = new MessageGateway('test', 'chrome-extension://test/', h.center.repository, h.service,
        { currentTab: vi.fn(), openSettings: vi.fn(), cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() }, h.center.gateway);
    const input = { version: 1, method: 'center.connections.change', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch,
        credentialEpoch: owner.credentialEpoch, expectedRevision: 0, intent: CONNECTION_INPUT };
    for (const sender of [{ ...CENTER_SENDER, id: 'foreign' }, { ...CENTER_SENDER, url: 'https://evil.test/runtime.html' },
        { ...CENTER_SENDER, tab: { id: 1, incognito: true } }, { id: 'test', url: 'https://github.com/octo/example', frameId: 0,
            tab: { id: 1, url: 'https://github.com/octo/example', incognito: false } }]) {
        expect(await gateway.handle(input, sender)).toEqual({ state: 'rejected' });
        expect(await gateway.handle({ version: 1, method: 'center.connections.read', clientId: owner.clientId }, sender)).toEqual({ state: 'rejected' });
    }
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
});
it('separately checks editing role, native document, controller epoch and credential epoch before a session mutation', async () => {
    const h = namedSessionsFixture(); h.center.open({ ...CENTER_BINDING, tabId: 2, documentId: 'other' });
    const observer = h.center.open();
    const input = { version: 1, method: 'center.connections.change', clientId: observer.clientId, controllerEpoch: observer.controllerEpoch,
        credentialEpoch: observer.credentialEpoch, expectedRevision: 0, intent: CONNECTION_INPUT } as const;
    expect(await h.center.gateway.handle(input, CENTER_SENDER)).toEqual({ state: 'denied' });
    h.center.controller.claim(observer.clientId, CENTER_BINDING, observer.controllerEpoch);
    expect(await h.center.gateway.handle(input, CENTER_SENDER)).toEqual({ state: 'stale' });
    const current = h.center.controller.authorize(observer.clientId, CENTER_BINDING)!;
    expect(await h.center.gateway.handle({ ...input, controllerEpoch: current.controllerEpoch, credentialEpoch: 999 }, CENTER_SENDER)).toEqual({ state: 'stale' });
    expect(await h.center.gateway.handle({ ...input, controllerEpoch: current.controllerEpoch }, { ...CENTER_SENDER, documentId: 'forged' })).toEqual({ state: 'stale' });
    expect(h.reader.read).not.toHaveBeenCalled();
});
it('validates the entire connection request and cannot accept extra purpose, command or grant fields', () => {
    const input = { version: 1, method: 'center.connections.change', clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 1, expectedRevision: 0, intent: CONNECTION_INPUT };
    expect(parseCenterMessage(input)).toEqual(input);
    for (const value of [{ ...input, role: 'write' }, { ...input, expectedRevision: -1 }, { ...input, intent: { ...CONNECTION_INPUT, method: 'POST' } },
        { ...input, intent: { type: 'revoke-all', arbitraryKey: 'private' } }]) expect(parseCenterMessage(value)).toBeNull();
});
it('foreground observers and a mismatched installed source cannot submit credentials or accept private replies', async () => {
    const h = namedSessionsFixture(); h.center.open({ ...CENTER_BINDING, documentId: 'other', tabId: 2 });
    const c = centerClientFixture(h.center); await c.client.start(); await c.client.connections(CONNECTION_INPUT, 0);
    expect(c.client.view.connections).toEqual({ state: 'denied' }); expect(h.reader.read).not.toHaveBeenCalled();
    await c.client.takeControl(); const send = c.port.send.getMockImplementation()!;
    c.port.send.mockImplementation(async message => message.method === 'center.connections.read'
        ? { state: 'ready', secret: CONNECTION_INPUT.secret, sourceTree: 'a'.repeat(64) } : send(message));
    await c.client.connections(); expect(c.client.view.issue).toBe('incompatible'); expect(JSON.stringify(c.client.view)).not.toContain(CONNECTION_INPUT.secret);
    await c.client.connections(CONNECTION_INPUT, 0); expect(h.reader.read).not.toHaveBeenCalled(); c.client.stop();
});
it('does not request permission without a registered client and rejects an invalid foreground intent before transport', async () => {
    const h = namedSessionsFixture(); const c = centerClientFixture(h.center); const gesture = vi.fn(async () => CONNECTION_INPUT);
    await c.client.connections(gesture, 0); expect(gesture).not.toHaveBeenCalled();
    await c.client.start(); await c.client.connections({ ...CONNECTION_INPUT, secret: 'short' }, 0);
    expect(c.client.view.connections).toEqual({ state: 'invalid' });
    expect(c.port.send.mock.calls.some(([message]) => message.method === 'center.connections.change')).toBe(false);
    c.client.stop(); await c.client.connections(gesture, 0); expect(gesture).not.toHaveBeenCalled();
});
it('returns an unavailable capability rather than inventing session data when the optional connection composition is absent', async () => {
    const h = centerFixture(); const owner = h.open();
    expect(await h.gateway.handle({ version: 1, method: 'center.connections.read', clientId: owner.clientId }, CENTER_SENDER)).toEqual({ state: 'unavailable' });
    expect(await h.gateway.handle({ version: 1, method: 'center.connections.change', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch,
        credentialEpoch: owner.credentialEpoch, expectedRevision: 0, intent: CONNECTION_INPUT }, CENTER_SENDER)).toEqual({ state: 'unavailable' });
});
it.each(['gesture', 'response'] as const)('a late rejected %s cannot republish a disposed foreground view', async phase => {
    const h = namedSessionsFixture(); const c = centerClientFixture(h.center); await c.client.start(); const pending = deferred<never>();
    if (phase === 'response') c.port.send.mockImplementation(async () => pending.promise);
    const operation = c.client.connections(phase === 'gesture' ? () => pending.promise : null);
    c.client.stop(); const before = c.client.view; pending.reject(new Error('private late failure')); await operation;
    expect(c.client.view).toEqual(before); expect(c.client.view.phase).toBe('stopped');
});
