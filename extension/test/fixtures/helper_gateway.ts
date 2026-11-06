import { vi } from 'vitest';
import type { Sender } from '../../src/domain/protocol.ts';
import { MessageGateway, type GatewayPorts } from '../../src/application/message_gateway.ts';
import { SettingsRepository } from '../../src/application/settings_repository.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { memoryStore, sessionHarness, PAGE } from './runtime.ts';
import { helperSamplesFixture } from './helper_samples.ts';

export const HELPER_SENDER = { id: 'test', url: PAGE.route, documentId: 'source-document', frameId: 0, tab: { id: 1, url: PAGE.route, incognito: false } };
export function helperGatewayFixture() {
    const h = sessionHarness(); const local = memoryStore(); const settings = new SettingsRepository(local.port); const sample = helperSamplesFixture();
    const ports = { currentTab: vi.fn<GatewayPorts['currentTab']>(async () => ({ url: PAGE.route, incognito: false, active: true, windowId: 1 })),
        sourceTree: vi.fn(() => sample.source.sourceTree), openSettings: vi.fn<GatewayPorts['openSettings']>(async (_window, _command, receipt) => { if (receipt) sample.owner.attach(receipt, 2); return { id: 2 }; }),
        cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() };
    const gateway = new MessageGateway('test', 'chrome-extension://test/', settings, h.service, ports, undefined, undefined, sample.owner);
    const call = (value: unknown, sender: Sender = HELPER_SENDER) => gateway.handle(value, sender);
    return { ...h, ...local, settings, sample, ports, gateway, call,
        configure: (sender: Sender = HELPER_SENDER) => call({ ...PAGE, method: 'page.configuration', manual: false }, sender),
        packet: () => ({ version: 1, method: 'settings.open', health: { state: 'ready', sourceTree: sample.source.sourceTree,
            generation: PAGE.generation, credentialEpoch: h.service.status().epoch, settingsRevision: 0,
            health: { blocked: ['runtime-health'], events: [{ featureId: 'runtime-health', code: 'mount-failed', scope: 'active-at-observation' }] } } }) };
}
