import { expect, it } from 'vitest';
import { CENTER_COMMANDS, DEFAULT_CENTER_SETTINGS, validCenterSettings } from '../../src/domain/center_settings.ts';
import { FEATURE_DEFAULTS } from '../../src/domain/feature_defaults.ts';

it('bexh3-center-C27 accepts only bounded known favorites and center command bindings', () => {
    expect(validCenterSettings(DEFAULT_CENTER_SETTINGS)).toBe(true);
    const bindings = CENTER_COMMANDS.map((command, index) => ({ command, binding: `Alt+Shift+${'KPOH'[index]}` }));
    expect(validCenterSettings({ ...DEFAULT_CENTER_SETTINGS, favorites: Object.keys(FEATURE_DEFAULTS).slice(0, 20), bindings })).toBe(true);
    for (const favorites of [null, 'all', Array(21).fill('BEX-NAV-01'), ['BEX-UNKNOWN-01'], [null], ['BEX-NAV-01', 'BEX-NAV-01']]) {
        expect(validCenterSettings({ ...DEFAULT_CENTER_SETTINGS, favorites })).toBe(false);
    }
});
it('rejects unknown, duplicate, malformed and oversized bindings without accepting arbitrary commands', () => {
    for (const bindings of [null, 'all', Array(5).fill({}), [null], [{ command: 'shell', binding: 'Alt+Shift+K' }],
        [{ command: false, binding: 'Alt+Shift+K' }], [{ command: 'open-help', binding: 1 }],
        [{ command: 'open-help', binding: 'Alt+Shift+K', commandLine: 'run' }],
        [{ command: 'open-help', binding: 'Alt+Shift+K\n' }], [{ command: 'open-help', binding: 'Ctrl+P' }],
        [{ command: 'open-help', binding: 'Alt+Shift+K' }, { command: 'open-help', binding: 'Alt+Shift+P' }],
        [{ command: 'open-help', binding: 'Alt+Shift+K' }, { command: 'open-profiles', binding: 'Alt+Shift+K' }]]) {
        expect(validCenterSettings({ ...DEFAULT_CENTER_SETTINGS, bindings })).toBe(false);
    }
});
it('bounds appearance, onboarding and explicitly opted-in retention independently of feature authority', () => {
    for (const onboarding of ['welcome', 'profile', 'permissions', 'complete']) expect(validCenterSettings({ ...DEFAULT_CENTER_SETTINGS,
        onboarding, recents: true, diagnostics: true, notes: 'local', appearance: { text: 'large', motion: 'reduced', contrast: 'high' } })).toBe(true);
    for (const patch of [{ schemaVersion: 3 }, { profiles: null }, { selected: ['missing'] },
        { appearance: null }, { appearance: { text: 'standard', motion: 'system' } },
        { appearance: { text: 'standard', motion: 'system', contrast: 'system', extra: true } },
        { appearance: { text: 'tiny', motion: 'system', contrast: 'system' } },
        { appearance: { text: 'standard', motion: 'always', contrast: 'system' } },
        { appearance: { text: 'standard', motion: 'system', contrast: 'low' } },
        { onboarding: 'unknown' }, { recents: 'yes' }, { diagnostics: null }, { notes: 'cloud' }, { secret: 'synthetic-secret' }]) {
        expect(validCenterSettings({ ...DEFAULT_CENTER_SETTINGS, ...patch })).toBe(false);
    }
});
it('rejects absent fields, nonrecords and oversized/cyclic input atomically', () => {
    for (const value of [null, [], {}, { ...DEFAULT_CENTER_SETTINGS, profiles: ['x'.repeat(65536)] }]) expect(validCenterSettings(value)).toBe(false);
    const missing = { ...DEFAULT_CENTER_SETTINGS } as Record<string, unknown>; delete missing.notes;
    expect(validCenterSettings(missing)).toBe(false);
    const cycle: Record<string, unknown> = { ...DEFAULT_CENTER_SETTINGS }; cycle.profiles = [cycle];
    expect(validCenterSettings(cycle)).toBe(false);
});
