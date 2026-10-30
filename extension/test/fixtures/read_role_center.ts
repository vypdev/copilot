import { vi } from 'vitest';
import { purposeSessionsFixture } from './purpose_sessions.ts';
import { centerClientFixture } from './center_client.ts';
import { render, ready } from './center_app_dom.ts';
import { requestResult } from './runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { workspaceCopy } from '../../src/domain/workspace_copy.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/native_session_vault.ts';
import type { WritePurpose } from '../../src/domain/credential_roles.ts';

/** Actual native center/client with a deterministic application/provider port, distinct from background composition. */
export async function readRoleCenter(purpose: WritePurpose, route: string) {
    const h = purposeSessionsFixture(); await h.addRead();
    vi.mocked(h.reader.read).mockImplementation(async request => ({ ...requestResult(request), data: request.type === 'viewer'
        ? { id: '2', login: 'writer' } : { id: '8', name: 'writer/private', organizationId: '9' } }));
    await h.add(purpose, 1); h.resetCalls(); vi.mocked(h.reader.read).mockImplementation(async request => requestResult(request));
    const initial = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, workspaces: [{ id: 'old', name: 'Retained group', members: ['session-2', 'session-1'] }] } };
    const app = await render(route, false, initial, true, centerClientFixture(h.center), 'en');
    await ready(() => app.port.send.mock.calls.some(([message]) => message.method === 'center.connections.read'));
    return { ...h, app, center: centerCopy('en'), workspace: workspaceCopy('en'),
        nativeVault: () => structuredClone(h.values.get(NAMED_SESSIONS_KEY)) };
}
