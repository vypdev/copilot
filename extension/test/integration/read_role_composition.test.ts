// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { purposeCenterFixture } from '../fixtures/purpose_center.ts';
import { button, change, navigate, ready } from '../fixtures/center_app_dom.ts';
import { workspaceCopy } from '../../src/domain/workspace_copy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import type { WritePurpose } from '../../src/domain/credential_roles.ts';

async function fixture(purpose: WritePurpose, read = true) {
    const h = await purposeCenterFixture(read); h.provider.mockImplementation(async url => {
        const data = url.endsWith('/user') ? { id: 2, login: 'writer' } : { id: 8, full_name: 'octo/example', owner: { type: 'Organization', id: 9, login: 'octo' } };
        const response = new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }); Object.defineProperty(response, 'url', { value: url }); return response;
    });
    await h.add(purpose); h.provider.mockClear(); return h;
}
it.each(['issues-write', 'actions-write'] as const)('a standalone native page with only %s does not gain read account scopes or reconnect a credential', async purpose => {
    const h = await fixture(purpose, false); await navigate('profiles'); await ready(() => !!document.getElementById('profile-id')); change('profile-scope', 'repository');
    expect([...document.querySelectorAll<HTMLOptionElement>('#profile-account option')].map(item => item.value)).toEqual(['']);
    expect(h.vault()?.selected).toBeNull(); expect(h.provider).not.toHaveBeenCalled(); expect(h.localArea.set).not.toHaveBeenCalled();
});
it.each(['issues-write', 'actions-write'] as const)('selecting and freshly verifying %s through the native page still cannot make it a new read workspace member', async purpose => {
    const h = await fixture(purpose); h.review(purpose); await ready(() => !!document.querySelector('[data-role-review]')); button(h.copy.confirm).click();
    await ready(() => h.reviewText().includes(h.copy.saved)); button(h.copy.close).click(); h.provider.mockClear(); await navigate('repositories/workspaces');
    const copy = workspaceCopy('en'); await ready(() => !!document.querySelector('[data-workspaces]')); button(copy.create).click();
    const read = h.vault()!.entries.find(entry => entry.role === 'repository-read')!.id; await ready(() => !!document.getElementById(`workspace-member-${read}`));
    expect(document.getElementById(`workspace-member-${h.id(purpose)}`)).toBeNull(); expect(h.provider).not.toHaveBeenCalled(); expect(h.localArea.set).not.toHaveBeenCalled();
});
it.each(['issues-write', 'actions-write'] as const)('previously saved native grouping that names %s preserves its slot without offering a misleading read-selection action', async purpose => {
    const h = await fixture(purpose); const id = h.id(purpose); const stored = h.localValues.get(SETTINGS_KEY) as { current: typeof DEFAULT_SETTINGS }; const current = stored.current;
    h.localValues.set(SETTINGS_KEY, { previous: current, current: { ...current, revision: current.revision + 1, center: { ...current.center, workspaces: [{ id: 'retained', name: 'Retained group', members: [id] }] } } });
    for (const listener of h.changed.listeners) listener({ [SETTINGS_KEY]: {} }, 'local');
    for (const listener of h.app.browser.changed.listeners) listener({ [SETTINGS_KEY]: {} }, 'local'); await navigate('repositories/workspaces');
    await ready(() => !!document.querySelector(`[data-workspace-reference="${id}"]`)); const row = document.querySelector(`[data-workspace-reference="${id}"]`)!;
    expect(row.textContent).toContain(workspaceCopy('en').missing); expect(row.textContent).not.toContain('Optional account'); expect(row.querySelector('button')).toBeNull();
    expect(h.provider).not.toHaveBeenCalled(); expect(h.vault()!.entries.some(entry => entry.id === id)).toBe(true); expect(h.localArea.set).not.toHaveBeenCalled();
});
