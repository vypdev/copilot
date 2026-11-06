import { expect, it } from 'vitest';
import { workspaceReferences } from '../../src/domain/workspace_references.ts';
import { connectionsView } from '../../src/domain/named_sessions.ts';
import { DEFAULT_SETTINGS, importedSettings } from '../../src/domain/settings.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';

it('the fixed legacy alias cannot bind a persisted workspace to another installation’s private identity', () => {
    const view = connectionsView({ schemaVersion: 1, revision: 0, selected: 'previous-session', entries: [
        { id: 'previous-session', name: 'GitHub', host: 'github.com', role: 'repository-read', connection: { ...CONNECTED, schemaVersion: 1 } },
    ] }, true);
    expect(workspaceReferences({ id: 'g', name: 'Group', members: ['previous-session'] }, view)).toMatchObject([{ state: 'missing', entry: null, connected: false }]);
});
it('imported membership remains unbound even if a foreign opaque ID happens to exist in the current protected vault', () => {
    const incoming = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, workspaces: [{ id: 'g', name: 'Group', members: ['session-1'] }], selectedWorkspace: 'g' } };
    const imported = importedSettings(DEFAULT_SETTINGS, incoming);
    expect(imported.center.workspaces[0].members[0]).toMatch(/^unbound-/u); expect(incoming.center.workspaces[0].members).toEqual(['session-1']);
});
it('an explicit verified legacy selection promotes its local alias without changing the numeric account/repository or purpose', async () => {
    const f = namedSessionsFixture(); f.values.set(SESSION_KEY, CONNECTED);
    expect(await f.connections.read(f.current)).toMatchObject({ state: 'ready', selected: 'previous-session' });
    const result = await f.connections.change({ type: 'select', id: 'previous-session' }, 0, f.current);
    expect(result).toMatchObject({ state: 'ready', connected: true, selected: 'session-1', entries: [{ id: 'session-1', repositoryId: '7', viewerId: '1', role: 'repository-read' }] });
    expect(JSON.stringify(result)).not.toContain(CONNECTION_INPUT.secret);
});
it('cold named metadata inspection never starts provider verification or mutates the protected source', async () => {
    const f = namedSessionsFixture(); f.values.set(SESSION_KEY, CONNECTED); const before = JSON.stringify(f.values.get(SESSION_KEY));
    expect(await f.connections.read(f.current)).toMatchObject({ state: 'ready', connected: false, selected: 'previous-session' });
    expect(f.reader.read).not.toHaveBeenCalled(); expect(f.port.set).not.toHaveBeenCalled(); expect(f.port.remove).not.toHaveBeenCalled();
    expect(JSON.stringify(f.values.get(SESSION_KEY))).toBe(before);
});
