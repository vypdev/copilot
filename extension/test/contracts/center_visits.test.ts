import { expect, it } from 'vitest';
import { centerDestination, decodeRecentsPermit, observedVisit, recentsPermitId, validCenterDestination } from '../../src/domain/center_visits.ts';
import { isHistoryMessage } from '../../src/domain/history_protocol.ts';
import { settingsOperationId } from '../../src/domain/settings_operation.ts';

const permit = `visit-${'a'.repeat(32)}`;
const header = { version: 1, clientId: 'b'.repeat(32), controllerEpoch: 1, credentialEpoch: 0 };
it('generalizes a private profile detail before IPC while preserving only known feature destinations', () => {
    expect(centerDestination({ route: 'profiles', detail: 'private-team' })).toEqual({ route: 'profiles' });
    expect(centerDestination({ route: 'features', detail: 'BEX-NAV-01' })).toEqual({ route: 'features', featureId: 'BEX-NAV-01' });
    expect(centerDestination({ route: 'features' })).toEqual({ route: 'features' }); expect(Object.isFrozen(centerDestination({ route: 'privacy' }))).toBe(true);
    expect(centerDestination({ route: 'profiles', detail: 'invalid/slash' })).toBeNull(); expect(centerDestination({ route: 'features', detail: 'unknown' })).toBeNull();
});
it.each([null, [], { route: 'https://github.com/private' }, { route: 'profiles', detail: 'private-team' }, { route: 'features', featureId: 'unknown' },
    { route: 'privacy', featureId: 'BEX-NAV-01' }, { route: 'privacy', kind: 'destination' }, { route: 'privacy', timestamp: 1 }])('rejects a nonclosed native destination %j', value => {
    expect(validCenterDestination(value)).toBe(false);
});
it('keeps capture IDs purpose-separated from mutation/review IDs and closes both response schemas', () => {
    expect(recentsPermitId(permit)).toBe(true); expect(settingsOperationId(permit)).toBe(false); expect(recentsPermitId('a'.repeat(32))).toBe(false);
    expect(decodeRecentsPermit({ state: 'ready', permit, sequence: 0, epoch: 0 })).toEqual({ state: 'ready', permit, sequence: 0, epoch: 0 });
    for (const epoch of [null, 0]) expect(decodeRecentsPermit({ state: 'ready', permit: null, sequence: 0, epoch })).not.toBeNull();
    for (const value of [{ state: 'ready', permit, sequence: 0, epoch: null }, { state: 'ready', permit, sequence: 0, epoch: -1 }, { state: 'ready', permit: 'plain', sequence: 0, epoch: 1 },
        { state: 'ready', permit: null, sequence: 1, epoch: 0 }, { state: 'ready', permit, sequence: -1, epoch: 0 },
        { state: 'ready', permit, sequence: 0, epoch: 1, policyNonce: 'excluded' }, { state: 'unavailable' }]) expect(decodeRecentsPermit(value)).toBeNull();
    expect(observedVisit({ state: 'observed' })).toBe(true); expect(observedVisit({ state: 'observed', written: true })).toBe(false); expect(observedVisit(null)).toBe(false);
});
it.each([
    { method: 'center.recents.capture', destination: { route: 'privacy' } },
    { method: 'center.recents.observe', sequence: 1, permit: 'a'.repeat(32), destination: { route: 'privacy' } },
    { method: 'center.recents.observe', sequence: 1, permit, destination: { route: 'profiles', profileId: 'private' } },
    { method: 'center.recents.observe', sequence: 1, permit, destination: { route: 'privacy' }, at: 1 },
])('rejects capture/observation authority or event injection $method', value => { expect(isHistoryMessage({ ...header, ...value })).toBe(false); });
