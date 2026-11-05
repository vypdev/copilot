import { expect, it } from 'vitest';
import { validSessionPreferenceProvenance as valid } from '../../src/domain/session_preference_provenance.ts';
import { runtimeConfiguration, decodeRuntimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import { runtimeProvenanceView } from '../../src/presentation/runtime_provenance_view.ts';
import { sessionPreferenceProvenanceCopy } from '../../src/presentation/session_preference_provenance_copy.ts';
import { runtimeProvenanceCopy } from '../../src/presentation/runtime_provenance_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { CONFIG, clearNativeRestriction } from '../fixtures/page_configuration.ts';
import { CONNECTED } from '../fixtures/runtime.ts';

it.each(['pending', 'precaution', 'pending-precaution', 'unavailable'] as const)('the independent %s preference owner requires unchecked native scope and a veto', worker => {
    const value = { worker, native: 'not-checked', scope: null, restricted: true }; expect(valid(value)).toBe(true);
    for (const patch of [{ restricted: false }, { native: 'ready' }, { scope: 'active' }, { witness: {} }]) expect(valid({ ...value, ...patch })).toBe(false);
});
it.each(['future', 'corrupt', 'unavailable'] as const)('a %s native document cannot imply a usable scope or an unpaused observation', document => {
    const value = { worker: 'clear', native: document, scope: null, restricted: true }; expect(valid(value)).toBe(true);
    expect(valid({ ...value, restricted: false })).toBe(false); expect(valid({ ...value, scope: 'empty' })).toBe(false);
});
it.each(['empty', 'inactive', 'unknown', 'retained'] as const)('the %s scope has a fixed conservative restriction meaning', scope => {
    const restricted = scope === 'unknown' || scope === 'retained'; const value = { worker: 'clear', native: 'ready', scope, restricted };
    expect(valid(value)).toBe(true); expect(valid({ ...value, restricted: !restricted })).toBe(false);
});
it.each([null, {}, { worker: 'foreign', native: 'ready', scope: 'empty', restricted: false }, { worker: 'clear', native: 'foreign', scope: null, restricted: true },
    { worker: 'clear', native: 'ready', scope: 'private-native-id', restricted: true }, { worker: 'clear', native: 'ready', scope: 'empty', restricted: 'false' }])('invalid preference provenance %j cannot be repaired into a usable default', value => { expect(valid(value)).toBe(false); });
it('a session override needs matching current account, repository and worker epoch before its values or generic source are projected', () => {
    const restriction = { ...clearNativeRestriction(), session: { worker: 'clear', native: 'ready', scope: 'active', restricted: false } as const };
    const override = { accountId: '1', repositoryId: '7', epoch: 9, preferences: { density: 'compact' as const } };
    const value = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, CONNECTED, 9, restriction, undefined, override)!;
    expect(value).toMatchObject({ settings: { density: 'compact' }, provenance: { preferences: { density: 'session', scope: { session: true } } } });
    for (const patch of [{ accountId: '9' }, { repositoryId: '9' }, { epoch: 8 }]) expect(runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, CONNECTED, 9, restriction, undefined, { ...override, ...patch })).toBeNull();
    expect(Object.isFrozen(restriction.session)).toBe(false);
});
it('a public source label or an unknown native restriction cannot independently fabricate verified session applicability', () => {
    const restriction = clearNativeRestriction(); const value = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, CONNECTED, 9, restriction)!;
    const wire = { ...value, sourceTree: 'unbundled' };
    for (const session of [{ ...restriction.session, scope: 'active' }, { ...restriction.session, scope: 'unknown', restricted: true }])
        expect(decodeRuntimeConfiguration({ ...wire, provenance: { ...value.provenance, restriction: { ...restriction, session } } }, CONFIG, 'unbundled')).toBeNull();
});
it('a session positive pause must agree with its applied source and remains separate from an emergency cause', () => {
    const restriction = { ...clearNativeRestriction(), session: { worker: 'clear', native: 'ready', scope: 'active', restricted: true } as const };
    expect(runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, CONNECTED, 9, restriction, undefined, { accountId: '1', repositoryId: '7', epoch: 9, preferences: {} })).toBeNull();
    const value = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, CONNECTED, 9, restriction, undefined, { accountId: '1', repositoryId: '7', epoch: 9, preferences: { paused: true } });
    expect(value).toMatchObject({ settings: { paused: true }, provenance: { preferences: { pauses: ['session'] }, restriction: { native: { emergency: false } } } });
});
it('localized runtime explanations retain the preference owner, storage and scope separately from the pause owner', () => {
    const restriction = { ...clearNativeRestriction(), session: { worker: 'clear', native: 'ready', scope: 'retained', restricted: true } as const };
    const value = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0, restriction)!;
    for (const locale of ['en', 'es', 'fr', 'pt', 'unknown']) { const copy = sessionPreferenceProvenanceCopy(locale); const view = runtimeProvenanceView(value, locale);
        expect(view.rows).toContainEqual({ label: copy.scope, value: copy.scopes.retained }); expect(view.rows.some(row => row.label === copy.worker)).toBe(true); }
});
it('an unknown current preference operation explains unavailable native scope without claiming an emergency or unpaused state', () => {
    const restriction = { ...clearNativeRestriction(), session: { worker: 'pending', native: 'not-checked', scope: null, restricted: true } as const };
    const value = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0, restriction)!; const own = sessionPreferenceProvenanceCopy('en'); const common = runtimeProvenanceCopy('en');
    const view = runtimeProvenanceView(value, 'en'); expect(view.rows).toContainEqual({ label: own.scope, value: common.unknown });
    expect(view.rows).toContainEqual({ label: own.document, value: common.natives['not-checked'] }); expect(value.provenance.restriction.native.emergency).toBe(false);
});

it.each(['empty', 'inactive'] as const)('a readable session document with %s scope reports read status and applicability separately', scope => {
    const restriction = { ...clearNativeRestriction(), session: { worker: 'clear', native: 'ready', scope, restricted: false } as const };
    const value = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0, restriction)!;
    const messages = { en: 'Document read', es: 'Documento consultado', fr: 'Document consulté', pt: 'Documento consultado', unknown: 'Document read' };
    for (const [locale, documentRead] of Object.entries(messages)) {
        const copy = sessionPreferenceProvenanceCopy(locale);
        const view = runtimeProvenanceView(value, locale);
        expect(view.rows).toContainEqual({ label: copy.document, value: documentRead });
        expect(view.rows).toContainEqual({ label: copy.scope, value: copy.scopes[scope] });
    }
});

it('unsupported locale keys that name an inherited property use the complete English explanation', () => {
    const restriction = { ...clearNativeRestriction(), session: { worker: 'clear', native: 'ready', scope: 'empty', restricted: false } as const };
    const value = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0, restriction)!;
    for (const locale of ['constructor', 'CONSTRUCTOR-ZZ']) {
        expect(sessionPreferenceProvenanceCopy(locale)).toBe(sessionPreferenceProvenanceCopy('en'));
        expect(runtimeProvenanceView(value, locale)).toEqual(runtimeProvenanceView(value, 'en'));
    }
});
