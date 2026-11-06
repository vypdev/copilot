import { afterEach, vi } from 'vitest';
import { backgroundCenterFixture } from './background_center.ts';
import { centerClientFixture } from './center_client.ts';
import { render, ready } from './center_app_dom.ts';
import { CONNECTION_INPUT } from './named_sessions.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { sessionPreferenceCopy } from '../../src/presentation/session_preference_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
/** Full native page → private client → actual background composition. Browser/provider ports are deterministic. */
export async function sessionPreferenceCenterFixture(locale = 'en') {
    const h = backgroundCenterFixture(); stops.push(h.stop); const connection = await h.client(); await connection.connections(CONNECTION_INPUT, 0);
    const native = centerClientFixture(); native.port.send.mockImplementation(async message => ({ ...await h.call(message), sourceTree: native.port.sourceTree }));
    const app = await render('repositories/session', false, undefined, false, native, locale);
    const bridge = (value: unknown, sender = { id: h.api.runtime.id }) => { for (const listener of app.browser.onMessage.listeners) listener(value, sender, () => undefined); };
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async value => { bridge(value); return { state: 'notified' }; });
    await ready(() => !!document.querySelector('#session-density') && !document.querySelector('fieldset')?.disabled);
    vi.mocked(h.sessionArea.set).mockClear(); h.provider.mockClear(); const copy = sessionPreferenceCopy(locale);
    return { ...h, app, bridge, copy, common: centerCopy(locale), writes: () => vi.mocked(h.sessionArea.set).mock.calls.filter(([value]) => Object.hasOwn(value, SESSION_PREFERENCES_KEY)),
        operationText: () => document.querySelector('[data-session-preference-review]')?.textContent ?? '' };
}
