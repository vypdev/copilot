import { expect, it } from 'vitest';
import { CENTER_COMMANDS, centerCommandRoute, shortcutCommand, validCenterBindings, type CenterBinding, type ShortcutStroke } from '../../src/domain/shortcuts.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { planSettingsChange } from '../../src/domain/settings_change.ts';
import { runtimeConfiguration, decodeRuntimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import { CONFIG } from '../fixtures/page_configuration.ts';

const bindings: readonly CenterBinding[] = CENTER_COMMANDS.map((command, index) => ({ command, binding: `Alt+Shift+${'CFPH'[index]}` }));
const stroke: ShortcutStroke = { key: 'f', code: 'KeyF', trusted: true, prevented: false, repeat: false, composing: false,
    altGraph: false, alt: true, shift: true, control: false, meta: false };
it('the four fixed local commands have distinct packaged destinations and match explicit physical positions without a URL operand', () => {
    expect(CENTER_COMMANDS.map(centerCommandRoute)).toEqual(['overview', 'features', 'profiles', 'help']);
    for (const [index, command] of CENTER_COMMANDS.entries()) expect(shortcutCommand(bindings, { ...stroke, key: 'CFPH'[index], code: `Key${'CFPH'[index]}` })).toBe(command);
    expect(shortcutCommand(bindings, stroke)).toBe('open-features'); expect(shortcutCommand(bindings, { ...stroke, key: 'z', code: 'KeyZ' })).toBeNull();
});
it.each([{ trusted: false }, { prevented: true }, { repeat: true }, { composing: true }, { altGraph: true },
    { alt: false }, { shift: false }, { control: true }, { meta: true }])('a protected native stroke %j cannot invoke a command', patch => {
    expect(shortcutCommand(bindings, { ...stroke, ...patch })).toBeNull();
});
it.each(['Dead', 'Process', 'Unidentified', '', 'f\n', 'F '])('unsupported delivered character %j stays inactive without inventing a supported key', key => {
    expect(shortcutCommand(bindings, { ...stroke, key })).toBeNull();
});
it('an unassigned chord is inactive and an invalid native assignment collection cannot select even a valid-looking member', () => {
    expect(shortcutCommand([], stroke)).toBeNull();
    expect(shortcutCommand([...bindings, bindings[0]], stroke)).toBeNull();
});
it('modified symbols and other printed layouts retain the explicitly configured physical position', () => {
    expect(shortcutCommand(bindings, { ...stroke, key: '' })).toBe('open-features');
    expect(shortcutCommand([{ command: 'open-help', binding: 'Alt+Shift+Q' }], { ...stroke, code: 'KeyQ', key: 'A' })).toBe('open-help');
    for (const code of ['', 'Key1', 'Digit1', 'KeyFF', 'KeyF\n']) expect(shortcutCommand(bindings, { ...stroke, code })).toBeNull();
});
it.each([null, {}, [null], [{ command: 'open-help', binding: 'Ctrl+Shift+H' }],
    [{ command: 'run-shell', binding: 'Alt+Shift+H' }], [{ command: 'open-help', binding: 'Alt+Shift+H', url: 'https://evil.invalid' }],
    [{ command: 'open-help', binding: 'Alt+Shift+H' }, { command: 'open-help', binding: 'Alt+Shift+F' }],
    [{ command: 'open-help', binding: 'Alt+Shift+H' }, { command: 'open-features', binding: 'Alt+Shift+H' }]])('invalid closed assignment collection %j is rejected', value => {
    expect(validCenterBindings(value)).toBe(false);
});
it('sparse and extra-property assignment arrays cannot hide an unknown or missing entry', () => {
    expect(validCenterBindings(new Array(2))).toBe(false);
    const extra = Object.assign([...bindings], { private: 'not-persisted' }); expect(validCenterBindings(extra)).toBe(false);
    expect(validCenterBindings(bindings)).toBe(true); expect(validCenterBindings([])).toBe(true);
});
it('the shortcut change is one complete plan that preserves profiles, favorites, permission opt-ins and the original revision', () => {
    const before = { ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } }, center: { ...DEFAULT_SETTINGS.center, favorites: ['BEX-NAV-01'] } };
    const plan = planSettingsChange(before, { type: 'shortcuts', enabled: true, bindings });
    expect(plan.state).toBe('ready'); if (plan.state !== 'ready') throw new Error('fixture');
    expect(plan.action).toBe('shortcuts'); expect(plan.settings.shortcuts).toBe(true); expect(plan.settings.center.bindings).toEqual(bindings);
    expect(plan.settings.revision).toBe(before.revision); expect(plan.settings.repositories).toEqual(before.repositories);
    expect(plan.settings.center.favorites).toEqual(['BEX-NAV-01']); expect(before.center.bindings).toEqual([]);
    expect(Object.isFrozen(plan.settings.center.bindings)).toBe(true);
});
it.each([{ enabled: 'yes', bindings }, { enabled: true, bindings: [...bindings, bindings[0]] },
    { enabled: true, bindings, url: 'https://evil.invalid' }, { enabled: true }])('an invalid shortcut intent %j never produces a partial plan', values => {
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'shortcuts', ...values }).state).toBe('invalid');
});
it('resetting assignments retains the global switch and unrelated favorites and a no-op does not fabricate a change', () => {
    const before = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, bindings, favorites: ['BEX-CENTER-01'] } };
    const result = planSettingsChange(before, { type: 'shortcuts', enabled: before.shortcuts, bindings: [] });
    expect(result).toMatchObject({ state: 'ready', settings: { shortcuts: before.shortcuts, center: { bindings: [], favorites: ['BEX-CENTER-01'] } } });
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'shortcuts', enabled: DEFAULT_SETTINGS.shortcuts, bindings: [] }).state).toBe('unchanged');
});
it('content receives only bounded bindings with the resolved shortcut gate and cannot accept a broadened command or collection', () => {
    const settings = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, bindings } };
    const configuration = runtimeConfiguration(settings, CONFIG, null, 0);
    const response = { ...configuration, sourceTree: 'unbundled' };
    expect(decodeRuntimeConfiguration(response, CONFIG, 'unbundled')?.settings.bindings).toEqual(bindings);
    expect(configuration.settings).not.toHaveProperty('center'); expect(configuration.settings).not.toHaveProperty('favorites');
    expect(decodeRuntimeConfiguration({ ...response, settings: { ...response.settings, bindings: [{ command: 'shell', binding: 'Alt+Shift+H' }] } }, CONFIG, 'unbundled')).toBeNull();
});
