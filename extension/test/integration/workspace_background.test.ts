import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { workspaceReferences } from '../../src/domain/workspace_references.ts';
import type { CenterClient } from '../../src/application/center_client.ts';
const stops: (() => void)[] = []; afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture(configure?: Parameters<typeof backgroundCenterFixture>[0]) { const h = backgroundCenterFixture(configure); stops.push(h.stop); return h; }
async function save(client: CenterClient, intent: unknown) {
    await client.preview(intent, client.view.data!.settings!.revision); expect(client.view.review?.state).toBe('preview'); await client.confirm(); expect(client.view.review?.state).toBe('saved'); await client.dismiss();
}
async function connected() {
    const h = fixture(); const client = await h.client(); await client.connections(CONNECTION_INPUT, 0); await client.connections();
    const view = client.view.connections; if (view?.state !== 'ready' || !view.selected) throw new Error('native session');
    const group = { id: 'work', name: 'Authored work', members: [view.selected] };
    return { ...h, client, group };
}
it('actual background grouping uses only opaque preference references and performs no HTTP or new browser grant', async () => {
    const f = await connected(); const count = f.provider.mock.calls.length;
    await save(f.client, { type: 'workspace', change: { type: 'save', workspace: f.group } });
    const state = f.client.view.data!.settings!; expect(state.center.workspaces).toEqual([f.group]); expect(JSON.stringify(state.center)).not.toContain(CONNECTION_INPUT.secret); expect(JSON.stringify(state.center)).not.toContain('octo/example');
    expect(f.provider).toHaveBeenCalledTimes(count); expect(f.api.permissions.request).not.toHaveBeenCalled();
    await save(f.client, { type: 'workspace', change: { type: 'select', id: f.group.id } }); expect(f.provider).toHaveBeenCalledTimes(count);
    await save(f.client, { type: 'workspace', change: { type: 'remove', id: f.group.id } }); expect(f.client.view.data!.settings!.center.workspaces).toEqual([]); expect(f.provider).toHaveBeenCalledTimes(count);
});
it('disconnect makes the actual grouped private metadata absent without deleting the authored reference', async () => {
    const f = await connected(); await save(f.client, { type: 'workspace', change: { type: 'save', workspace: f.group } });
    const view = f.client.view.connections; if (view?.state !== 'ready') throw new Error('view');
    await f.client.connections({ type: 'disconnect' }, view.revision); await f.client.connections();
    expect(workspaceReferences(f.group, f.client.view.connections)).toMatchObject([{ state: 'missing', entry: null, connected: false }]);
    expect(f.client.view.data!.settings!.center.workspaces).toEqual([f.group]); expect(JSON.stringify(workspaceReferences(f.group, f.client.view.connections))).not.toContain('octo/example');
});
it('an actual preference import cannot bind copied references to the current private vault or change its active identity', async () => {
    const f = await connected(); const initial = f.client.view.connections;
    const settings = f.client.view.data!.settings!; const incoming = { ...settings, center: { ...settings.center, workspaces: [f.group], selectedWorkspace: f.group.id } };
    const calls = f.provider.mock.calls.length; await save(f.client, { type: 'import', settings: incoming });
    const restored = f.client.view.data!.settings!.center.workspaces[0]; expect(restored.members).toEqual(['unbound-0-0']);
    expect(workspaceReferences(restored, f.client.view.connections)).toMatchObject([{ entry: null, connected: false }]);
    expect(f.client.view.connections).toEqual(initial); expect(f.provider).toHaveBeenCalledTimes(calls);
});
it('legacy promotion in the actual native composition requires explicit verification and preserves its numeric target/read purpose', async () => {
    const f = fixture(browser => { browser.sessionValues.set(SESSION_KEY, CONNECTED); }); const client = await f.client();
    expect(client.view.connections).toMatchObject({ state: 'ready', selected: 'previous-session' }); expect(f.provider).not.toHaveBeenCalled();
    await client.connections({ type: 'select', id: 'previous-session' }, 0); await client.connections(); const view = client.view.connections;
    expect(view).toMatchObject({ state: 'ready', entries: [{ viewerId: '1', repositoryId: '7', role: 'repository-read' }] });
    if (view?.state !== 'ready') throw new Error('view'); expect(view.selected).toMatch(/^s-[a-f0-9]{32}$/u); expect(f.provider).toHaveBeenCalledTimes(2);
    expect(f.api.permissions.request).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt'] as const)('actual %s preferences block authored grouping without overwriting that source or inventing a saved empty group', async kind => {
    const raw = kind === 'future' ? { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, schemaVersion: 99 } } : { damaged: true };
    const f = fixture(browser => { browser.localValues.set(SETTINGS_KEY, raw); }); const client = await f.client();
    await client.preview({ type: 'workspace', change: { type: 'save', workspace: { id: 'g', name: 'Group', members: [] } } }, 0);
    expect(client.view.data).toMatchObject({ state: kind, settings: null }); expect(client.view.review).toBeNull(); expect(f.localValues.get(SETTINGS_KEY)).toEqual(raw); expect(f.provider).not.toHaveBeenCalled();
});
