import { vi } from 'vitest';
import { pauseGatewayFixture } from './pause_gateway.ts';
import { centerClientFixture } from './center_client.ts';
import { render, ready } from './center_app_dom.ts';
import { pauseCopy } from '../../src/domain/pause_copy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

export async function pauseCenterFixture(locale = 'en', configure: (h: Awaited<ReturnType<typeof pauseGatewayFixture>>) => Promise<void> = async () => undefined) {
    const h = await pauseGatewayFixture(); await configure(h);
    const native = centerClientFixture(); native.port.send.mockImplementation(async message => ({ ...await h.call(message) as object, sourceTree: native.port.sourceTree }));
    const app = await render('repositories/pauses', false, undefined, false, native, locale);
    const bridge = (message: unknown, sender: { id: string; tab?: { id: number } } = { id: h.browser.api.runtime.id }) => {
        for (const listener of app.browser.onMessage.listeners) listener(message, sender, () => undefined);
    };
    vi.mocked(h.browser.api.runtime.sendMessage).mockImplementation(async value => { bridge(value); return { state: 'notified' }; });
    h.notify.mockImplementation(() => { bridge({ version: 1, method: 'center.invalidated' }); });
    h.native.ports.changed.mockImplementation(() => h.main.invalidate());
    const copy = pauseCopy(locale); await ready(() => text().includes(copy.reads.ready));
    return { ...h, app, copy, bridge,
        currentSettings: () => h.values.get(SETTINGS_KEY),
        text, operationText: () => document.querySelector('[data-pause-review]')?.textContent ?? '' };
}
export function text(): string { return document.querySelector('[data-native-pauses]')?.textContent ?? ''; }
