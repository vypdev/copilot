import { expect, it, vi } from 'vitest';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { CENTER_BINDING, CENTER_SENDER } from '../fixtures/center.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';

it.each(['content', 'foreign', 'private'] as const)('the new address operand cannot give a %s sender native session authority', async kind => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current); const owner = h.center.open();
    const gateway = new MessageGateway('test', 'chrome-extension://test/', h.center.repository, h.service,
        { currentTab: vi.fn(), openSettings: vi.fn(), cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() }, h.center.gateway);
    const sender = kind === 'content' ? { id: 'test', url: 'https://github.com/octo/example', frameId: 0, tab: { id: 1, url: 'https://github.com/octo/example', incognito: false } }
        : kind === 'foreign' ? { ...CENTER_SENDER, id: 'other' } : { ...CENTER_SENDER, tab: { id: 1, incognito: true } };
    expect(await gateway.handle({ version: 1, method: 'center.connections.change', clientId: owner.clientId,
        controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch, expectedRevision: 1,
        intent: { type: 'select', id: 'session-1', repository: 'team/renamed' } }, sender)).toEqual({ state: 'rejected' });
    expect(h.reader.read).toHaveBeenCalledTimes(2); expect(h.service.verifiedIdentity()?.repository).toBe('octo/example'); gateway.shutdown();
});
it.each(['document', 'epoch', 'observer'] as const)('native %s fencing rejects a relocation before invalidating the saved serving identity', async kind => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    if (kind === 'observer') h.center.open({ ...CENTER_BINDING, documentId: 'other', tabId: 2 });
    const owner = h.center.open(); const sender = kind === 'document' ? { ...CENTER_SENDER, documentId: 'forged' } : CENTER_SENDER;
    expect(await h.center.gateway.handle({ version: 1, method: 'center.connections.change', clientId: owner.clientId,
        controllerEpoch: owner.controllerEpoch, credentialEpoch: kind === 'epoch' ? owner.credentialEpoch + 1 : owner.credentialEpoch,
        expectedRevision: 1, intent: { type: 'select', id: 'session-1', repository: 'team/renamed' } }, sender)).toEqual({ state: kind === 'observer' ? 'denied' : 'stale' });
    expect(h.reader.read).toHaveBeenCalledTimes(2); expect(h.service.verifiedIdentity()?.repository).toBe('octo/example');
});
