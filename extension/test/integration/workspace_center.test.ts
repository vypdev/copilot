// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { workspaceCenter } from '../fixtures/workspace_center.ts';
import { button, change, ready } from '../fixtures/center_app_dom.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';

it.each(['en', 'es', 'fr', 'pt'] as const)('creates a reviewed workspace in %s without copying private labels or requesting another grant', async locale => {
    const f = await workspaceCenter(locale); const reads = vi.mocked(f.reader.read).mock.calls.length;
    await f.create('release', '<Release work>'); await f.preview();
    expect(document.querySelector('#settings-review-heading')?.closest('section')?.textContent).toContain(f.copy.saved); expect((await f.state()).center.workspaces).toEqual([]);
    await f.confirm(); expect((await f.state()).center.workspaces).toEqual([{ id: 'release', name: '<Release work>', members: ['session-1'] }]);
    expect(document.querySelector('[data-workspaces] h3')?.textContent).toBe('<Release work>'); expect(document.querySelector('release')).toBeNull();
    expect(JSON.stringify((await f.state()).center)).not.toContain('octo/example'); expect(JSON.stringify((await f.state()).center)).not.toContain(CONNECTION_INPUT.secret);
    expect(f.reader.read).toHaveBeenCalledTimes(reads); expect(f.app.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('canceling preview keeps the authored name and reference draft, and discard makes no write', async () => {
    const f = await workspaceCenter(); await f.create(); await f.preview(); button(f.review.cancel).click(); await ready(() => document.body.textContent?.includes(f.review.states.cancelled) === true);
    button(f.review.dismiss).click(); await ready(() => !document.querySelector('#settings-review-heading'));
    expect((document.querySelector('#workspace-name') as HTMLInputElement).value).toBe('Release work'); expect((await f.state()).center.workspaces).toEqual([]);
    button(f.copy.cancel).click(); flushSync(); expect(document.querySelector('[data-workspace-editor]')).toBeNull(); expect((await f.state()).center.workspaces).toEqual([]);
});
it('edits and removes membership through complete semantic preview rows instead of raw object paths', async () => {
    const f = await workspaceCenter(); await f.create(); await f.preview(); await f.confirm();
    button(f.copy.edit).click(); flushSync(); change('workspace-name', 'Review queue'); (document.querySelector('#workspace-member-session-1') as HTMLInputElement).click(); flushSync(); await f.preview();
    expect(document.querySelector('#settings-review-heading')?.closest('section')?.textContent).toContain('Review queue');
    expect(document.querySelector('#settings-review-heading')?.closest('section')?.textContent).not.toContain('center/workspaces/0'); await f.confirm();
    expect((await f.state()).center.workspaces[0]).toEqual({ id: 'release', name: 'Review queue', members: [] });
});
it('selecting and clearing a group leaves the read identity and protected credential unchanged', async () => {
    const f = await workspaceCenter(); await f.create(); await f.preview(); await f.confirm(); const epoch = f.service.status().epoch;
    button(f.copy.select).click(); await ready(() => !!document.querySelector('#settings-review-heading')); await f.confirm();
    expect((await f.state()).center.selectedWorkspace).toBe('release'); expect(f.service.status().epoch).toBe(epoch);
    button(f.copy.clear).click(); await ready(() => !!document.querySelector('#settings-review-heading')); await f.confirm();
    expect((await f.state()).center.selectedWorkspace).toBeNull(); expect(f.service.status().epoch).toBe(epoch);
});
it('workspace-only reset is reviewed, clears authored groups, and leaves the connected protected session alone', async () => {
    const f = await workspaceCenter(); await f.create(); await f.preview(); await f.confirm();
    button(f.copy.reset).click(); await ready(() => !!document.querySelector('#settings-review-heading')); expect((await f.state()).center.workspaces).toHaveLength(1); await f.confirm();
    expect((await f.state()).center.workspaces).toEqual([]); expect(f.service.status().state).toBe('connected');
});
it('a removed session becomes an unavailable reference and no old private name remains in the grouped view', async () => {
    const f = await workspaceCenter(); await f.create(); await f.preview(); await f.confirm();
    await f.connections.change({ type: 'disconnect' }, 1, f.current); button(f.copy.read).click();
    await ready(() => document.querySelector('[data-workspace-reference]')?.textContent?.includes(f.copy.missing) === true);
    expect(document.querySelector('[data-workspaces]')?.textContent).not.toContain('octo/example'); expect((await f.state()).center.workspaces[0].members).toEqual(['session-1']);
});
it('navigation keeps the typed workspace draft on stay and discards it only on the explicit leave action', async () => {
    const f = await workspaceCenter(); await f.create(); window.location.hash = '#/connections'; await ready(() => document.body.textContent?.includes('unsaved draft') === true);
    button('Keep editing').click(); flushSync(); expect((document.querySelector('#workspace-name') as HTMLInputElement).value).toBe('Release work');
    window.location.hash = '#/connections'; await ready(() => document.body.textContent?.includes('unsaved draft') === true); button('Discard draft and leave').click();
    await ready(() => document.querySelector('#connection-name') !== null); expect((await f.state()).center.workspaces).toEqual([]);
});
it('a source revision changed outside the editor cannot overwrite the typed group or save its obsolete preview', async () => {
    const f = await workspaceCenter(); await f.create(); await f.app.native.repository.update(value => ({ ...value, locale: 'en', theme: 'dark' }));
    for (const changed of f.app.browser.changed.listeners) changed({ [SETTINGS_KEY]: { newValue: {} } }, 'local'); await ready(() => document.body.textContent?.includes(f.copy.changed) === true);
    button(f.copy.review).click(); await ready(() => document.body.textContent?.includes('Settings changed after this draft') === true); expect(document.querySelector('#settings-review-heading')).toBeNull(); expect((document.querySelector('#workspace-name') as HTMLInputElement).value).toBe('Release work');
    expect((await f.state()).theme).toBe('dark'); expect((await f.state()).center.workspaces).toEqual([]);
});
it('a missing confirmation response stays unknown and explicit inspection never resubmits the accepted write', async () => {
    const f = await workspaceCenter(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => { const result = await send(message); if (message.method === 'center.confirm') throw new Error('private transport'); return result; });
    await f.create(); await f.preview(); button(f.review.confirm).click(); await ready(() => document.body.textContent?.includes(f.review.states.unknown) === true);
    expect((document.querySelector('#workspace-name') as HTMLInputElement).value).toBe('Release work'); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.confirm')).toHaveLength(1);
    button(f.review.reload).click(); await ready(() => document.querySelector('#settings-review-heading + p')?.textContent === f.review.states.saved);
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.confirm')).toHaveLength(1); expect(document.body.textContent).not.toContain('private transport');
});
it('invalid or duplicate authored IDs never silently edit an existing group from the create form', async () => {
    const f = await workspaceCenter(); await f.create(); await f.preview(); await f.confirm(); await f.create('release', 'Another');
    button(f.copy.review).click(); flushSync(); expect(document.querySelector('[data-workspace-editor] [role=alert]')?.textContent).toBe(f.copy.invalid);
    expect(document.querySelector('#settings-review-heading')).toBeNull(); expect((await f.state()).center.workspaces[0].name).toBe('Release work');
});
it('ten groups and twenty references remain bounded while an unknown reference can still be removed', async () => {
    const workspaces = Array.from({ length: 10 }, (_, i) => ({ id: `g-${i}`, name: `Group ${i}`, members: Array.from({ length: 20 }, (_, n) => `unknown-${n}`) }));
    const f = await workspaceCenter('en', { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, workspaces } });
    await ready(() => !!document.querySelector('[data-workspaces]')); expect(button(f.copy.create).disabled).toBe(true); button(f.copy.edit).click(); flushSync();
    await ready(() => !!document.querySelector('#workspace-member-session-1')); expect((document.querySelector('#workspace-member-session-1') as HTMLInputElement).disabled).toBe(true);
    (document.querySelector('#workspace-member-unknown-0') as HTMLInputElement).click(); flushSync(); expect((document.querySelector('#workspace-member-session-1') as HTMLInputElement).disabled).toBe(false);
});
it('an observer can inspect authored grouping and saved references but cannot open a mutation editor', async () => {
    const f = await workspaceCenter('en', undefined, true); await ready(() => !!document.querySelector('[data-workspaces]'));
    expect(button(f.copy.create).disabled).toBe(true); button(f.copy.create).click(); expect(document.querySelector('[data-workspace-editor]')).toBeNull();
});
it('legacy references are verified into a unique local session before the workspace editor can choose them', async () => {
    const { namedSessionsFixture } = await import('../fixtures/named_sessions.ts'); const { centerClientFixture } = await import('../fixtures/center_client.ts');
    const { render } = await import('../fixtures/center_app_dom.ts'); const { SESSION_KEY } = await import('../../src/application/protected_session.ts');
    const { CONNECTED } = await import('../fixtures/runtime.ts'); const { workspaceCopy } = await import('../../src/domain/workspace_copy.ts');
    const f = namedSessionsFixture(); f.values.set(SESSION_KEY, CONNECTED); const copy = workspaceCopy('en');
    const app = await render('repositories/workspaces', false, undefined, true, centerClientFixture(f.center), 'en');
    await ready(() => !!document.querySelector('[data-workspaces]') && document.body.textContent?.includes(copy.legacy) === true); expect(f.reader.read).not.toHaveBeenCalled();
    button(copy.promote).click(); await ready(() => !document.body.textContent?.includes(copy.legacy));
    button(copy.create).click(); await ready(() => !!document.querySelector('#workspace-member-session-1'));
    expect(document.querySelector('#workspace-member-previous-session')).toBeNull(); expect(f.reader.read).toHaveBeenCalledTimes(2); expect(app.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('workspace and profile identifier patterns accept hyphenated IDs under Unicode-set validation', async () => {
    const f = await workspaceCenter(); button(f.copy.create).click(); flushSync();
    const pattern = (document.querySelector('#workspace-id') as HTMLInputElement).pattern;
    const match = new RegExp(`^(?:${pattern})$`, 'v'); expect(match.test('release-work')).toBe(true); expect(match.test('Bad/path')).toBe(false); expect(match.test('release\\work')).toBe(false);
    window.location.hash = '#/profiles'; await ready(() => !!document.querySelector('#profile-id'));
    const profile = new RegExp(`^(?:${(document.querySelector('#profile-id') as HTMLInputElement).pattern})$`, 'v'); expect(profile.test('review-work')).toBe(true);
});
it('the explicit saved reference action performs its own verified selection, and authored group removal remains reviewed', async () => {
    const f = await workspaceCenter(); await f.create(); await f.preview(); await f.confirm(); const count = vi.mocked(f.reader.read).mock.calls.length;
    button(f.copy.verify).click(); await ready(() => vi.mocked(f.reader.read).mock.calls.length === count + 2); await ready(() => !button(f.copy.remove).disabled);
    button(f.copy.remove).click(); await ready(() => !!document.querySelector('#settings-review-heading')); await f.confirm(); expect((await f.state()).center.workspaces).toEqual([]);
});
it('a forced click on an observer’s reviewed grouping control cannot emit a preference preview', async () => {
    const value = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, workspaces: [{ id: 'g', name: 'Group', members: [] }] } };
    const f = await workspaceCenter('en', value, true); await ready(() => !!document.querySelector('[data-workspaces]'));
    button(f.copy.select).dispatchEvent(new MouseEvent('click', { bubbles: true })); flushSync();
    expect(document.querySelector('#settings-review-heading')).toBeNull(); expect(f.app.port.send.mock.calls.some(([message]) => message.method === 'center.preview')).toBe(false);
});
it('saved membership does not claim a connected identity when another named read session is selected', async () => {
    const f = await workspaceCenter(); await f.create(); await f.preview(); await f.confirm();
    await f.connections.change({ ...CONNECTION_INPUT, name: 'Other', secret: 'synthetic_other_credential' }, 1, f.current);
    button(f.copy.read).click(); await ready(() => document.querySelector('[data-workspace-reference]')?.textContent?.includes(f.copy.saved) === true
        && !document.querySelector('[data-workspace-reference]')?.textContent?.includes(f.copy.connected));
    expect((await f.state()).center.workspaces[0].members).toEqual(['session-1']); expect(f.service.status().state).toBe('connected');
});
