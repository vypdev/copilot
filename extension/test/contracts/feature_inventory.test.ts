import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FEATURE_METADATA } from '../../src/domain/feature_metadata.ts';
import { FEATURE_FAMILIES } from '../../src/domain/feature_metadata_types.ts';
import { FEATURE_DEFAULTS } from '../../src/domain/feature_defaults.ts';
import { es } from '../../src/domain/feature_text_es.ts';
import { fr } from '../../src/domain/feature_text_fr.ts';
import { pt } from '../../src/domain/feature_text_pt.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings.ts';
import { EMPTY_INVENTORY_FILTERS } from '../../src/domain/inventory_filters.ts';
import { featureInventory, filterInventory, inventoryPage, featurePreferenceIntent, featureFavoriteIntent, inventorySource, inventoryResultText } from '../../src/domain/feature_inventory.ts';
import { inventoryCopy } from '../../src/domain/inventory_copy.ts';
import type { ConnectionsView } from '../../src/domain/named_sessions.ts';
import type { PreferenceSource } from '../../src/domain/profile_resolution.ts';
import { featureReferenceLink } from '../../src/domain/feature_links.ts';

const view: ConnectionsView = { state: 'ready', revision: 1, selected: 'work', connected: true, credentialEpoch: 2,
    entries: [{ id: 'work', name: 'Work', host: 'github.com', role: 'repository-read', viewerId: '1', viewerLogin: 'octo', repositoryId: '7', repository: 'company/example', organizationId: '55' }] };
