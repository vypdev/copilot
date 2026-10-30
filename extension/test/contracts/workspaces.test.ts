import { expect, it } from 'vitest';
import { EMPTY_WORKSPACES, copyWorkspaceSelection, validWorkspaceSelection, workspaceName } from '../../src/domain/workspaces.ts';
import { planWorkspaceChange } from '../../src/domain/workspace_change.ts';
import { workspaceChoices, workspaceReferences } from '../../src/domain/workspace_references.ts';
import { connectionsView } from '../../src/domain/named_sessions.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
const group = { id: 'release', name: 'Release work', members: ['saved-reference'] };
const selection = { workspaces: [group], selectedWorkspace: null };
it('bounds authored records at ten groups with twenty opaque references, including unavailable references', () => {
    const value = { workspaces: Array.from({ length: 10 }, (_, i) => ({ id: `group-${i}`, name: `Group ${i}`, members: Array.from({ length: 20 }, (_, n) => `reference-${n}`) })), selectedWorkspace: 'group-9' };
    expect(validWorkspaceSelection(value)).toBe(true); expect(validWorkspaceSelection({ ...value, workspaces: [...value.workspaces, group] })).toBe(false);
    expect(validWorkspaceSelection({ workspaces: [{ ...group, members: Array.from({ length: 21 }, (_, i) => `reference-${i}`) }], selectedWorkspace: null })).toBe(false);
});
it.each([null, {}, { ...selection, selectedWorkspace: 'missing' }, { ...selection, selectedWorkspace: 1 }, { ...selection, token: 'synthetic' },
    { ...selection, workspaces: Array(1) }, { ...selection, workspaces: [group, group] },
    { ...selection, workspaces: [group, { ...group, id: 'other', name: 'release WORK' }] }])('rejects invalid grouping atomically: %j', value => {
    expect(validWorkspaceSelection(value)).toBe(false); expect(copyWorkspaceSelection(value)).toBeNull();
});
it('rejects unbounded/private/executable/sparse reference records without freezing or retaining caller objects', () => {
    for (const patch of [{ id: 'Bad' }, { name: ' leading' }, { name: 'x\u202e' }, { members: ['https://github.com/a/b'] },
        { members: ['previous-session', 'previous-session'] }, { members: [null] }, { members: Array(1) }, { repository: 'private/repository' }]) {
        expect(validWorkspaceSelection({ ...selection, workspaces: [{ ...group, ...patch }] })).toBe(false);
    }
    const source = structuredClone(selection); const copy = copyWorkspaceSelection(source)!; source.workspaces[0].members[0] = 'replacement'; expect(copy.workspaces[0].members).toEqual(['saved-reference']);
    expect(Object.isFrozen(copy.workspaces[0].members)).toBe(true); expect(Object.isFrozen(group)).toBe(false);
    const cycle: Record<string, unknown> = {}; cycle.workspaces = [cycle]; cycle.selectedWorkspace = null; expect(validWorkspaceSelection(cycle)).toBe(false);
    for (const name of ['', 'x'.repeat(61), 'line\n', 'space ']) expect(workspaceName(name)).toBe(false);
});
it('creates, selects, edits, clears and removes authored groups with deterministic replay and no reference resolution', () => {
    const created = planWorkspaceChange(EMPTY_WORKSPACES, { type: 'save', workspace: group }); if (created.state !== 'ready') throw new Error('create');
    expect(planWorkspaceChange(created.next, { type: 'save', workspace: { members: group.members, name: group.name, id: group.id } })).toEqual({ state: 'unchanged' });
    const selected = planWorkspaceChange(created.next, { type: 'select', id: group.id }); if (selected.state !== 'ready') throw new Error('select');
    expect(planWorkspaceChange(selected.next, { type: 'select', id: group.id })).toEqual({ state: 'unchanged' });
    expect(planWorkspaceChange(selected.next, { type: 'remove', id: group.id })).toMatchObject({ state: 'ready', next: EMPTY_WORKSPACES });
    expect(planWorkspaceChange(selected.next, { type: 'clear-selection' })).toMatchObject({ state: 'ready', next: selection });
    expect(planWorkspaceChange(selected.next, { type: 'reset' })).toMatchObject({ state: 'ready', next: EMPTY_WORKSPACES });
    expect(planWorkspaceChange(EMPTY_WORKSPACES, { type: 'reset' })).toEqual({ state: 'unchanged' });
});
it('capacity, missing IDs, duplicate names, invalid intent keys and invalid source cannot become a partial plan', () => {
    const full = { workspaces: Array.from({ length: 10 }, (_, i) => ({ ...group, id: `g-${i}`, name: `Group ${i}` })), selectedWorkspace: null };
    expect(planWorkspaceChange(full, { type: 'save', workspace: group })).toEqual({ state: 'invalid', reason: 'capacity' });
    expect(planWorkspaceChange(full, { type: 'save', workspace: { ...full.workspaces[0], name: 'Changed' } }).state).toBe('ready');
    expect(planWorkspaceChange(selection, { type: 'save', workspace: { ...group, id: 'other' } })).toEqual({ state: 'invalid', reason: 'conflict' });
    for (const intent of [null, {}, { type: 'save' }, { type: 'save', workspace: { ...group, id: 'Bad' } }, { type: 'select', id: 'Bad' },
        { type: 'select', id: group.id, grant: true }, { type: 'reset', id: group.id }, { type: 'remove' }, { type: 'unknown' }]) {
        expect(planWorkspaceChange(selection, intent).state).toBe('invalid');
    }
    expect(planWorkspaceChange({}, { type: 'reset' }).state).toBe('invalid');
    expect(planWorkspaceChange(selection, { type: 'select', id: 'missing' })).toEqual({ state: 'invalid', reason: 'not-found' });
});
it('resolves only current saved local references, never a renamed label, physical ID or another invented target', () => {
    const view = connectionsView({ schemaVersion: 1, revision: 1, selected: 'saved-reference', entries: [
        { id: 'saved-reference', name: 'Work', host: 'github.com', role: 'repository-read', connection: { ...CONNECTED, schemaVersion: 1 } },
    ] }, true);
    expect(workspaceReferences(group, view)).toMatchObject([{ state: 'saved', connected: true, entry: { repository: 'octo/example' } }]);
    expect(workspaceReferences(group, { ...view, selected: null, connected: false })[0].connected).toBe(false);
    expect(workspaceReferences(group, { ...view, entries: [] })).toMatchObject([{ state: 'missing', entry: null, connected: false }]);
    for (const source of [undefined, null, { state: 'unavailable' } as const]) expect(workspaceReferences(group, source)[0].state).toBe('unavailable');
    expect(JSON.stringify(workspaceReferences(group, null))).not.toContain('octo/example'); expect(JSON.stringify(selection)).not.toContain(CONNECTED.secret);
    expect(workspaceChoices({ ...group, members: ['old-reference'] }, view).map(row => row.id)).toEqual(['old-reference', 'saved-reference']);
    expect(workspaceChoices(group, null).map(row => row.id)).toEqual(group.members);
});
it('removing an unselected group preserves the other selected authored group', () => {
    const other = { ...group, id: 'other', name: 'Other' };
    expect(planWorkspaceChange({ workspaces: [group, other], selectedWorkspace: group.id }, { type: 'remove', id: other.id })).toMatchObject({ state: 'ready', next: { workspaces: [group], selectedWorkspace: group.id } });
});
it('a changed JSON snapshot cannot publish a malformed workspace or freeze the original caller', () => {
    let serializations = 0; const value = { ...selection };
    Object.defineProperty(value, 'toJSON', { value: () => ++serializations === 1 ? selection : { workspaces: [{ id: 'Bad' }], selectedWorkspace: null } });
    expect(copyWorkspaceSelection(value)).toBeNull(); expect(Object.isFrozen(value)).toBe(false);
});
