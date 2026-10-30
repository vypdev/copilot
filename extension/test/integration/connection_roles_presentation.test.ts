// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { roleUiFixture as fixture, roleButton as button, roleChoice, roleReviewText } from '../fixtures/connection_roles_ui.ts';
import { purposeVault } from '../fixtures/credential_roles.ts';
import { connectionsView } from '../../src/domain/named_sessions.ts';
import { deferred } from '../fixtures/runtime.ts';
import { purposeEntry } from '../fixtures/credential_roles.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';

it('the purpose selector defaults to read and has complete accessible bounded choices before any credential is submitted', () => {
    const h = fixture(); const field = document.getElementById('connection-purpose') as HTMLSelectElement;
    expect(field.value).toBe('repository-read'); expect(field.options).toHaveLength(3); expect(document.querySelector('label[for=connection-purpose]')?.textContent).toBe(h.copy.purpose);
    expect(document.body.textContent).toContain(h.copy.hints['repository-read']); expect(h.actions.connect).not.toHaveBeenCalled();
});
it.each(['issues-write', 'actions-write'] as const)('choosing %s explains its separate fine-grained grants and unavailable operation controls without making a request', purpose => {
    const h = fixture(); roleChoice(purpose); expect(document.body.textContent).toContain(h.copy.hints[purpose]); expect(document.body.textContent).toContain(h.copy.availability);
    expect(h.actions.change).not.toHaveBeenCalled(); expect(h.actions.connect).not.toHaveBeenCalled();
});
it('native credential input is unbound and is not copied into visible text, HTML attributes or role review state', () => {
    const h = fixture(); const field = document.getElementById('connection-secret') as HTMLInputElement; field.value = 'github_pat_synthetic_private'; field.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(document.body.textContent).not.toContain(field.value); expect(document.body.innerHTML).not.toContain(field.value);
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); expect(h.actions.connect).toHaveBeenCalledWith(document.querySelector('form'));
});
it('explicit draft reset clears the native secret and restores a consistent read purpose and guidance', () => {
    const h = fixture(); roleChoice('issues-write'); const secret = document.getElementById('connection-secret') as HTMLInputElement; secret.value = 'github_pat_synthetic_private';
    button(h.copy.discard).click(); flushSync(); expect(secret.value).toBe(''); expect((document.getElementById('connection-purpose') as HTMLSelectElement).value).toBe('repository-read');
    expect(document.body.textContent).toContain(h.copy.hints['repository-read']); expect(h.actions.dirty).toHaveBeenLastCalledWith(false); expect(h.actions.change).not.toHaveBeenCalled();
});
it('each named identity has its actual purpose label and an unselected writer cannot claim read connected state', () => {
    const h = fixture(); const rows = [...document.querySelectorAll('.cards li')]; expect(rows[1].textContent).toContain(h.copy.labels['issues-write']);
    expect(rows[2].textContent).toContain(h.copy.labels['actions-write']); expect(rows[2].textContent).toContain(h.copy.unselected);
    expect(rows[1].textContent).toContain(h.copy.states.stored); expect(rows[0].textContent).toContain(h.common.connected);
});
it('a selected purpose can be disabled explicitly against the observed native revision without submitting a secret', () => {
    const h = fixture(); button(h.copy.disable).click(); expect(h.actions.change).toHaveBeenCalledExactlyOnceWith({ type: 'disable-role', purpose: 'issues-write' }, 4);
});
it.each(['observer', 'busy', 'authored-draft'] as const)('%s controls reject synthetic optional disable, review and form submission effects', kind => {
    const h = fixture(false, { editable: kind !== 'observer', busy: kind === 'busy', hasDraft: kind === 'authored-draft' });
    button(h.copy.disable).dispatchEvent(new MouseEvent('click', { bubbles: true })); button(h.copy.review).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    if (kind !== 'authored-draft') document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(h.actions.change).not.toHaveBeenCalled(); expect(document.querySelector('[data-role-review]')).toBeNull(); if (kind !== 'authored-draft') expect(h.actions.connect).not.toHaveBeenCalled();
});
it('opening an optional selection captures an exact row, purpose and revision before any selection is requested', () => {
    const h = fixture(); button(h.copy.review).click(); flushSync(); expect(roleReviewText()).toContain('Issue triage'); expect(roleReviewText()).toContain(h.copy.independent);
    expect(h.actions.change).not.toHaveBeenCalled(); expect(h.actions.focusReview).toHaveBeenCalledOnce(); expect(h.actions.dirty).toHaveBeenLastCalledWith(true);
    button(h.copy.cancel).click(); flushSync(); expect(document.querySelector('[data-role-review]')).toBeNull(); expect(h.actions.focusSession).toHaveBeenCalledWith('issues'); expect(h.actions.dirty).toHaveBeenLastCalledWith(false);
});
it('read selection remains a direct read-purpose operation rather than entering an optional selection review', () => {
    const h = fixture(); button(h.common.select).click(); expect(h.actions.change).toHaveBeenCalledExactlyOnceWith({ type: 'select', id: 'read' }, 4); expect(document.querySelector('[data-role-review]')).toBeNull();
});
it('the reviewed selection submits one exact ID/revision and distinguishes its observed receipt from a write grant', async () => {
    const h = fixture(true); button(h.copy.confirm).click(); await vi.waitFor(() => { flushSync(); expect(roleReviewText()).toContain(h.copy.saved); });
    expect(h.actions.change).toHaveBeenCalledExactlyOnceWith({ type: 'select', id: 'issues' }, 4); expect(document.querySelector('[data-role-review]')?.textContent).toContain(h.copy.grant);
    expect([...document.querySelectorAll('button')].some(node => node.textContent === h.copy.confirm)).toBe(false);
});
it('pending selection rejects a second confirmation and prevents closing until the original native request settles', async () => {
    const h = fixture(true); const pending = deferred<number | null>(); h.actions.change.mockReturnValueOnce(pending.promise); const confirm = button(h.copy.confirm);
    confirm.click(); confirm.dispatchEvent(new MouseEvent('click', { bubbles: true })); flushSync(); expect(roleReviewText()).toContain(h.copy.pending);
    expect(button(h.copy.close).disabled).toBe(true); expect(h.actions.change).toHaveBeenCalledTimes(1); pending.resolve(5);
    await vi.waitFor(() => { flushSync(); expect(roleReviewText()).toContain(h.copy.saved); });
});
it.each(['lost', 'rejected', 'wrong-revision'] as const)('a %s response retains uncertainty and offers a read, never an automatic replay', async outcome => {
    const h = fixture(true); if (outcome === 'rejected') h.actions.change.mockRejectedValueOnce(new Error('private transport failure'));
    else h.actions.change.mockResolvedValueOnce(outcome === 'lost' ? null : 8);
    button(h.copy.confirm).click(); await vi.waitFor(() => { flushSync(); expect(roleReviewText()).toContain(h.copy.unknown); });
    expect(roleReviewText()).toContain(h.copy.navigation); expect(roleReviewText()).not.toContain('private transport failure'); button(h.copy.refresh).click(); expect(h.actions.refresh).toHaveBeenCalledOnce();
    h.update({ view: connectionsView({ ...purposeVault(), revision: 5 }, true) }); expect(roleReviewText()).toContain(h.copy.unknown); expect(h.actions.change).toHaveBeenCalledTimes(1);
});
it.each(['revision', 'account', 'repository', 'purpose', 'unavailable'] as const)('a changed %s source retires private review labels and disables the old native selection', kind => {
    const h = fixture(true); const vault = purposeVault(); const changed = { ...vault, entries: vault.entries.map(entry => entry.id !== 'issues' ? entry : { ...entry,
        ...(kind === 'purpose' ? { role: 'actions-write' as const } : {}), connection: { ...entry.connection, ...(kind === 'account' ? { viewerId: '2' } : kind === 'repository' ? { repositoryId: '8' } : {}) } }) };
    h.update({ view: kind === 'unavailable' ? { state: 'unavailable' } : connectionsView({ ...changed, revision: kind === 'revision' ? 5 : 4 }, true) });
    expect(roleReviewText()).toContain(h.copy.changed); expect(roleReviewText()).not.toContain('Issue triage ·'); expect(roleReviewText()).not.toContain('octo/example');
    button(h.copy.confirm).dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(h.actions.change).not.toHaveBeenCalled();
});
it('a late native result after disposal cannot close or mutate a newer local review', async () => {
    const h = fixture(true); const pending = deferred<number | null>(); h.actions.change.mockReturnValueOnce(pending.promise); button(h.copy.confirm).click(); await h.stop();
    pending.resolve(5); await Promise.resolve(); await Promise.resolve(); expect(h.close).not.toHaveBeenCalled(); expect(document.querySelector('[data-role-review]')).toBeNull();
});
it('unknown native state explains unavailability rather than asserting that optional selections are disabled', () => {
    const h = fixture(false, { view: { state: 'unavailable' } }); expect(document.querySelector('[data-optional-roles]')?.textContent).toContain(h.copy.unavailable);
    expect(document.querySelector('[data-optional-roles]')?.textContent).not.toContain(h.copy.states.disabled); expect(button(h.common.connect).matches(':disabled')).toBe(true);
});
it('a known schema1 read vault explicitly has both optional purposes disabled without fabricating a writer entry', () => {
    const h = fixture(); h.update({ view: connectionsView({ schemaVersion: 1, revision: 4, selected: null, entries: [] }, false) });
    expect(document.querySelector('[data-optional-roles]')?.textContent).toContain(h.copy.states.disabled); expect(document.querySelector('.cards li')).toBeNull();
});
it.each(['en', 'es', 'fr', 'pt'] as const)('the %s review has complete human labels, status, cancellation and permission guidance', locale => {
    const h = fixture(true, { locale }); expect(roleReviewText()).toContain(h.copy.title); expect(roleReviewText()).toContain(h.copy.grant);
    expect(roleReviewText()).toContain(h.copy.availability); expect(button(h.copy.confirm).disabled).toBe(false); button(h.copy.cancel).click(); expect(h.close).toHaveBeenCalledOnce();
});
it('review technical details disclose the exact verified numeric account, repository and captured revision without any credential', () => {
    fixture(true); const details = document.querySelector('[data-role-review] details')!; const labels = centerCopy('en').messages;
    expect(details.hasAttribute('open')).toBe(false); expect(details.querySelector('summary')?.textContent).toBe(labels.technical);
    expect([...details.querySelectorAll('dt')].map(node => node.textContent)).toEqual([labels.accountId, labels.repositoryId, labels.revision]);
    expect([...details.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['1', '7', '4']); expect(details.textContent).not.toContain(purposeEntry('issues-write').connection.secret);
});
it('a role label that resembles HTML remains escaped text throughout row and selection review rendering', () => {
    const name = '<img src=x onerror=alert(1)>'; const vault = purposeVault(); const view = connectionsView({ ...vault, entries: vault.entries.map(entry => entry.id === 'issues' ? { ...entry, name } : entry) }, true);
    const h = fixture(false, { view }); button(h.copy.review).click(); flushSync(); expect(roleReviewText()).toContain(name); expect(document.querySelector('img')).toBeNull();
});
it('Actions selection reviews its own row rather than the first optional identity in the list', () => {
    const h = fixture(); (document.getElementById('connection-select-actions') as HTMLButtonElement).click(); flushSync(); button(h.copy.confirm).click();
    expect(h.actions.change).toHaveBeenCalledExactlyOnceWith({ type: 'select', id: 'actions' }, 4);
});
it.each(['observer', 'busy'] as const)('a direct %s review rejects synthetic confirmation even with a current identity', kind => {
    const h = fixture(true, { editable: kind !== 'observer', busy: kind === 'busy' }); button(h.copy.confirm).dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(h.actions.change).not.toHaveBeenCalled();
});
it('synthetic close during pending verification cannot discard the review or its in-flight request', async () => {
    const h = fixture(true); const gate = deferred<number | null>(); h.actions.change.mockReturnValueOnce(gate.promise); button(h.copy.confirm).click(); flushSync();
    button(h.copy.close).dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(h.close).not.toHaveBeenCalled(); gate.resolve(5);
    await vi.waitFor(() => { flushSync(); expect(roleReviewText()).toContain(h.copy.saved); }); expect(h.actions.change).toHaveBeenCalledTimes(1);
});
it('closing an uncertain selection only closes the local view and never sends an inverse or replay operation', async () => {
    const h = fixture(true); h.actions.change.mockResolvedValueOnce(null); button(h.copy.confirm).click(); await vi.waitFor(() => { flushSync(); expect(roleReviewText()).toContain(h.copy.unknown); });
    button(h.copy.close).click(); expect(h.close).toHaveBeenCalledOnce(); expect(h.actions.change).toHaveBeenCalledTimes(1);
});
it('an uncertain result cannot issue a synthetic read while another native request owns the busy state', async () => {
    const h = fixture(true); h.actions.change.mockResolvedValueOnce(null); button(h.copy.confirm).click(); await vi.waitFor(() => { flushSync(); expect(roleReviewText()).toContain(h.copy.unknown); });
    h.update({ busy: true }); button(h.copy.refresh).dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(h.actions.refresh).not.toHaveBeenCalled();
});
it('each optional summary renders its own verified or stored identity state without certifying write grants', () => {
    const vault = purposeVault(); const h = fixture(false, { view: connectionsView({ ...vault, writeSelections: { 'issues-write': 'issues', 'actions-write': 'actions' } }, true, 2, ['actions-write']) });
    expect(document.querySelector('[data-role-purpose=actions-write]')?.textContent).toContain(h.copy.states['identity-verified']);
    expect(document.querySelector('[data-role-purpose=issues-write]')?.textContent).toContain(h.copy.states.stored); expect(document.querySelector('[data-optional-roles]')?.textContent).toContain(h.copy.grant);
});
it('changing only the purpose preserves the unsubmitted native password while replacing its visible guidance', () => {
    const h = fixture(); const field = document.getElementById('connection-secret') as HTMLInputElement; field.value = 'github_pat_synthetic_user_input'; roleChoice('actions-write');
    expect(field.value).toBe('github_pat_synthetic_user_input'); expect(document.body.textContent).toContain(h.copy.hints['actions-write']); expect(document.body.textContent).not.toContain(field.value); expect(h.actions.connect).not.toHaveBeenCalled();
});
it('five sessions explain shared capacity and leave removal available while blocking a synthetic sixth submission', () => {
    const vault = purposeVault(); const h = fixture(false, { view: connectionsView({ ...vault, entries: [...vault.entries, purposeEntry('repository-read', 'four'), purposeEntry('actions-write', 'five')] }, true) });
    expect(document.body.textContent).toContain(h.common.outcomes.capacity); expect(button(h.common.remove).disabled).toBe(false);
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); expect(h.actions.connect).not.toHaveBeenCalled();
});
it('duplicate local dismissal cannot clear a different review or send another native action', () => {
    const h = fixture(); button(h.copy.review).click(); flushSync(); const cancel = button(h.copy.cancel); cancel.click(); cancel.dispatchEvent(new MouseEvent('click', { bubbles: true })); flushSync();
    expect(h.actions.focusSession).toHaveBeenCalledOnce(); expect(h.actions.dirty.mock.calls.filter(([value]) => value === false)).toHaveLength(1); expect(h.actions.change).not.toHaveBeenCalled();
});
