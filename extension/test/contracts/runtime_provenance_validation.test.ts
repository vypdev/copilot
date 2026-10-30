import { expect, it } from 'vitest';
import { decodeRuntimeConfiguration, runtimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import { validNativePauseProvenance } from '../../src/domain/runtime_provenance_validation.ts';
import { nativePauseProvenance } from '../../src/domain/temporary_pause_observation.ts';
import { DEFAULT_TEMPORARY_PAUSES } from '../../src/domain/temporary_pauses.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { provenanceConfiguration } from '../fixtures/runtime_provenance.ts';
import { CONFIG, clearNativeRestriction } from '../fixtures/page_configuration.ts';

const wire = () => ({ ...provenanceConfiguration(), sourceTree: 'unbundled' });
const decode = (value: unknown) => decodeRuntimeConfiguration(value, CONFIG, 'unbundled');
it.each(['clear', 'pending', 'precaution', 'pending-precaution', 'unavailable'] as const)('the closed %s worker fact round-trips independently from native or saved pause claims', condition => {
    const value = { ...provenanceConfiguration(condition), sourceTree: 'unbundled' }; expect(decode(value)).toMatchObject({ provenance: { restriction: { native: { worker: condition } } } });
    expect(Object.isFrozen(decode(value)?.provenance)).toBe(true); expect(Object.isFrozen(value)).toBe(false);
});
it.each([{ emergency: false, tab: false }, { emergency: false, tab: true }, { emergency: true, tab: false }, { emergency: true, tab: true }])('both native pause booleans remain explicit for %j without losing the higher priority', ({ emergency, tab }) => {
    const value = { ...provenanceConfiguration('clear', emergency, tab), sourceTree: 'unbundled' };
    expect(decode(value)).toMatchObject({ settings: { paused: emergency || tab }, provenance: { restriction: { native: { emergency, tab } } } });
});
it.each(['future', 'corrupt', 'unavailable'] as const)('%s native storage remains unknown with no invented emergency or tab pause', state => {
    const native = nativePauseProvenance({ condition: 'clear', loaded: { state } }, 1);
    const configuration = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0, { native, claimedRepository: false, retainedScope: false });
    expect(decode({ ...configuration, sourceTree: 'unbundled' })).toMatchObject({ settings: { paused: true }, provenance: { restriction: { native: { native: state, emergency: null, tab: null } } } });
});
it('missing native infrastructure is a restriction explanation, never an implicit connected or unpaused default', () => {
    const configuration = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0)!; expect(configuration.settings.paused).toBe(true);
    expect(configuration.provenance.restriction.native).toMatchObject({ worker: 'unavailable', native: 'not-checked' }); expect(configuration.connected).toBe(false);
});
it('factory copies its source restriction and binding records rather than freezing a caller-owned native object', () => {
    const restriction = { native: { ...clearNativeRestriction().native }, claimedRepository: false, retainedScope: false };
    const bindings = [{ command: 'open-center', binding: 'Alt+Shift+K', privateExtra: 'never-copy-this' }] as const;
    const settings = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, bindings } };
    const value = runtimeConfiguration(settings, CONFIG, null, 0, restriction)!; expect(value).not.toBeNull();
    expect(Object.isFrozen(restriction)).toBe(false); expect(Object.isFrozen(restriction.native)).toBe(false); expect(Object.isFrozen(bindings[0])).toBe(false);
    expect(value.settings.bindings).toEqual([{ command: 'open-center', binding: 'Alt+Shift+K' }]); expect(JSON.stringify(value)).not.toContain('never-copy-this');
});
it.each([null, [], {}, { extra: 'private' }, { preferences: null }, { restriction: null }].map(patch => ({ patch })))('incomplete or private provenance $patch cannot become a usable configuration', ({ patch }) => {
    const value = wire(); expect(decode({ ...value, provenance: patch && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).length ? { ...value.provenance, ...patch } : patch })).toBeNull();
});
it.each([{ worker: 'foreign' }, { native: 'foreign' }, { emergency: 1 }, { tab: 'false' }, { restricted: 'true' }, { witness: {} },
    { worker: 'pending' }, { worker: 'pending', native: 'not-checked', emergency: null, tab: null, restricted: false },
    { native: 'future', emergency: true, tab: null, restricted: true }, { native: 'corrupt', emergency: null, tab: true, restricted: true },
    { native: 'unavailable', tab: true, restricted: true }, { native: 'none', emergency: true }, { native: 'tab', emergency: false, tab: false, restricted: true },
    { native: 'emergency', emergency: true, tab: false, restricted: false }, { native: 'not-checked' }])('a contradictory or private native fact %j is rejected independently of acknowledgement or configuration', patch => {
    const value = wire(); const native = { ...value.provenance.restriction.native, ...patch }; expect(validNativePauseProvenance(native)).toBe(false);
    expect(decode({ ...value, provenance: { ...value.provenance, restriction: { ...value.provenance.restriction, native } } })).toBeNull();
});
it.each([null, { account: true }, { account: false, repository: true, organization: false, session: false }, { account: true, repository: false, organization: true, session: false },
    { account: true, repository: false, organization: false, session: true }, { account: true, repository: true, organization: false, session: 1 },
    { account: true, repository: true, organization: false, session: false, accountId: 'private' }])('invalid or private applicability %j cannot authorize a scope label', scope => {
    const value = wire(); expect(decode({ ...value, provenance: { ...value.provenance, preferences: { ...value.provenance.preferences, scope } } })).toBeNull();
});
it.each([{ density: 'profile:private' }, { shortcuts: 'write-session' }, { profileId: 'private' }, { features: null }, { features: {} },
    { pauses: 'global' }, { pauses: ['default'] }, { pauses: ['global', 'global'] }, { pauses: ['repository', 'global'] }, { pauses: Array(9).fill('global') }])('unknown, partial or unordered preference provenance %j is never repaired into a usable default', patch => {
    const value = wire(); expect(decode({ ...value, provenance: { ...value.provenance, preferences: { ...value.provenance.preferences, ...patch } } })).toBeNull();
});
it.each(['profile-account', 'profile-organization', 'profile-repository', 'repository', 'session'] as const)('a %s code with unavailable verified scope is rejected for each preference surface', source => {
    const value = wire(); const preferences = { ...value.provenance.preferences, scope: { account: false, repository: false, organization: false, session: false } };
    for (const patch of [{ density: source }, { shortcuts: source }, { features: { ...preferences.features, 'BEX-NAV-01': source } }, { pauses: [source] }]) {
        expect(decode({ ...value, provenance: { ...value.provenance, preferences: { ...preferences, ...patch } } })).toBeNull();
    }
});
it('missing/replaced feature source keys and nonboolean source restrictions cannot survive detached validation', () => {
    const value = wire(); const features = { ...value.provenance.preferences.features }; delete features['BEX-NAV-01'];
    for (const replacement of [features, { ...features, unknown: 'default' }, { ...value.provenance.preferences.features, 'BEX-NAV-01': 'private' }]) {
        expect(decode({ ...value, provenance: { ...value.provenance, preferences: { ...value.provenance.preferences, features: replacement } } })).toBeNull();
    }
    for (const patch of [{ claimedRepository: 'yes' }, { retainedScope: 1 }, { approval: true }]) expect(decode({ ...value, provenance: { ...value.provenance, restriction: { ...value.provenance.restriction, ...patch } } })).toBeNull();
});
it('a saved, native, claimed or retained veto must agree with paused/connected state and cannot be mislabeled as emergency', () => {
    const value = wire();
    for (const restriction of [{ ...value.provenance.restriction, claimedRepository: true }, { ...value.provenance.restriction, retainedScope: true }]) {
        expect(decode({ ...value, provenance: { ...value.provenance, restriction } })).toBeNull();
        expect(decode({ ...value, connected: false, settings: { ...value.settings, paused: true }, provenance: { ...value.provenance, restriction } })?.provenance.restriction.native.emergency).toBe(false);
    }
    const global = { ...provenanceConfiguration('clear', false, false, true), sourceTree: 'unbundled' };
    expect(decode(global)).not.toBeNull(); expect(decode({ ...global, settings: { ...global.settings, paused: false } })).toBeNull();
    expect(decode({ ...value, connected: true, provenance: { ...value.provenance, preferences: { ...value.provenance.preferences, scope: { account: false, repository: false, organization: false, session: false } } } })).toBeNull();
});
it('unknown native tab scope keeps the independently observed emergency fact and cannot certify absence of a tab pause', () => {
    const native = nativePauseProvenance({ condition: 'clear', loaded: { state: 'ready', value: { ...DEFAULT_TEMPORARY_PAUSES, emergency: true } } }, undefined);
    expect(validNativePauseProvenance(native)).toBe(true); expect(native).toMatchObject({ native: 'unavailable', emergency: true, tab: null, restricted: true });
});
it('detached validation rejects mutable toJSON substitution rather than validating one object and returning another', () => {
    const value = wire(); let calls = 0; const input = { toJSON: () => ++calls === 1 ? value : { ...value, provenance: { token: 'private' } } };
    expect(decode(input)).toBeNull(); expect(Object.isFrozen(input)).toBe(false); expect(decode({ ...value, provenance: undefined })).toBeNull();
});
