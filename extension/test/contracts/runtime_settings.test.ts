import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, effectiveSettings, importedSettings, loadSettings, validSettings } from '../../src/domain/settings.ts';
import { FEATURE_DEFAULTS } from '../../src/domain/feature_defaults.ts';
import { deepFreeze, keys, natural, record, utf8Bytes, jsonBytesWithin } from '../../src/domain/value.ts';

const clone = () => structuredClone(DEFAULT_SETTINGS);
it('github-browser-extension-runtime-C03 validates complete nonsecret defaults and catalog-derived defaults without activating functions', () => {
    expect(validSettings(DEFAULT_SETTINGS)).toBe(true); expect(loadSettings(undefined).state).toBe('ready');
    expect(loadSettings(DEFAULT_SETTINGS)).toEqual({ state: 'ready', settings: DEFAULT_SETTINGS, migrated: false });
    const index = JSON.parse(readFileSync(new URL('../../../specs/browser-extension/feature-catalog.v1.json', import.meta.url), 'utf8'));
    const expected: Record<string, boolean> = {};
    for (const family of index.families) for (const feature of JSON.parse(readFileSync(new URL(`../../../specs/browser-extension/${family.file}`, import.meta.url), 'utf8')).features) {
        expected[feature.id] = feature.default !== 'explicit-opt-in';
    }
    expect(FEATURE_DEFAULTS).toEqual(expected); expect(Object.keys(expected)).toHaveLength(150);
});
it('github-browser-extension-runtime-C24 atomically migrates retired compact values and preserves future/invalid schemas', () => {
    for (const compact of [true, false]) expect(loadSettings({ schemaVersion: 0, compact })).toMatchObject({ state: 'ready', migrated: true,
        settings: { density: compact ? 'compact' : 'comfortable' } });
    expect(loadSettings({ schemaVersion: 9, privateUnknownData: 1 }).state).toBe('future');
    for (const value of [null, [], false, {}, { schemaVersion: -1 }, { schemaVersion: 0, compact: 1 },
        { schemaVersion: 0, compact: true, secret: 'no' }]) expect(loadSettings(value).state).toBe('invalid');
    const input = clone(); const loaded = loadSettings(input); expect(Object.isFrozen(loaded.settings)).toBe(true);
    expect(Object.isFrozen(loaded.settings.features)).toBe(true); expect(loaded.settings).not.toBe(input);
});
it('github-browser-extension-runtime-C03 rejects malformed, secret-bearing, oversized and unsupported settings without partial normalization', () => {
    const base = clone();
    for (const value of [null, [], { ...base, extra: true }, { ...base, schemaVersion: 2 }, { ...base, revision: -1 },
        { ...base, features: null }, { ...base, features: { unknown: true } }, { ...base, features: { 'BEX-NAV-01': 'yes' } },
        { ...base, density: false }, { ...base, density: 'giant' }, { ...base, shortcuts: 1 }, { ...base, paused: null },
        { ...base, locale: 'xx' }, { ...base, theme: 'remote' }, { ...base, repositories: [] },
        { ...base, repositories: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i + 1), {}])) },
        { ...base, repositories: { '7': { savedViews: Array.from({ length: 20 }, () => 'é'.repeat(2000)) } } }]) expect(validSettings(value)).toBe(false);
    const missing = { ...base } as Record<string, unknown>; delete missing.features; expect(validSettings(missing)).toBe(false);
});
it('github-browser-extension-runtime-C03 bounds repository identifiers, overrides and saved views and disallows authority fields', () => {
    for (const repositories of [{ '0': {} }, { '7\n': {} }, { '7': null }, { '7': { secret: 'no' } },
        { '7': { density: 'other' } }, { '7': { paused: 1 } }, { '7': { connected: 'yes' } },
        { '7': { features: [] } }, { '7': { savedViews: 'query' } }, { '7': { savedViews: Array(21).fill('x') } },
        { '7': { savedViews: [null] } }, { '7': { savedViews: ['x'.repeat(2001)] } }, { '7': { savedViews: ['x\n'] } }]) {
        expect(validSettings({ ...clone(), repositories })).toBe(false);
    }
    expect(validSettings({ ...clone(), features: { 'BEX-NAV-01': true }, repositories: { '7': { connected: false,
        density: 'compact', shortcuts: true, paused: false, features: { 'BEX-NAV-01': false }, savedViews: ['is:issue'] } } })).toBe(true);
});
it('github-browser-extension-runtime-C05 enforces pause precedence and repository overrides without granting absent connection', () => {
    const settings = { ...clone(), features: { 'BEX-NAV-01': false }, repositories: { '7': {
        connected: true, density: 'compact' as const, shortcuts: true, features: { 'BEX-NAV-01': true } } } };
    expect(effectiveSettings(settings, '7', false, false)).toMatchObject({ paused: false, density: 'compact', shortcuts: true,
        connected: true, features: { 'BEX-NAV-01': true } });
    expect(effectiveSettings(settings, '8', false, false)).toMatchObject({ connected: false, density: 'comfortable', shortcuts: false });
    for (const [global, repo, tab, emergency] of [[true, false, false, false], [false, true, false, false], [false, false, true, false], [false, false, false, true]]) {
        expect(effectiveSettings({ ...settings, paused: global, repositories: { '7': { ...settings.repositories['7'], paused: repo } } }, '7', tab, emergency)).toMatchObject({ paused: true, connected: false });
    }
});
it('github-browser-extension-runtime-C31 imports cannot grant connection or release existing pauses, and exports remain nonsecret', () => {
    const imported = { ...clone(), repositories: { '7': { connected: true, paused: false }, '8': { paused: true } } };
    const current = { ...clone(), paused: true, repositories: { '7': { paused: true, connected: true } } };
    expect(importedSettings(current, imported)).toMatchObject({ paused: true, revision: 1, repositories: {
        '7': { paused: true, connected: true }, '8': { paused: true, connected: false } } });
    expect(importedSettings(DEFAULT_SETTINGS, imported)).toMatchObject({ repositories: { '7': { connected: false }, '8': { connected: false } } });
});
it('measures UTF-8 bytes and refuses non-record values, inherited prototypes and invalid natural numbers', () => {
    expect(utf8Bytes('aé€😀')).toBe(10); expect(record(Object.create(null))).toBe(false);
    for (const value of [null, [], true]) expect(record(value)).toBe(false);
    expect(record({})).toBe(true); expect(keys({ a: 1 }, ['a'])).toBe(true); expect(keys({ b: 1 }, ['a'])).toBe(false);
    for (const value of ['1', -1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(natural(value)).toBe(false);
    expect(natural(0)).toBe(true); expect(deepFreeze(null)).toBe(null); expect(deepFreeze('x')).toBe('x');
});

it('rejects cyclic/non-JSON configuration safely before any persistence', () => {
    const repositories: Record<string, unknown> = {}; repositories['7'] = repositories;
    expect(validSettings({ ...DEFAULT_SETTINGS, repositories })).toBe(false);
    expect(jsonBytesWithin(undefined, 65536)).toBe(false); expect(jsonBytesWithin({ value: 1n }, 65536)).toBe(false);
    expect(jsonBytesWithin({}, 65536)).toBe(true);
});