const inventory = (settings = DEFAULT_SETTINGS) => featureInventory(settings, null, 'es');
const filter = (patch = {}) => filterInventory(inventory(), { ...EMPTY_INVENTORY_FILTERS, ...patch }, inventoryCopy('es'));
const sourceKinds: Record<string, string> = {
    'visible DOM/URL and nonsecret preferences': 'page', 'extension-owned personal state': 'personal',
    'canonical allowlisted GitHub reads or verified Action publications': 'api', 'verified target plus explicit user input': 'draft',
    'canonical target, separately authorized write identity and reviewed intent': 'write',
    'at most five explicitly tracked canonical targets through the shared read scheduler': 'monitor',
    'shared setup contracts and paired CLI metadata-only views': 'setup',
    'Integration 11.2: Actions read run/attempt/job identities and, when granted, Checks read check identities; external check IDs are not Actions IDs.': 'runs',
    'Integration 11.2: Checks read check-runs at the full head SHA, Commit statuses read contexts, and explicitly labeled loaded native requirement evidence; Action assessment remains separate.': 'checks',
    'Integration 11.2: GET check-runs/{verified-id}/annotations with optional selected-repository Checks read, parent repository/full-head validation and bounded pagination; loaded DOM is an explicit subset.': 'annotations',
};
it.each(FEATURE_FAMILIES)('bexh3-center-C25 %s metadata exactly preserves canonical IDs, purpose, safeguards and permission operands', family => {
    const contract = JSON.parse(readFileSync(new URL(`../../../specs/browser-extension/features/${family}.v1.json`, import.meta.url), 'utf8'));
    const actual = FEATURE_METADATA.filter(feature => feature.family === family);
    expect(actual.map(f => f.id)).toEqual(contract.features.map((f: { id: string }) => f.id));
    actual.forEach((feature, index) => {
        const source = contract.features[index];
        expect(feature).toMatchObject({ title: source.title, description: `${source.userOutcome} ${source.boundaryAcceptance}`, mode: source.mode,
            permission: source.permissionProfile, optionalPermissions: source.optionalBrowserPermissions, nativeTarget: source.nativeTarget });
        expect(feature.dataSource).toBe(sourceKinds[source.dataSource]);
        expect(feature.surfaces.length).toBeGreaterThan(0); expect(new Set(feature.surfaces).size).toBe(feature.surfaces.length);
    });
});
it.each([es, fr, pt])('all150 functions have complete original localized titles and purpose/safeguard descriptions', copy => {
    expect(Object.keys(copy).sort()).toEqual(Object.keys(FEATURE_DEFAULTS).sort());
    for (const [id, text] of Object.entries(copy)) {
        expect(text).toHaveLength(2); expect(text[0].length).toBeGreaterThan(5); expect(text[1].length).toBeGreaterThan(65);
        expect(text[1]).not.toMatch(/<[^>]*>|https?:|TODO/u); expect(id).toMatch(/^BEX-/u);
    }
});
it('bexp-CENTER02-C01 retains the complete150 inventory and truthful H3/later milestones independently of saved enabling flags', () => {
    const all = inventory(); expect(all).toHaveLength(150); expect(new Set(all.map(f => f.id)).size).toBe(150);
    expect(all.filter(f => f.phase === 'current')).toHaveLength(14); expect(all.filter(f => f.phase === 'later')).toHaveLength(136);
    for (const feature of all) { expect(feature.issue).toBe(feature.milestone + 701); expect(Object.isFrozen(feature)).toBe(true); }
    expect(all.find(f => f.id === 'BEX-COPILOT-01')).toMatchObject({ milestone: 9, issue: 710, tools: null, phase: 'later' });
    expect(all.find(f => f.id === 'BEX-SETUP-01')).toMatchObject({ milestone: 11, issue: 712 });
    expect(all.find(f => f.id === 'BEX-CENTER-06')!.tools).toBe('privacy');
    expect(all.find(f => f.id === 'BEX-CENTER-07')!.tools).toBe('shortcuts');
    expect(all.find(f => f.id === 'BEX-CENTER-08')!.tools).toBe('data');
});
it.each(['en', 'es', 'fr', 'pt'] as const)('bexh3-center-C31 complete %s inventory, filter labels and details share one language', locale => {
    const all = featureInventory(DEFAULT_SETTINGS, undefined, locale); const copy = inventoryCopy(locale);
    for (const feature of all) {
        expect(feature.title.length).toBeGreaterThan(5); expect(copy.families[feature.family]).toBeTruthy();
        for (const surface of feature.surfaces) expect(copy.surfaces[surface]).toBeTruthy();
        expect(copy.permissions[feature.permission]).toBeTruthy(); expect(copy.modes[feature.mode]).toBeTruthy(); expect(copy.sources[feature.source]).toBeTruthy();
        expect(copy.dataSources[feature.dataSource]).toBeTruthy(); expect(copy.freshnessRules[feature.mode]).toBeTruthy();
        expect(feature.defaultEnabled).toBe(FEATURE_DEFAULTS[feature.id]);
    }
    expect(inventoryResultText(150, 1, 25, copy)).not.toContain('{');
});
it('bexh3-center-C34 searches all IDs, words, localized safeguards, accents, categories, modes and sources without a provider', () => {
    expect(filter({ query: '  configuracion  EFECTIVA ' }).map(f => f.id)).toContain('BEX-SETUP-03');
    expect(filter({ query: 'bex-nav-02' }).map(f => f.id)).toEqual(['BEX-NAV-02']);
    expect(filter({ query: 'NO_EXISTE_NADA' })).toEqual([]);
    expect(filter({ query: 'repositorio' }).length).toBeGreaterThan(20);
    expect(filter({ query: 'similitud causalidad' })).toEqual([]);
    expect(filter({ query: ' ' })).toHaveLength(150);
    expect(filter({ query: 'x'.repeat(1000) })).toEqual([]);
});
it('surface groups span native contexts rather than incorrectly equating category with surface', () => {
    expect(filter({ surface: 'review' }).map(f => f.id)).toEqual(expect.arrayContaining(['BEX-NAV-02', 'BEX-REVIEW-01', 'BEX-CI-03', 'BEX-COPILOT-08']));
    expect(filter({ surface: 'setup' }).map(f => f.id)).toContain('BEX-SETUP-01');
    expect(filter({ family: 'NAV', surface: 'issue' }).map(f => f.id)).toContain('BEX-NAV-02');
});
it.each([{ family: 'NAV' }, { mode: 'read' }, { permission: 'native-human-submission' }, { phase: 'current' }, { source: 'default' }, { setting: 'enabled' }])('combines the exact independent filter %j', patch => {
    const rows = filter(patch); expect(rows.length).toBeGreaterThan(0);
    const [key, value] = Object.entries(patch)[0];
    for (const row of rows) expect(key === 'setting' ? row.enabled ? 'enabled' : 'disabled' : row[key as keyof typeof row]).toBe(value);
});
it('disabled and paused preferences remain separate from implementation and require no granted operation authority', () => {
    const settings = { ...DEFAULT_SETTINGS, paused: true, features: { 'BEX-NAV-01': false } };
    const rows = inventory(settings); expect(rows.every(f => f.paused)).toBe(true);
    expect(filterInventory(rows, { ...EMPTY_INVENTORY_FILTERS, setting: 'paused' }, inventoryCopy('es'))).toHaveLength(150);
    expect(filterInventory(rows, { ...EMPTY_INVENTORY_FILTERS, setting: 'disabled' }, inventoryCopy('es'))).toEqual([]);
    expect(filter({ setting: 'disabled' }).length).toBeGreaterThan(0);
});
it('bexh3-center-C35 shows per-feature verified profile provenance without applying a different repository scope', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, features: { 'BEX-NAV-01': true }, repositories: { '7': { features: { 'BEX-CODE-01': false } } },
        center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'work', name: '<img> Personal profile', scope: { kind: 'repository', host: 'github.com', accountId: '1', repositoryId: '7' }, preferences: { features: { 'BEX-NAV-01': false } } }], selected: ['work'] } };
    const selected = featureInventory(settings, view, 'es'); expect(selected.find(f => f.id === 'BEX-NAV-01')).toMatchObject({ source: 'profile', profileId: 'work', profileName: '<img> Personal profile', enabled: false });
    expect(selected.find(f => f.id === 'BEX-CODE-01')).toMatchObject({ source: 'repository', enabled: false });
    expect(featureInventory(settings, { ...view, connected: false }, 'es').find(f => f.id === 'BEX-NAV-01')).toMatchObject({ source: 'global', enabled: true, profileId: null });
    expect(filterInventory(selected, { ...EMPTY_INVENTORY_FILTERS, source: 'profile', query: 'personal profile' }, inventoryCopy('es')).map(f => f.id)).toEqual(['BEX-NAV-01']);
    expect(filterInventory(selected, { ...EMPTY_INVENTORY_FILTERS, profile: 'work' }, inventoryCopy('es')).map(f => f.id)).toEqual(['BEX-NAV-01']);
    expect(filterInventory(selected, { ...EMPTY_INVENTORY_FILTERS, profile: 'another-profile' }, inventoryCopy('es'))).toEqual([]);
});
it.each(['default', 'global', 'repository', 'session', 'tab', 'emergency', 'profile:work'] as PreferenceSource[])('keeps exact source class %s without conflating future session or pause provenance', source => {
    expect(inventorySource(source)).toBe(source.startsWith('profile:') ? 'profile' : source);
});
it('paginates a complete local result set in25-item pages and clamps changed or invalid page indices', () => {
    const all = inventory(); expect(inventoryPage(all, 1)).toMatchObject({ current: 1, pages: 6, start: 1, end: 25 });
    expect(inventoryPage(all, 99)).toMatchObject({ current: 6, start: 126, end: 150 });
    for (const index of [0, -1, Number.NaN, Infinity]) expect(inventoryPage(all, index).current).toBe(1);
    expect(inventoryPage([], 6)).toMatchObject({ current: 1, pages: 1, start: 0, end: 0, features: [] });
});
it('plans only one known global preference and explicit inheritance, never a grant or arbitrary command', () => {
    for (const [choice, value] of [['inherit', null], ['enabled', true], ['disabled', false]]) expect(featurePreferenceIntent('BEX-NAV-01', choice as string)).toEqual({ type: 'preferences', values: { features: { 'BEX-NAV-01': value } } });
    expect(featurePreferenceIntent('unknown', 'enabled')).toBe(null); expect(featurePreferenceIntent('BEX-NAV-01', 'grant')).toBe(null);
});
it('bexh3-center-C27 favorites preserve order, reject unknown IDs/capacity and still allow removal at the20-item limit', () => {
    const ids = inventory().slice(0, 20).map(f => f.id); const settings = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, favorites: ids } };
    expect(featureFavoriteIntent(settings, 'BEX-REVIEW-01')).toBe(null); expect(featureFavoriteIntent(settings, 'unknown')).toBe(null);
    expect(featureFavoriteIntent(settings, ids[0])).toEqual({ type: 'center', values: { favorites: ids.slice(1) } });
    const rows = featureInventory(settings, null, 'es'); expect(filterInventory(rows, { ...EMPTY_INVENTORY_FILTERS, favorites: true }, inventoryCopy('es'))).toHaveLength(20);
    expect(featureFavoriteIntent(DEFAULT_SETTINGS, 'BEX-NAV-01')).toEqual({ type: 'center', values: { favorites: ['BEX-NAV-01'] } });
});

it('reference links admit only registered feature IDs and two fixed GitHub destinations without accepting host/path/ref overrides', () => {
    expect(featureReferenceLink({ kind: 'milestone', id: 'BEX-SETUP-01' })).toBe('https://github.com/vypdev/copilot/issues/712');
    expect(featureReferenceLink({ kind: 'contract', id: 'BEX-NAV-01' })).toBe('https://github.com/vypdev/copilot/blob/develop/specs/browser-extension/features/NAV.v1.json');
    for (const value of [null, {}, { kind: 'milestone', id: 'unknown' }, { kind: 'other', id: 'BEX-NAV-01' },
        { kind: 'contract', id: 'BEX-NAV-01', url: 'https://evil.invalid' }, { kind: 'contract', id: '../private' }, { kind: 'contract', id: 1 }]) expect(featureReferenceLink(value)).toBe(null);
});
