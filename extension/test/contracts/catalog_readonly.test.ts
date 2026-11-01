import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { featureInventory, filterInventory } from '../../src/domain/feature_inventory.ts';
import { availableInventoryFilters, EMPTY_INVENTORY_FILTERS } from '../../src/domain/inventory_filters.ts';
import { inventoryCopy } from '../../src/domain/inventory_copy.ts';
import { currentCenterSettings, type CenterClientView } from '../../src/domain/center_client_view.ts';
import type { ConnectionsView } from '../../src/domain/named_sessions.ts';

const ready: CenterClientView = { phase: 'ready', review: null, issue: null,
    data: { state: 'ready', role: 'editor', settings: DEFAULT_SETTINGS, rollbackAvailable: false, lastOperation: null } };
it('represents every absent saved preference as unknown, never disabled, unfavorited or default-derived', () => {
    const all = featureInventory(null, null, 'en'); expect(all).toHaveLength(150);
    for (const row of all) {
        expect(row).toMatchObject({ enabled: null, favorite: null, paused: null, source: 'unknown', profileId: null, profileName: null });
        expect(typeof row.defaultEnabled).toBe('boolean'); expect(Object.isFrozen(row)).toBe(true);
    }
    const apply = (patch: object) => filterInventory(all, { ...EMPTY_INVENTORY_FILTERS, ...patch }, inventoryCopy('en'));
    expect(apply({ setting: 'unknown' })).toHaveLength(150);
    for (const setting of ['enabled', 'disabled', 'paused']) expect(apply({ setting })).toEqual([]);
    expect(apply({ favorites: true })).toEqual([]); expect(apply({ source: 'default' })).toEqual([]);
});
it('ignores a retained private connection when no compatible saved settings are known', () => {
    const connections: ConnectionsView = { state: 'ready', revision: 1, credentialEpoch: 0, selected: 'work', connected: true,
        entries: [{ id: 'work', name: 'Private name', host: 'github.com', role: 'repository-read', viewerId: '1', viewerLogin: 'private-viewer', repositoryId: '7', repository: 'private/project' }] };
    expect(JSON.stringify(featureInventory(null, connections, 'en'))).not.toMatch(/Private name|private-viewer|private\/project/u);
});
it.each(['en', 'es', 'fr', 'pt'] as const)('keeps complete localized metadata and unknown-state explanations in %s without personal state', locale => {
    const copy = inventoryCopy(locale); const all = featureInventory(null, null, locale);
    expect(copy.unknown.length).toBeGreaterThan(10); expect(copy.unknownHint.length).toBeGreaterThan(100);
    expect(copy.sources.unknown.length).toBeGreaterThan(10);
    expect(filterInventory(all, { ...EMPTY_INVENTORY_FILTERS, query: 'BEX-SETUP-18' }, copy).map(row => row.id)).toEqual(['BEX-SETUP-18']);
});
it('temporarily disables only filters whose personal facts are unknown and preserves metadata search without mutating retained state', () => {
    const saved = { ...EMPTY_INVENTORY_FILTERS, query: 'links', family: 'NAV', surface: 'issue', source: 'profile', profile: 'private', setting: 'paused', favorites: true };
    expect(availableInventoryFilters(saved, false)).toEqual({ ...saved, source: '', profile: '', setting: '', favorites: false });
    expect(saved.profile).toBe('private'); expect(availableInventoryFilters(saved, true)).toBe(saved);
});
it.each([null, 'invalid', 'unchanged'] as const)('retains validated settings after the recoverable draft state %s', issue => {
    expect(currentCenterSettings({ ...ready, issue })).toBe(DEFAULT_SETTINGS);
});
it.each(['unavailable', 'incompatible', 'stale', 'denied', 'busy', 'conflict', 'expired'] as const)('does not promote a retained snapshot after current observation fails with %s', issue => {
    expect(currentCenterSettings({ ...ready, issue })).toBe(null);
});
it.each(['future', 'corrupt', 'migration-required'] as const)('does not promote %s settings to current usable data', state => {
    expect(currentCenterSettings({ ...ready, data: { ...ready.data!, state, settings: null } })).toBe(null);
});
it('has no current settings before the native document is available', () => {
    expect(currentCenterSettings({ ...ready, phase: 'loading', data: null })).toBe(null);
});
it.each(['loading', 'stopped'] as const)('does not expose a retained snapshot as current in %s, including recoverable draft states', phase => {
    for (const issue of [null, 'invalid', 'unchanged'] as const) expect(currentCenterSettings({ ...ready, phase, issue })).toBe(null);
});
