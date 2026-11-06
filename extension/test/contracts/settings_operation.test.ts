import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { sameSettingsContent, settingsOperationId, settingsSnapshot } from '../../src/domain/settings_operation.ts';

it('operation identities are fixed opaque 128-bit hex IDs, never paths, commands or caller URLs', () => {
    expect(settingsOperationId('a'.repeat(32))).toBe(true);
    for (const value of [null, 1, '', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), 'g'.repeat(32), `${'a'.repeat(32)}\n`]) {
        expect(settingsOperationId(value)).toBe(false);
    }
});
it('settings content comparison ignores object key order but preserves authored array order and exact values', () => {
    const first = { ...DEFAULT_SETTINGS, features: { 'BEX-NAV-02': true, 'BEX-NAV-01': false },
        center: { ...DEFAULT_SETTINGS.center, favorites: ['BEX-NAV-01', 'BEX-NAV-02'] } };
    const reordered = Object.fromEntries(Object.entries(first).reverse());
    reordered.features = { 'BEX-NAV-01': false, 'BEX-NAV-02': true };
    expect(sameSettingsContent(first, reordered)).toBe(true);
    expect(sameSettingsContent(first, { ...first, center: { ...first.center, favorites: [...first.center.favorites].reverse() } })).toBe(false);
    expect(sameSettingsContent(first, { ...first, revision: 1 })).toBe(false);
    expect(sameSettingsContent(first, { ...first, features: { 'BEX-NAV-01': false, 'BEX-NAV-02': false } })).toBe(false);
});
it('invalid or future content never establishes equality or triggers unsafe serialization', () => {
    const cyclic: Record<string, unknown> = {}; cyclic.repositories = cyclic;
    for (const value of [null, [], cyclic, { ...DEFAULT_SETTINGS, schemaVersion: 9 }]) {
        expect(sameSettingsContent(value, DEFAULT_SETTINGS)).toBe(false);
        expect(sameSettingsContent(DEFAULT_SETTINGS, value)).toBe(false);
    }
});
it('settings admission snapshots validate copied content and reject throwing or changing serialization safely', () => {
    const input = structuredClone(DEFAULT_SETTINGS); const copied = settingsSnapshot(input)!;
    expect(copied).toEqual(input); expect(copied).not.toBe(input); expect(Object.isFrozen(copied.center)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false); expect(settingsSnapshot({})).toBeNull();
    const throws = structuredClone(DEFAULT_SETTINGS);
    Object.defineProperty(throws, 'center', { enumerable: true, get: () => { throw new Error('synthetic_secret'); } });
    expect(settingsSnapshot(throws)).toBeNull();
    const unreadable = structuredClone(DEFAULT_SETTINGS);
    Object.defineProperty(unreadable, 'revision', { enumerable: true, get: () => { throw new Error('synthetic_secret'); } });
    expect(settingsSnapshot(unreadable)).toBeNull();
    const changing = structuredClone(DEFAULT_SETTINGS); let reads = 0;
    Object.defineProperty(changing, 'locale', { enumerable: true, get: () => ++reads <= 2 ? 'en' : 'unsupported' });
    expect(settingsSnapshot(changing)).toBeNull();
});
