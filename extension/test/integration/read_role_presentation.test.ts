// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { readRoleCenter } from '../fixtures/read_role_center.ts';
import { change, ready, button } from '../fixtures/center_app_dom.ts';

it.each(['issues-write', 'actions-write'] as const)('the profile form excludes the saved %s account while retaining real read scopes', async purpose => {
    const h = await readRoleCenter(purpose, 'profiles'); await ready(() => !!document.getElementById('profile-id')); change('profile-scope', 'repository');
    await ready(() => !!document.querySelector('#profile-account option[value="1"]'));
    expect([...document.querySelectorAll<HTMLOptionElement>('#profile-account option')].map(item => item.value)).toEqual(['', '1']);
    change('profile-account', '1'); expect([...document.querySelectorAll<HTMLOptionElement>('#profile-repository option')].map(item => item.value)).toEqual(['', '7']);
    expect(document.querySelector('#profile-account')?.textContent).not.toContain('writer'); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['issues-write', 'actions-write'] as const)('repository preference controls offer the read target only, while %s stays independently visible in Connections', async purpose => {
    const h = await readRoleCenter(purpose, 'repositories'); await ready(() => document.getElementById('repository-preferences-heading')?.closest('section')?.textContent?.includes('octo/example') === true);
    const section = document.getElementById('repository-preferences-heading')!.closest('section')!;
    expect(section.textContent).toContain('octo/example'); expect(section.textContent).not.toContain('writer/private');
    expect(document.querySelector('[aria-labelledby=connections-heading]')?.textContent).toContain('writer/private');
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.namedPorts.connected).not.toHaveBeenCalled();
});
it.each(['issues-write', 'actions-write'] as const)('a retained %s workspace reference has no read action or private label and remains editable as a missing slot', async purpose => {
    const h = await readRoleCenter(purpose, 'repositories/workspaces'); await ready(() => !!document.querySelector('[data-workspace-reference=session-2]'));
    const before = h.nativeVault(); const row = document.querySelector('[data-workspace-reference=session-2]')!;
    expect(row.textContent).toContain(h.workspace.missing); expect(row.textContent).not.toContain('writer/private'); expect(row.querySelector('button')).toBeNull();
    button(h.workspace.edit).click(); await ready(() => !!document.getElementById('workspace-member-session-2'));
    expect((document.getElementById('workspace-member-session-2') as HTMLInputElement).checked).toBe(true);
    expect(document.querySelector('[data-workspace-editor]')?.textContent).not.toContain('writer/private'); expect(h.nativeVault()).toEqual(before); expect(h.reader.read).not.toHaveBeenCalled();
});
