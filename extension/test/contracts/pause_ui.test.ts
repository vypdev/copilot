import { expect, it } from 'vitest';
import { pauseTabRows, filterPauseTabs } from '../../src/domain/pause_ui.ts';
import { pauseTargetInvalidation } from '../../src/domain/pause_invalidation.ts';
import { pauseCopy } from '../../src/domain/pause_copy.ts';
import { pauseControlWire } from '../fixtures/pause_wire.ts';

it.each(['future', 'corrupt', 'unavailable'] as const)('unreadable %s native state never creates unpaused tab rows', state => {
    expect(pauseTabRows({ ...pauseControlWire(), loaded: { state } })).toEqual([]);
});
it('native candidates and saved missing scopes merge without losing restrictions or claiming missing tabs are available', () => {
    const value = pauseControlWire(); if (value.loaded.state !== 'ready') throw new Error('fixture');
    const rows = pauseTabRows({ ...value, loaded: { state: 'ready', value: { ...value.loaded.value, tabs: [9, 7] } } });
    expect(rows).toEqual([{ tabId: 7, label: 'octo/example · #42', paused: true, available: true }, { tabId: 9, label: null, paused: true, available: false }]);
    expect(Object.isFrozen(rows[0])).toBe(true); expect(Object.isFrozen(value)).toBe(false);
});
it.each(['unavailable', 'stale'] as const)('%s tab inventory still discloses existing paused scopes without reconstructing their labels', state => {
    const value = pauseControlWire(); if (value.loaded.state !== 'ready') throw new Error('fixture');
    expect(pauseTabRows({ ...value, loaded: { state: 'ready', value: { ...value.loaded.value, tabs: [8] } }, targets: { state } })).toEqual([{ tabId: 8, label: null, paused: true, available: false }]);
});
it('the hard row bound includes 128 current candidates and 128 distinct preserved paused scopes', () => {
    const value = pauseControlWire(); if (value.loaded.state !== 'ready') throw new Error('fixture');
    const rows = pauseTabRows({ ...value, loaded: { state: 'ready', value: { ...value.loaded.value, tabs: Array.from({ length: 128 }, (_, id) => id + 128) } }, targets: { state: 'ready', limited: true, tabs: Array.from({ length: 128 }, (_, tabId) => ({ tabId, label: null })) } });
    expect(rows).toHaveLength(256); expect(rows.at(-1)).toEqual({ tabId: 255, label: null, paused: true, available: false });
});
it('local search is bounded, case insensitive and can match generic native IDs without mutating rows', () => {
    const rows = [{ tabId: 7, label: 'Octo/Example', paused: false, available: true }, { tabId: 9, label: null, paused: true, available: false }];
    expect(filterPauseTabs(rows, '  OCTO  ')).toEqual([rows[0]]); expect(filterPauseTabs(rows, '9')).toEqual([rows[1]]); expect(filterPauseTabs(rows, '')).toEqual(rows);
    expect(filterPauseTabs(rows, 'x'.repeat(120) + '9')).toEqual([]); expect(rows).toHaveLength(2);
});
it.each([false, true])('a native retirement flag %s produces only detached bounded target metadata', retired => {
    const input = { version: 1, method: 'center.pauses.targets.changed', tabId: 0, retired }; const output = pauseTargetInvalidation(input);
    expect(output).toEqual({ tabId: 0, retired }); expect(Object.isFrozen(output)).toBe(true); expect(Object.isFrozen(input)).toBe(false);
});
it.each([null, [], {}, { version: 2 }, { version: 1, method: 'foreign', tabId: 7, retired: true },
    { version: 1, method: 'center.pauses.targets.changed', tabId: -1, retired: true }, { version: 1, method: 'center.pauses.targets.changed', tabId: 7, retired: 1 },
    { version: 1, method: 'center.pauses.targets.changed', tabId: 7, retired: true, url: 'https://github.com/private' }])('rejects unknown, malformed or private invalidation payload %j', input => { expect(pauseTargetInvalidation(input)).toBeNull(); });
it('unknown locale falls back to the reviewed English copy without dropping any interface concern', () => {
    expect(pauseCopy('unrecognized')).toEqual(pauseCopy('en')); expect(Object.keys(pauseCopy('es').issues)).toEqual(Object.keys(pauseCopy('en').issues));
});
