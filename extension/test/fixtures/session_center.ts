import { vi } from 'vitest';
import { sessionGatewayFixture } from './session_gateway.ts';
import { centerClientFixture } from './center_client.ts';
import { render, ready, change, button } from './center_app_dom.ts';
import { connectionCopy } from '../../src/domain/connection_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';
import { sessionCopy } from '../../src/domain/session_copy.ts';
import { CONNECTION_INPUT } from './named_sessions.ts';
import type { CenterLocale } from '../../src/domain/center_copy_types.ts';

export async function sessionCenterFixture(locale: CenterLocale = 'en', active = false) {
    const f = await sessionGatewayFixture(active); const native = centerClientFixture(); let app: Awaited<ReturnType<typeof render>> | null = null;
    const bridge = async (value: unknown) => {
        if (app) for (const listener of app.browser.onMessage.listeners) listener(value, { id: app.browser.api.runtime.id }, () => undefined);
        return { state: 'observed' };
    };
    vi.mocked(f.browser.api.runtime.sendMessage).mockImplementation(bridge); f.notify.mockImplementation(() => { void bridge({ version: 1, method: 'center.invalidated' }); });
    native.port.send.mockImplementation(async input => ({ ...await f.call(structuredClone(input)) as object, sourceTree: native.port.sourceTree }));
    app = await render('connections', false, undefined, true, native, locale);
    const copy = connectionCopy(locale); const op = operationCopy(locale); const center = centerCopy('auto', locale); const session = sessionCopy(locale);
    await ready(() => !!document.querySelector('#connection-name') && !button(copy.connect).matches(':disabled'));
    return { ...f, app, copy, op, center, session, bridge,
        fill: (name = 'Work') => { change('connection-name', name); change('connection-repository', CONNECTION_INPUT.repository); change('connection-secret', CONNECTION_INPUT.secret); },
        connect: async (name = 'Work') => { change('connection-name', name); change('connection-repository', CONNECTION_INPUT.repository); change('connection-secret', CONNECTION_INPUT.secret); button(copy.connect).click(); await ready(() => document.querySelector('[data-current-operation] [data-session-effects]')?.textContent?.includes(session.results.ready) === true && !button(copy.connect).matches(':disabled')
            && document.querySelector<HTMLInputElement>('#connection-name')?.value === ''); } };
}
export const sessionOperationText = () => document.querySelector('[data-current-operation]')?.textContent ?? '';
