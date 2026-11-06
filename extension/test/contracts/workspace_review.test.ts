import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { workspaceReviewChanges } from '../../src/domain/workspace_review.ts';
import { settingsReviewChanges } from '../../src/domain/center_frame.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { workspaceCopy } from '../../src/domain/workspace_copy.ts';
import { parseCenterLocation, centerLocationHash } from '../../src/domain/center_routes.ts';
const group = { id: 'release', name: 'Release work', members: ['old-reference', 'saved-reference'] };
const before = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, workspaces: [group] } };
it('complete workspace deltas cover names, reference order/removal, group position and selection', () => {
    const after = { ...before, center: { ...before.center, workspaces: [{ ...group, name: 'Changed', members: ['saved-reference'] }], selectedWorkspace: group.id } };
    const changes = workspaceReviewChanges(before, after, 'en')!;
    expect(changes.map(row => row.id)).toEqual(['workspace/release/name', 'workspace/release/member/old-reference', 'workspace/release/member/saved-reference', 'workspace/selected']);
    expect(changes.find(row => row.id.endsWith('old-reference'))).toMatchObject({ before: 'Position 1', after: 'Not included' });
    expect(changes.every(row => !row.label.includes('center/workspaces/0'))).toBe(true);
    expect(settingsReviewChanges(before, after, centerCopy('en'))).toEqual(changes);
});
it('a selection-only edit is visible even when the exact workspace array reference is retained', () => {
    const after = { ...before, center: { ...before.center, selectedWorkspace: group.id } };
    expect(settingsReviewChanges(before, after, centerCopy('en'))).toMatchObject([{ id: 'workspace/selected', before: 'No group selected', after: `${group.name} · ${group.id}` }]);
    expect(workspaceReviewChanges(before, before, 'en')).toEqual([]);
});
it('invalid/unreadable selections never become fabricated semantic preview state', () => {
    for (const value of [null, {}, { ...before, center: { ...before.center, selectedWorkspace: 'missing' } }]) {
        expect(workspaceReviewChanges(value, before, 'en')).toBeNull(); expect(workspaceReviewChanges(before, value, 'en')).toBeNull();
    }
});
it('only the fixed local workspace subroute is admitted, never another repository or return URL operand', () => {
    expect(parseCenterLocation('#/repositories/workspaces')).toEqual({ route: 'repositories', detail: 'workspaces' });
    expect(centerLocationHash({ route: 'repositories', detail: 'workspaces' })).toBe('#/repositories/workspaces');
    for (const path of ['#/repositories/other', '#/repositories/workspaces?token=x', '#/repositories/%77orkspaces']) expect(parseCenterLocation(path)).toBeNull();
});
it.each(['en', 'es', 'fr', 'pt'] as const)('keeps a complete coherent %s workspace vocabulary and localized preview labels', locale => {
    const copy = workspaceCopy(locale); expect(Object.keys(copy)).toEqual(Object.keys(workspaceCopy('en'))); expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.values(copy).every(text => text.length > 0)).toBe(true);
    expect(workspaceReviewChanges(DEFAULT_SETTINGS, before, locale)!.every(row => row.label.startsWith(copy.title))).toBe(true);
    expect(workspaceCopy('unknown')).toEqual(workspaceCopy('en'));
});
it('same-name group replacement still identifies the changed selection and local IDs explicitly', () => {
    const left = { ...before, center: { ...before.center, selectedWorkspace: group.id } };
    const right = { ...before, center: { ...before.center, workspaces: [{ ...group, id: 'replacement' }], selectedWorkspace: 'replacement' } };
    const rows = workspaceReviewChanges(left, right, 'en')!;
    expect(rows.filter(row => row.id.endsWith('/identifier'))).toHaveLength(2);
    expect(rows.find(row => row.id === 'workspace/selected')).toMatchObject({ before: `${group.name} · release`, after: `${group.name} · replacement` });
});
