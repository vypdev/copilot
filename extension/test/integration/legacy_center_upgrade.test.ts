import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function fixture() { const h = backgroundCenterFixture(); stops.push(h.stop); return h; }

it('an old Connect command cannot create a serving identity outside the current named-session selection', async () => {
    const h = fixture(); const client = await h.client(); await client.connections(CONNECTION_INPUT, 0);
    const before = h.provider.mock.calls.length;
    expect(await h.call({ version: 1, method: 'session.connect', secret: 'synthetic_old_view', repository: 'octo/other' }))
        .toMatchObject({ state: 'rejected' });
    expect(h.provider).toHaveBeenCalledTimes(before); await client.connections();
    expect(client.view.connections).toMatchObject({ state: 'ready', connected: true, entries: [{ repositoryId: '7' }] });
});
it('an old settings write cannot bypass the current controller or preference review, even with an otherwise valid revision', async () => {
    const h = fixture(); const editor = await h.client(); const settings = editor.view.data!.settings!;
    const observer = { ...h.sender, documentId: 'old-options', tab: { id: 2, incognito: false } };
    expect(await h.call({ version: 1, method: 'settings.write', expectedRevision: settings.revision, settings: { ...settings, theme: 'dark' } }, observer))
        .toMatchObject({ state: 'rejected' });
    await editor.refresh(); expect(editor.view.data?.settings?.theme).toBe('github');
});
it('an old explicit Disconnect remains an absolute safety action and removes all protected session records without resetting preferences', async () => {
    const h = fixture(); const client = await h.client(); await client.connections(CONNECTION_INPUT, 0);
    await client.connections({ ...CONNECTION_INPUT, name: 'Other', secret: 'synthetic_other_view' }, 1);
    const before = client.view.data!.settings;
    expect(await h.call({ version: 1, method: 'session.disconnect' })).toMatchObject({ state: 'disconnected' });
    expect(h.sessionValues.has(SESSION_KEY)).toBe(false); expect(h.sessionValues.has(NAMED_SESSIONS_KEY)).toBe(false);
    await client.refresh(); expect(client.view.data?.settings).toEqual(before);
});
it.each(['none', 'preferences', 'emergency', 'saved'] as const)('an old native status read cannot restore credentials or bypass the %s restriction in the installed H3 center', async pause => {
    const h = backgroundCenterFixture(browser => {
        browser.sessionValues.set(SESSION_KEY, CONNECTED);
        browser.sessionValues.set(NAMED_SESSIONS_KEY, { schemaVersion: 1, revision: 1, selected: 'session-1', entries: [{ id: 'session-1', name: 'Work', host: 'github.com', role: 'repository-read', connection: CONNECTED }] });
        if (pause === 'preferences') browser.sessionValues.set(SESSION_PREFERENCES_KEY, { schemaVersion: 1, revision: 1, scope: { host: 'github.com', entryId: 'session-1', selectionRevision: 1, accountId: '1', repositoryId: '7' }, preferences: { paused: true } });
        if (pause === 'emergency') browser.sessionValues.set(TEMPORARY_PAUSES_KEY, { schemaVersion: 1, revision: 1, emergency: true, tabs: [] });
        browser.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, paused: pause === 'saved', repositories: { '7': { connected: true } } });
    }); stops.push(h.stop);
    expect(await h.call({ version: 1, method: 'session.status' })).toMatchObject({ state: 'disconnected' });
    expect(h.provider).not.toHaveBeenCalled(); expect(h.sessionArea.get).not.toHaveBeenCalledWith(SESSION_KEY);
});
