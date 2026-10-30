import { expect, it } from 'vitest';
import { settingsCompletion, settingsObservation } from '../../src/domain/settings_observation.ts';
import { journalFact } from '../../src/domain/journal_facts.ts';
import { settingsOperationTarget } from '../../src/domain/settings_operation_target.ts';
import { planSettingsChange } from '../../src/domain/settings_change.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { decodeCurrentOperation, currentTarget } from '../../src/domain/current_operation.ts';
import { CURRENT_TARGET } from '../fixtures/current_operations.ts';
import type { SettingsCommit } from '../../src/domain/settings_result.ts';

it.each(['reviewed', 'cancelled', 'blocked', 'submitted'] as const)('retains only closed %s facts and cannot carry private target detail', phase => {
    const fact = settingsObservation('profile-edit', phase); expect(journalFact('diagnostics', fact)).toBe(true); expect(Object.isFrozen(fact)).toBe(true);
    expect(journalFact('diagnostics', { ...fact, target: CURRENT_TARGET })).toBe(false);
});
it.each(['accepted', 'unknown'] as const)('canonical completion preserves its %s acknowledgement independently from result', acknowledgement => {
    expect(settingsCompletion('appearance', true, { state: 'committed', revision: 1, acknowledgement, current: false })).toEqual({ stage: 'settled', fact: {
        kind: 'operation', action: 'appearance', phase: 'settled', acknowledgement, observation: 'committed' } });
});
it('a canonical replay proves completion without inventing its original acknowledgement', () => {
    expect(settingsCompletion('appearance', false, { state: 'replayed', revision: 1 }).fact).toMatchObject({ acknowledgement: 'unknown', observation: 'committed' });
});
it.each(['conflict', 'invalid', 'stale', 'unavailable'] as const)('a known %s preflight rejection is blocked, while contradictory post-attempt evidence remains uncertain', state => {
    expect(settingsCompletion('appearance', false, { state })).toEqual({ stage: 'blocked', fact: settingsObservation('appearance', 'blocked') });
    expect(settingsCompletion('appearance', true, { state })).toEqual({ stage: 'unknown', fact: null });
});
it.each(['unchanged', 'changed', 'unavailable'] as const)('uncertain %s readback remains separate from an accepted submission', observation => {
    const outcome: SettingsCommit = { state: 'unknown', acknowledgement: 'accepted', observation, observedRevision: null };
    expect(settingsCompletion('appearance', true, outcome).fact).toMatchObject({ phase: 'settled', acknowledgement: 'accepted', observation });
});
it('an unexpected service failure without submission evidence cannot manufacture a persisted submitted transition', () => {
    const result: SettingsCommit = { state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null };
    expect(settingsCompletion('appearance', false, result)).toEqual({ stage: 'unknown', fact: null }); expect(settingsCompletion('appearance', true, result).fact).toMatchObject({ observation: 'unavailable' });
});
it('captures the admitted profile target from this exact intent and excludes unrelated fields and removed-profile loss', () => {
    const before = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'private-profile', name: 'Private profile', scope: { kind: 'global' as const }, preferences: {} }] } };
    for (const change of [{ type: 'save', profile: { ...before.center.profiles[0], name: 'Renamed private profile' } }, { type: 'select', id: 'private-profile' }, { type: 'remove', id: 'private-profile' }]) {
        const input = { type: 'profile', change }; const plan = planSettingsChange(before, input); if (plan.state !== 'ready') throw new Error('expected-plan');
        const target = settingsOperationTarget(plan.action, input, before, plan.settings); expect(target.location).toEqual(CURRENT_TARGET.location);
        expect(target.label).toBe(change.type === 'save' ? 'Renamed private profile' : 'Private profile'); expect(currentTarget(target)).toBe(true);
    }
});
it('keeps repository identity ephemeral and returns truthful route scope for broad or unavailable target detail', () => {
    expect(settingsOperationTarget('repository-preferences', { repositoryId: '123' }, DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual({ location: { route: 'repositories' }, label: '123' });
    for (const input of [null, {}, { change: { id: 'unknown' } }]) expect(settingsOperationTarget('profile-edit', input, DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual({ location: { route: 'profiles' }, label: null });
    expect(settingsOperationTarget('import', { settings: 'private' }, DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual({ location: { route: 'data' }, label: null });
});
it('the detached current-operation decoder preserves a private label only for a current source and rejects cross-family/authority injection', () => {
    const operation = { family: 'settings', stage: 'confirming', fact: settingsObservation('profile-edit', 'reviewed'), target: CURRENT_TARGET, sourceCurrent: true, firstObserved: 1, retention: 'untracked' };
    const reply = decodeCurrentOperation({ state: 'current', operation }); expect(reply).toEqual({ state: 'current', operation }); expect(Object.isFrozen(reply)).toBe(true);
    expect(decodeCurrentOperation({ state: 'empty' })).toEqual({ state: 'empty' });
    for (const patch of [{ family: 'session' }, { sourceCurrent: false }, { stage: 'settled' }, { owner: 'private' }, { firstObserved: -1 }, { retention: 'secret' },
        { fact: { ...operation.fact, action: 'connect-read' } }, { target: { ...CURRENT_TARGET, label: 'x'.repeat(81) } }, { target: { ...CURRENT_TARGET, label: '\u0000' } }]) {
        expect(decodeCurrentOperation({ state: 'current', operation: { ...operation, ...patch } })).toBeNull();
    }
    expect(decodeCurrentOperation({ state: 'current', operation: { ...operation, sourceCurrent: false, target: null } })).not.toBeNull();
    expect(decodeCurrentOperation({ state: 'current', operation: { ...operation, stage: 'unknown' } })).not.toBeNull();
});
