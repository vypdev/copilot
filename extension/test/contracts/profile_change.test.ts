import { expect, it } from 'vitest';
import { EMPTY_PROFILES, type CenterProfile, type ProfileSelection } from '../../src/domain/center_profiles.ts';
import { planProfileChange, profileChanges } from '../../src/domain/profile_change.ts';

const one: CenterProfile = { id: 'one', name: 'One', scope: { kind: 'global' }, preferences: {} };
const two: CenterProfile = { id: 'two', name: 'Two', scope: { kind: 'global' }, preferences: { density: 'compact' } };
const repository: CenterProfile = { id: 'repo', name: 'Repository', scope: {
    kind: 'repository', host: 'github.com', accountId: '7', repositoryId: '42' }, preferences: { shortcuts: true } };
const current: ProfileSelection = { profiles: [one, two, repository], selected: ['one', 'repo'] };

it('plans profile creation with its complete scope/preferences delta and leaves input mutable and unchanged', () => {
    const before = JSON.stringify(EMPTY_PROFILES);
    const result = planProfileChange(EMPTY_PROFILES, { type: 'save', profile: two });
    expect(result).toEqual({ state: 'ready', action: 'create', next: { profiles: [two], selected: [] }, changes: [
        { profileId: 'two', field: 'name', before: null, after: 'Two' },
        { profileId: 'two', field: 'scope', before: null, after: 'global' },
        { profileId: 'two', field: 'density', before: null, after: 'compact' } ] });
    expect(JSON.stringify(EMPTY_PROFILES)).toBe(before); expect(Object.isFrozen(two)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
});
it('previews edited, removed and false-valued feature overrides without dropping inherited-value transitions', () => {
    const before = { profiles: [{ ...one, preferences: { paused: true, shortcuts: true, features: { 'BEX-NAV-01': true } } }], selected: ['one'] };
    const edited: CenterProfile = { ...one, name: 'Edited', preferences: { paused: false, shortcuts: false, features: { 'BEX-NAV-02': false } } };
    const result = planProfileChange(before, { type: 'save', profile: edited });
    expect(result).toMatchObject({ state: 'ready', action: 'edit', next: { profiles: [edited] } });
    if (result.state !== 'ready') throw new Error('expected a valid preview');
    expect(result.changes).toEqual([
        { profileId: 'one', field: 'name', before: 'One', after: 'Edited' },
        { profileId: 'one', field: 'shortcuts', before: true, after: false },
        { profileId: 'one', field: 'paused', before: true, after: false },
        { profileId: 'one', field: 'feature:BEX-NAV-01', before: true, after: null },
        { profileId: 'one', field: 'feature:BEX-NAV-02', before: null, after: false } ]);
    expect(Object.isFrozen(result.changes[0])).toBe(true);
});
it('selection previews replacement only in the exact scope and preserves another account/repository selection', () => {
    const result = planProfileChange(current, { type: 'select', id: 'two' });
    expect(result).toMatchObject({ state: 'ready', action: 'select', next: { profiles: current.profiles, selected: ['repo', 'two'] } });
    if (result.state !== 'ready') throw new Error('expected a valid preview');
    expect(result.changes).toEqual([
        { profileId: 'one', field: 'selected', before: true, after: false },
        { profileId: 'two', field: 'selected', before: false, after: true } ]);
    expect(current.selected).toEqual(['one', 'repo']);
});
it('deselect and remove have distinct complete previews and cannot remove unrelated profiles', () => {
    expect(planProfileChange(current, { type: 'deselect', id: 'one' })).toMatchObject({ state: 'ready', action: 'deselect',
        next: { profiles: current.profiles, selected: ['repo'] } });
    const result = planProfileChange(current, { type: 'remove', id: 'repo' });
    expect(result).toMatchObject({ state: 'ready', action: 'remove', next: { profiles: [one, two], selected: ['one'] } });
    if (result.state !== 'ready') throw new Error('expected a valid preview');
    expect(result.changes).toContainEqual({ profileId: 'repo', field: 'scope', before: 'github.com/7/repo/42', after: null });
    expect(result.changes).toContainEqual({ profileId: 'repo', field: 'shortcuts', before: true, after: null });
    expect(result.changes).toContainEqual({ profileId: 'repo', field: 'selected', before: true, after: false });
});
it('recognizes repeated semantic choices as unchanged instead of creating another mutation', () => {
    for (const intent of [{ type: 'save', profile: one }, { type: 'select', id: 'one' }, { type: 'deselect', id: 'two' }]) {
        expect(planProfileChange(current, intent)).toEqual({ state: 'unchanged' });
    }
    expect(profileChanges(current, current)).toEqual([]);
});
it('invalid current state or extra-key/authority-bearing intents produce no partial plan', () => {
    expect(planProfileChange({ profiles: [], selected: ['missing'] }, { type: 'save', profile: one })).toEqual({ state: 'invalid', reason: 'invalid-input' });
    for (const intent of [null, [], {}, { type: false }, { type: 'approve', id: 'one' }, { type: 'select' },
        { type: 'select', id: '../one' }, { type: 'select', id: 'one', permission: 'api' },
        { type: 'save', profile: one, expectedApproval: true }, { type: 'save' },
        { type: 'save', profile: { ...one, preferences: { connected: true } } }]) {
        expect(planProfileChange(current, intent)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    }
});
it('missing profiles and capacity overflow return bounded distinct recovery reasons', () => {
    for (const type of ['select', 'deselect', 'remove']) expect(planProfileChange(current, { type, id: 'missing' }))
        .toEqual({ state: 'invalid', reason: 'not-found' });
    const profiles = Array.from({ length: 10 }, (_, index) => ({ ...one, id: `profile-${index}` }));
    expect(planProfileChange({ profiles, selected: [] }, { type: 'save', profile: two })).toEqual({ state: 'invalid', reason: 'capacity' });
    expect(planProfileChange({ profiles, selected: [] }, { type: 'save', profile: { ...profiles[0], name: 'Edited' } })).toMatchObject({ state: 'ready' });
});
it('moving a selected profile into an already selected scope requires a new nonconflicting preview', () => {
    const selected = { ...current, selected: ['one', 'repo'] };
    const result = planProfileChange(selected, { type: 'save', profile: { ...repository, scope: { kind: 'global' } } });
    expect(result).toEqual({ state: 'invalid', reason: 'conflicting-scopes' });
    expect(selected.selected).toEqual(['one', 'repo']);
    expect(planProfileChange({ ...current, selected: ['one'] }, { type: 'save', profile: { ...repository, scope: { kind: 'global' } } }))
        .toMatchObject({ state: 'ready', action: 'edit' });
});
it('bulk-like previews enumerate every authored feature change in stable order without truncation', () => {
    const preferences = { features: { 'BEX-NAV-03': true, 'BEX-NAV-01': false, 'BEX-NAV-02': true } };
    const result = planProfileChange(current, { type: 'save', profile: { ...one, preferences } });
    expect(result).toMatchObject({ state: 'ready' });
    if (result.state !== 'ready') throw new Error('expected a valid preview');
    expect(result.changes.map(change => change.field)).toEqual(['feature:BEX-NAV-01', 'feature:BEX-NAV-02', 'feature:BEX-NAV-03']);
});
