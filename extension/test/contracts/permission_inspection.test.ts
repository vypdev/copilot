import { expect, it } from 'vitest';
import { BROWSER_CAPABILITIES, EMPTY_PERMISSION_INSPECTION, permissionQuery } from '../../src/domain/permission_inspection.ts';
import { privacyConnection } from '../../src/domain/privacy_context.ts';
import { privacyCopy } from '../../src/domain/privacy_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import type { CenterClientView } from '../../src/domain/center_client_view.ts';
import { targetManifest } from '../../src/infrastructure/target_manifests.ts';
import { TARGETS } from '../../src/domain/target.ts';

const ready: CenterClientView = { phase: 'ready', issue: null, review: null,
    data: { state: 'ready', role: 'editor', settings: DEFAULT_SETTINGS, rollbackAvailable: false, lastOperation: null },
    connections: { state: 'ready', credentialEpoch: 0, revision: 1, selected: 'work', connected: true,
        entries: [{ id: 'work', name: 'Private local label', host: 'github.com', role: 'repository-read', viewerId: '1', viewerLogin: 'octo', repositoryId: '7', repository: 'company/example' }] } };
it.each(BROWSER_CAPABILITIES)('bexp-CENTER06-C01 fixed %s queries are immutable and contain only declared build scopes', capability => {
    const query = permissionQuery(capability); expect(Object.isFrozen(query)).toBe(true);
    for (const target of TARGETS) {
        const manifest = targetManifest(target);
        expect(query.permissions ?? []).toEqual(capability === 'local-storage' ? manifest.permissions : []);
        expect(query.origins ?? []).toEqual(capability === 'github-pages' ? manifest.host_permissions : capability === 'github-api' ? manifest.optional_host_permissions : []);
    }
});
it('starts with explicitly unknown observations without inferring grants from the manifest', () => {
    expect(EMPTY_PERMISSION_INSPECTION).toEqual({ phase: 'idle', pending: false,
        grants: { 'local-storage': 'unknown', 'github-pages': 'unknown', 'github-api': 'unknown' } });
    expect(Object.isFrozen(EMPTY_PERMISSION_INSPECTION.grants)).toBe(true);
});
it('projects only the selected observed read identity, without its local name, vault identifiers or other accounts', () => {
    expect(privacyConnection(ready, 'granted')).toEqual({ state: 'connected', host: 'github.com', viewer: 'octo', repository: 'company/example', role: 'repository-read' });
    expect(JSON.stringify(privacyConnection(ready, 'granted'))).not.toMatch(/Private local label|viewerId|credentialEpoch/u);
});
it.each(['not-granted', 'unknown', 'unsupported'] as const)('browser observation %s cannot expose an otherwise retained private identity', grant => {
    expect(privacyConnection(ready, grant)).toEqual({ state: 'unknown' });
});
it('reports a native disconnected fact distinctly from unavailable connection evidence', () => {
    const connections = ready.connections!; if (connections.state !== 'ready') throw new Error('fixture');
    expect(privacyConnection({ ...ready, connections: { ...connections, connected: false } }, 'unknown')).toEqual({ state: 'disconnected' });
    expect(privacyConnection({ ...ready, connections: { state: 'unavailable' } }, 'granted')).toEqual({ state: 'unknown' });
    expect(privacyConnection({ ...ready, connections: null }, 'granted')).toEqual({ state: 'unknown' });
});
it('does not invent a selected identity when the native projection has no matching selected entry', () => {
    expect(privacyConnection({ ...ready, connections: { state: 'ready', revision: 1, connected: true, selected: 'missing', entries: [] } }, 'granted')).toEqual({ state: 'unknown' });
});
it('reading or failed current documents retire identity projection even if an old connection was retained', () => {
    expect(privacyConnection({ ...ready, phase: 'reading' }, 'granted')).toEqual({ state: 'unknown' });
    expect(privacyConnection({ ...ready, data: null }, 'granted')).toEqual({ state: 'unknown' });
    expect(privacyConnection({ ...ready, issue: 'stale' }, 'granted')).toEqual({ state: 'unknown' });
});
it.each(['invalid', 'unchanged'] as const)('a recoverable %s preference draft does not replace an independently observed identity', issue => {
    expect(privacyConnection({ ...ready, issue }, 'granted').state).toBe('connected');
});
it('a current native identity remains independent of a future saved preference schema', () => {
    expect(privacyConnection({ ...ready, data: { ...ready.data!, state: 'future', settings: null } }, 'granted').state).toBe('connected');
});
it.each(['en', 'es', 'fr', 'pt'] as const)('complete %s privacy content covers every grant, scope, retention and native recovery path', locale => {
    const copy = privacyCopy(locale); expect(Object.keys(copy).sort()).toEqual(Object.keys(privacyCopy('en')).sort());
    for (const value of Object.values(copy)) if (typeof value === 'string') expect(value.length).toBeGreaterThan(3);
    expect(Object.keys(copy.capabilities)).toEqual([...BROWSER_CAPABILITIES]);
    for (const row of Object.values(copy.capabilities)) for (const value of Object.values(row)) expect(value.length).toBeGreaterThan(10);
    expect(Object.keys(copy.statuses)).toEqual(['granted', 'not-granted', 'unknown', 'unsupported']);
    expect(Object.keys(copy.guides)).toEqual(['chromium', 'firefox', 'safari']); expect(Object.isFrozen(copy)).toBe(true);
});
