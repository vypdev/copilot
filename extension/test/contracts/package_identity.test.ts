import { expect, it } from 'vitest';
import { packageIdentity, packageObservation } from '../../src/domain/package_identity.ts';
import { supportStatus, isSupportRoute } from '../../src/domain/support_context.ts';
import { supportCopy } from '../../src/domain/support_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import type { CenterClientView } from '../../src/domain/center_client_view.ts';

const manifest = { name: 'Copilot Browser — Development Runtime', version: '0.1.0', manifest_version: 3 };
const ready: CenterClientView = { phase: 'ready', data: { state: 'ready', settings: DEFAULT_SETTINGS, role: 'editor', rollbackAvailable: false, lastOperation: null }, issue: null, review: null };
it('projects immutable native scalar facts without copying arbitrary manifest data or requiring a plain prototype', () => {
    const native = Object.assign(Object.create(null), manifest, { private_data: 'not-ui-data', background: { source: 'private-path' } });
    const value = packageObservation(native); expect(value).toEqual({ state: 'known', name: manifest.name, version: '0.1.0', manifestVersion: 3 });
    expect(Object.isFrozen(value)).toBe(true); expect(JSON.stringify(value)).not.toContain('private');
    expect(packageObservation(Object.assign(Object.create({ vendorField: true }), manifest))).toEqual(value);
});
it('bounds native version components and names without mistaking the package version for source or Action identity', () => {
    for (const version of ['0', '1.2', '1.2.3', '1.2.3.65535']) expect(packageObservation({ ...manifest, version }).state).toBe('known');
    expect(packageObservation({ ...manifest, name: 'C'.repeat(128) }).state).toBe('known');
    for (const version of ['65536', '1.2.3.65536', '00', '1.01', '1.2.3.4.5', 'v1.2', '1\n', '', null, 1]) {
        expect(packageObservation({ ...manifest, version })).toEqual({ state: 'unavailable' });
    }
    for (const name of ['', ' ', ' Copilot', 'Copilot ', 'C'.repeat(129), 'Copilot\u202e', 'Copilot\n', '\ud800', null, 4]) {
        expect(packageObservation({ ...manifest, name })).toEqual({ state: 'unavailable' });
    }
});
it('rejects missing or structurally incompatible metadata and never serializes other properties', () => {
    for (const value of [null, undefined, '0.1.0', [], true, { ...manifest, manifest_version: 2 }, { ...manifest, manifest_version: '3' }, {}]) {
        expect(packageObservation(value)).toEqual({ state: 'unavailable' });
    }
    const value = { ...manifest, get secrets() { throw new Error('must-not-inspect'); } };
    expect(packageObservation(value).state).toBe('known');
});
it('keeps only an exact bound page-source digest and never claims unbundled, commit or URL input is one', () => {
    const identity = packageIdentity({ state: 'unsupported' }, 'a'.repeat(64));
    expect(identity).toEqual({ observation: { state: 'unsupported' }, sourceTree: 'a'.repeat(64) });
    expect(Object.isFrozen(identity.observation)).toBe(true); expect(Object.isFrozen(identity)).toBe(true);
    for (const source of [null, undefined, 'unbundled', 'A'.repeat(64), 'a'.repeat(40), 'a'.repeat(65), 'a'.repeat(64) + '\n', 7]) {
        expect(packageIdentity({ state: 'unavailable' }, source).sourceTree).toBeNull();
    }
});
it('support exposes a finite readonly route inventory and does not broaden arbitrary local or external navigation', () => {
    expect(['help', 'about', 'recovery'].every(route => isSupportRoute(route as 'help'))).toBe(true);
    expect(isSupportRoute('welcome')).toBe(false); expect(isSupportRoute('profiles')).toBe(false);
});
it('current settings and nonmutating invalid/unchanged outcomes are available without treating retained failed data as current', () => {
    for (const issue of [null, 'invalid', 'unchanged'] as const) expect(supportStatus({ ...ready, issue })).toEqual({ state: 'ready', operation: 'none', canRead: true });
    for (const issue of ['unavailable', 'denied', 'busy', 'conflict', 'expired'] as const) {
        expect(supportStatus({ ...ready, issue })).toEqual({ state: 'unavailable', operation: 'none', canRead: true });
    }
    expect(supportStatus({ ...ready, data: null }).state).toBe('unavailable');
});
it.each(['future', 'corrupt', 'migration-required'] as const)('represents %s data without synthesizing a settings document', state => {
    expect(supportStatus({ ...ready, data: { ...ready.data!, state, settings: null } })).toEqual({ state, operation: 'none', canRead: true });
    expect(supportStatus({ ...ready, data: { ...ready.data!, state, settings: null }, issue: 'unavailable' }).state).toBe('unavailable');
});
it.each(['loading', 'reading'] as const)('keeps support available during %s while distinguishing a pending observation from retained settings', phase => {
    expect(supportStatus({ ...ready, phase })).toEqual({ state: 'checking', operation: 'none', canRead: false });
    expect(supportStatus({ ...ready, phase, issue: 'incompatible' }).state).toBe('incompatible');
});
it('gives explicit expired/build-mismatch states precedence and never promotes a stopped view', () => {
    expect(supportStatus({ ...ready, issue: 'stale' }).state).toBe('stale'); expect(supportStatus({ ...ready, issue: 'incompatible' }).state).toBe('incompatible');
    expect(supportStatus({ ...ready, phase: 'stopped' })).toEqual({ state: 'unavailable', operation: 'none', canRead: false });
});
it.each([['committing', 'applying'], ['unknown', 'unknown'], ['saved', 'saved'], ['cancelled', 'none']] as const)('preserves the %s operation fact separately from a failed current read', (state, operation) => {
    const review = { state, action: 'center-preferences' as const, revision: 0, before: DEFAULT_SETTINGS, after: DEFAULT_SETTINGS, expiresAt: 5000 };
    expect(supportStatus({ ...ready, issue: 'unavailable', review })).toEqual({ state: 'unavailable', operation, canRead: true });
    expect(supportStatus({ ...ready, phase: 'reading', review })).toEqual({ state: 'checking', operation, canRead: false });
});
it.each(['en', 'es', 'fr', 'pt'] as const)('provides a complete immutable %s support resource with matching state inventories', locale => {
    const copy = supportCopy(locale); const base = supportCopy('en');
    expect(Object.keys(copy)).toEqual(Object.keys(base)); expect(Object.keys(copy.statuses)).toEqual(Object.keys(base.statuses));
    expect(Object.keys(copy.operations)).toEqual(Object.keys(base.operations)); expect(Object.isFrozen(copy.statuses)).toBe(true);
    expect(Object.values(copy.statuses).every(text => text.length > 20)).toBe(true);
    expect(copy.updateSteps).toHaveLength(3); expect(copy.recoverySteps).toHaveLength(3); expect(copy.operations.none).toBe('');
});
