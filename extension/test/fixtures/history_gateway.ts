import { vi } from 'vitest';
import { createCenter } from '../../src/infrastructure/center_runtime.ts';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { collectionHistoryFixture } from './collection_history.ts';
import { browserFixture } from './browser.ts';
import { sessionHarness } from './runtime.ts';
import { CENTER_SENDER } from './center.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import type { CenterClient } from '../../src/application/center_controller.ts';

/** Real center factory, controller and both gateways; deterministic storage/provider ports, not a loaded browser. */
export function historyGatewayFixture(withHistory = true) {
    const f = collectionHistoryFixture(); f.ports.now.mockImplementation(() => Date.now());
    const browser = browserFixture(); const sessions = sessionHarness(); const notify = vi.fn();
    const center = createCenter(browser.api, f.history.settings, sessions.service, notify, undefined, withHistory ? { owner: f.history, policies: f.policies } : undefined);
    const main = new MessageGateway('test', 'chrome-extension://test/', f.history.settings, sessions.service,
        { currentTab: vi.fn(), openSettings: vi.fn(), cancellation: () => new BrowserCancellation(), online: () => true, notify }, center);
    const call = (message: unknown, sender: Sender = CENTER_SENDER) => main.handle({ version: 1, ...message as object }, sender);
    return { ...f, sessions, browser, notify, center, main, call, open: async (sender = CENTER_SENDER) => {
        const opened = await call({ method: 'center.open' }, sender) as CenterClient;
        if (opened.state !== 'ready') throw new Error('center-unavailable');
        return { clientId: opened.clientId, controllerEpoch: opened.controllerEpoch, credentialEpoch: opened.credentialEpoch };
    } };
}
