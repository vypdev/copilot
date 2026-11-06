import { afterEach, vi } from 'vitest';
import { backgroundCenterFixture } from './background_center.ts';
import { centerClientFixture } from './center_client.ts';
import { render, ready, button, change } from './center_app_dom.ts';
import { CONNECTION_INPUT } from './named_sessions.ts';
import { purposeEntry } from './credential_roles.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/native_session_vault.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { credentialRoleCopy } from '../../src/domain/credential_role_copy.ts';
import { connectionCopy } from '../../src/domain/connection_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import type { WritePurpose } from '../../src/domain/credential_roles.ts';
import type { CenterLocale } from '../../src/domain/center_copy_types.ts';
import type { SessionVault } from '../../src/domain/named_sessions.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
/** Actual page/client/background/GET composition with deterministic native/provider ports, not loaded-browser evidence. */
export async function purposeCenterFixture(read = true, locale: CenterLocale = 'en', settings?: unknown) {
    const h = backgroundCenterFixture(); stops.push(h.stop);
    if (read) { const client = await h.client(); await client.connections(CONNECTION_INPUT, 0); }
    if (settings !== undefined) h.localValues.set(SETTINGS_KEY, structuredClone(settings));
    const native = centerClientFixture(); native.port.send.mockImplementation(async message => ({ ...await h.call(message), sourceTree: native.port.sourceTree }));
    const app = await render('connections', false, undefined, false, native, locale);
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async value => {
        for (const listener of app.browser.onMessage.listeners) listener(value, { id: h.api.runtime.id }, () => undefined); return { state: 'notified' };
    });
    const copy = credentialRoleCopy(locale); const common = connectionCopy(locale); const center = centerCopy(locale);
    await ready(() => !button(common.connect).matches(':disabled')); h.provider.mockClear(); vi.mocked(h.sessionArea.set).mockClear(); vi.mocked(h.localArea.set).mockClear();
    const vault = () => h.sessionValues.get(NAMED_SESSIONS_KEY) as SessionVault | undefined;
    const id = (purpose: WritePurpose) => vault()!.entries.find(entry => entry.role === purpose)!.id;
    const fill = (purpose: WritePurpose = 'issues-write', name = 'Optional account') => {
        change('connection-purpose', purpose); change('connection-name', name); change('connection-repository', 'octo/example'); change('connection-secret', purposeEntry(purpose).connection.secret);
    };
    const add = async (purpose: WritePurpose = 'issues-write', name = 'Optional account') => {
        fill(purpose, name); button(common.connect).click(); await ready(() => !!vault()?.entries.some(entry => entry.name === name) && !button(common.connect).matches(':disabled')
            && (document.getElementById('connection-name') as HTMLInputElement).value === '');
    };
    return { ...h, app, copy, common, center, vault, id, fill, add,
        review: (purpose: WritePurpose = 'issues-write') => { (document.getElementById(`connection-select-${id(purpose)}`) as HTMLButtonElement).click(); },
        reviewText: () => document.querySelector('[data-role-review]')?.textContent ?? '',
        writes: () => vi.mocked(h.sessionArea.set).mock.calls.filter(([value]) => Object.hasOwn(value, NAMED_SESSIONS_KEY)) };
}
