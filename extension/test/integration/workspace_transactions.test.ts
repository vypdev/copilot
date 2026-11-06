import { expect, it, vi } from 'vitest';
import { settingsOperationsFixture, SETTINGS_OWNER as OWNER } from '../fixtures/settings_operations.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SettingsOperations } from '../../src/application/settings_operations.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { portableSettings } from '../../src/domain/portable_settings.ts';
const group = { id: 'release', name: 'Release work', members: ['previous-session'] };
const save = { type: 'workspace', change: { type: 'save', workspace: group } };
type Fixture = ReturnType<typeof settingsOperationsFixture>;
async function commit(h: Fixture, intent: unknown) {
    const revision = (await h.repository.read()).settings.revision; const plan = await h.operations.preview(intent, OWNER, revision);
    if (plan.state !== 'preview') throw new Error(`missing preview:${plan.state}`);
    const outcome = await h.operations.confirm(plan.operationId, plan.revision, OWNER); expect(outcome.state).toBe('committed'); return plan;
}
it('workspace preview and cancellation leave the complete source and native storage untouched', async () => {
    const h = settingsOperationsFixture(); h.values.set(SETTINGS_KEY, DEFAULT_SETTINGS);
    const result = await h.operations.preview(save, OWNER, 0); expect(result).toMatchObject({ state: 'preview', action: 'center-preferences' });
    if (result.state !== 'preview') throw new Error('preview'); h.operations.cancel(result.operationId, 0, OWNER);
    expect(h.values.get(SETTINGS_KEY)).toEqual(DEFAULT_SETTINGS); expect(h.port.set).not.toHaveBeenCalled();
});
it('confirmation retains its detached group plan and replays one exact canonical write', async () => {
    const h = settingsOperationsFixture(); const intent = structuredClone(save); const plan = await h.operations.preview(intent, OWNER, 0);
    if (plan.state !== 'preview') throw new Error('preview'); intent.change.workspace.name = 'Later caller mutation';
    const a = h.operations.confirm(plan.operationId, 0, OWNER); const b = h.operations.confirm(plan.operationId, 0, OWNER);
    expect(await a).toEqual(await b); expect(await h.operations.confirm(plan.operationId, 0, OWNER)).toEqual(await a);
    expect((await h.repository.read()).settings.center.workspaces).toEqual([group]); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('editing a group preserves its stable identity while a rollback retains the actual prior membership', async () => {
    const h = settingsOperationsFixture(); await commit(h, save);
    await commit(h, { type: 'workspace', change: { type: 'save', workspace: { ...group, name: 'Review', members: [] } } });
    expect((await h.repository.read()).settings.center.workspaces).toEqual([{ ...group, name: 'Review', members: [] }]);
    await commit(h, { type: 'rollback' }); expect((await h.repository.read()).settings.center.workspaces).toEqual([group]);
});
it('group selection never changes an independently connected identity, inherited pause or repository preference', async () => {
    const h = settingsOperationsFixture(); h.values.set('protected-witness', { secret: 'synthetic-private' });
    const initial = { ...DEFAULT_SETTINGS, paused: true, repositories: { '7': { connected: true, paused: true } } }; h.values.set(SETTINGS_KEY, initial);
    await commit(h, save); await commit(h, { type: 'workspace', change: { type: 'select', id: group.id } });
    const state = (await h.repository.read()).settings; expect(state.center.selectedWorkspace).toBe(group.id); expect(state.paused).toBe(true); expect(state.repositories).toEqual(initial.repositories);
    expect(h.values.get('protected-witness')).toEqual({ secret: 'synthetic-private' }); expect(h.port.remove).not.toHaveBeenCalled();
});
it('removing the selected authored group clears only the grouping selection', async () => {
    const h = settingsOperationsFixture(); await commit(h, save); await commit(h, { type: 'workspace', change: { type: 'select', id: group.id } });
    await commit(h, { type: 'workspace', change: { type: 'remove', id: group.id } });
    expect((await h.repository.read()).settings.center).toMatchObject({ workspaces: [], selectedWorkspace: null });
});
it('workspace-only reset preserves personal appearance, authored profiles and pauses', async () => {
    const h = settingsOperationsFixture(); h.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, theme: 'dark', paused: true });
    await commit(h, save); await commit(h, { type: 'workspace', change: { type: 'reset' } });
    expect((await h.repository.read()).settings).toMatchObject({ theme: 'dark', paused: true, center: { workspaces: [], selectedWorkspace: null } });
});
it('portable workspace state stays nonsecret and imported references cannot supply a native connection grant', async () => {
    const h = settingsOperationsFixture(); await commit(h, save); const current = (await h.repository.read()).settings;
    const portable = portableSettings({ ...current, repositories: { '7': { connected: true } } })!;
    expect(portable.center.workspaces).toEqual([group]); expect(portable.repositories['7']).not.toHaveProperty('connected');
    const other = settingsOperationsFixture(); await commit(other, { type: 'import', settings: portable });
    expect((await other.repository.read()).settings.repositories['7']?.connected).not.toBe(true);
    expect(JSON.stringify(other.values.get(SETTINGS_KEY))).not.toContain('synthetic-private');
});
it.each(['controller', 'credential'] as const)('a changed %s fence cannot confirm an earlier workspace preview', async kind => {
    const h = settingsOperationsFixture(); const plan = await h.operations.preview(save, OWNER, 0); if (plan.state !== 'preview') throw new Error('preview');
    if (kind === 'controller') h.takeover(); else h.disconnect();
    expect(await h.operations.confirm(plan.operationId, 0, OWNER)).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a newer preference revision cannot be overwritten by a stale grouping preview', async () => {
    const h = settingsOperationsFixture(); const plan = await h.operations.preview(save, OWNER, 0); if (plan.state !== 'preview') throw new Error('preview');
    await h.repository.update(value => ({ ...value, locale: 'fr' }));
    expect(await h.operations.confirm(plan.operationId, 0, OWNER)).toEqual({ state: 'conflict' });
    expect((await h.repository.read()).settings).toMatchObject({ locale: 'fr', center: { workspaces: [] } });
});
it.each([true, false])('a failed workspace write acknowledgement is canonically inspected once (persisted=%s)', async persisted => {
    const h = settingsOperationsFixture(); const plan = await h.operations.preview(save, OWNER, 0); if (plan.state !== 'preview') throw new Error('preview');
    const write = vi.mocked(h.port.set).getMockImplementation()!; vi.mocked(h.port.set).mockImplementationOnce(async (key, value) => { if (persisted) await write(key, value); throw new Error('private quota'); });
    const result = await h.operations.confirm(plan.operationId, 0, OWNER); expect(result.state).toBe(persisted ? 'committed' : 'unknown');
    expect(await h.operations.confirm(plan.operationId, 0, OWNER)).toEqual(result); expect(h.port.set).toHaveBeenCalledOnce(); expect(JSON.stringify(result)).not.toContain('private quota');
});
it.each(['future', 'corrupt', 'migration'] as const)('a %s settings document remains untouched instead of becoming an empty authored group', async kind => {
    const h = settingsOperationsFixture(); const { workspaces: _w, selectedWorkspace: _s, ...old } = DEFAULT_SETTINGS.center;
    const raw = kind === 'future' ? { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, schemaVersion: 99 } }
        : kind === 'corrupt' ? { damaged: true } : { ...DEFAULT_SETTINGS, center: { ...old, schemaVersion: 1 } };
    h.values.set(SETTINGS_KEY, raw); expect(await h.operations.preview(save, OWNER, 0)).toEqual({ state: kind === 'future' ? 'future' : kind === 'corrupt' ? 'corrupt' : 'migration-required' });
    expect(h.values.get(SETTINGS_KEY)).toEqual(raw); expect(h.port.set).not.toHaveBeenCalled();
});
it('current operation capture uses the exact authored group and fixed subroute, not protected target metadata', async () => {
    const h = settingsOperationsFixture(); const observe = vi.fn(() => null); const operations = new SettingsOperations(h.repository, { ...h.ports, observe });
    await operations.preview(save, OWNER, 0);
    expect(observe).toHaveBeenCalledWith(OWNER, 'center-preferences', { location: { route: 'repositories', detail: 'workspaces' }, label: group.name }, expect.any(Function));
});
it('workspace reset captures the broad authored scope without inventing a single private target', async () => {
    const h = settingsOperationsFixture(); h.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, workspaces: [group] } });
    const observe = vi.fn(() => null); const operations = new SettingsOperations(h.repository, { ...h.ports, observe });
    await operations.preview({ type: 'workspace', change: { type: 'reset' } }, OWNER, 0);
    expect(observe).toHaveBeenCalledWith(OWNER, 'center-preferences', { location: { route: 'repositories', detail: 'workspaces' }, label: null }, expect.any(Function));
});
