import { afterEach, vi } from 'vitest';
import { createCenter } from '../../src/infrastructure/center_runtime.ts';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { HelperSamples } from '../../src/application/helper_samples.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { collectionHistoryFixture } from './collection_history.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';
import { centerClientFixture } from './center_client.ts';
import { browserFixture } from './browser.ts';
import { sessionHarness, PAGE } from './runtime.ts';
import { helperIntent } from './helper_samples.ts';
import { render, ready, button } from './center_app_dom.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { helperCopy } from '../../src/domain/helper_copy.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import type { HelperSampleIntent } from '../../src/domain/helper_sample.ts';
import { validJournalSnapshot } from '../../src/domain/local_journal.ts';

const owners: (() => void)[] = [];
afterEach(() => { owners.splice(0).forEach(stop => stop()); });
/** Actual native application/gateway/options composition with deterministic ports; not a loaded-browser proof. */
export async function helperCenterFixture(locale = 'en', retaining = false, capture: 'ready' | 'empty' | 'unavailable' | 'none' = 'ready') {
    const f = collectionHistoryFixture(); f.ports.now.mockImplementation(() => Date.now()); f.values.set(SETTINGS_KEY, collectionSettings(retaining));
    if (retaining) f.policiesData.set('diagnostics', activeCollectionPolicy()); await f.history.refresh();
    const browser = browserFixture(); const sessions = sessionHarness(); const native = centerClientFixture(); const sourceTree = native.port.sourceTree;
    const notify = vi.fn(); const helpers = new HelperSamples({ now: () => Date.now(), changed: () => { void browser.api.runtime.sendMessage({ version: 1, method: 'center.health.invalidated' }); },
        admit: (fact, current) => f.history.writer.admit('diagnostics', fact, current), retention: ticket => f.history.writer.retention(ticket) });
    const center = createCenter(browser.api, f.history.settings, sessions.service, notify, undefined, { owner: f.history, policies: f.policies }, helpers);
    const main = new MessageGateway('test', 'chrome-extension://test/', f.history.settings, sessions.service,
        { sourceTree: () => sourceTree, currentTab: vi.fn(async () => ({ url: PAGE.route, active: true, incognito: false, windowId: 1 })),
            openSettings: vi.fn(async (_window, _command, receipt) => { if (receipt) helpers.attach(receipt, 2); return { id: 2 }; }),
            cancellation: () => new BrowserCancellation(), online: () => true, notify }, center, undefined, helpers);
    owners.push(() => { f.history.stop(); main.shutdown(); });
    const source: Sender = { id: 'test', frameId: 0, documentId: 'private_helper_origin_document', url: PAGE.route, tab: { id: 1, url: PAGE.route, incognito: false } };
    const sender: Sender = { id: 'test', frameId: 0, documentId: 'private_helper_options_document', url: 'chrome-extension://test/runtime.html', tab: { id: 2, incognito: false } };
    const call = (input: unknown, from = sender) => main.handle(input, from);
    if (capture !== 'none') {
        const configured = await call({ ...PAGE, method: 'page.configuration', manual: false }, source) as { epoch: number; settings: { revision: number } };
        const intent: HelperSampleIntent = capture === 'unavailable' ? { state: 'unavailable', sourceTree } : { ...helperIntent(), sourceTree,
            generation: PAGE.generation, credentialEpoch: configured.epoch, settingsRevision: configured.settings.revision,
            ...(capture === 'empty' ? { health: { blocked: [], events: [] } } : {}) };
        await call({ version: 1, method: 'settings.open', health: intent }, source);
    }
    native.port.send.mockImplementation(async input => ({ ...await call(input) as object, sourceTree }));
    const app = await render('diagnostics', false, undefined, true, native, locale);
    const bridge = async (value: unknown) => {
        for (const listener of app.browser.onMessage.listeners) listener(value, { id: app.browser.api.runtime.id }, () => undefined);
        return { state: 'observed' };
    };
    vi.mocked(browser.api.runtime.sendMessage).mockImplementation(bridge); notify.mockImplementation(() => { void bridge({ version: 1, method: 'center.invalidated' }); });
    const copy = helperCopy(locale); await ready(() => document.querySelector('[data-helper-sample]')?.getAttribute('aria-busy') === 'false' && helperText().includes(copy.phases.ready) && document.querySelector('[data-history=diagnostics]')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('[data-history-consent]'));
    return { ...f, helpers, main, center, source, sender, call, app, browser, sessions, copy, bridge, sourceTree,
        read: async () => { button(copy.read).click(); await ready(() => document.querySelector('[data-helper-sample]')?.getAttribute('aria-busy') === 'false'); },
        rows: () => { const snapshot = f.documents.get('diagnostics'); return validJournalSnapshot('diagnostics', snapshot) ? snapshot.entries : []; } };
}
export function helperText(): string { return document.querySelector('[data-helper-sample]')?.textContent ?? ''; }
