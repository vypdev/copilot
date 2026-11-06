import { expect, it } from 'vitest';
import { CenterDeliveryWindow, centerFrameText } from '../../src/domain/center_delivery.ts';
import { CENTER_CHANNEL_CAPACITY } from '../../src/domain/center_channel.ts';

const A = 'a'.repeat(64); const B = 'b'.repeat(64);
it('delivery window rejects invalid correlations without recording an observation', () => {
    const window = new CenterDeliveryWindow();
    for (const value of [undefined, null, '1', 0, -1, 1.5, Infinity]) expect(window.observe(value, A)).toBe('invalid');
    expect(window.observe(1, A)).toBe('new'); expect(window.observe(1, A)).toBe('duplicate');
});
it('delivery window accepts only complete lowercase SHA-256 values, never serialized payloads', () => {
    const window = new CenterDeliveryWindow();
    for (const value of [null, {}, 'synthetic_secret', A.slice(1), A + '0', A + '\n', A.toUpperCase()]) expect(window.observe(1, value)).toBe('invalid');
    expect(window.observe(1, A)).toBe('new');
});
it('delivery window distinguishes an exact copy from a collision and preserves the first fingerprint', () => {
    const window = new CenterDeliveryWindow(); expect(window.observe(1, A)).toBe('new');
    expect(window.observe(1, A)).toBe('duplicate'); expect(window.observe(1, B)).toBe('conflict'); expect(window.observe(1, A)).toBe('duplicate');
});
it('separate correlations may describe equal payloads without being treated as a retransmission', () => {
    const window = new CenterDeliveryWindow(); expect(window.observe(1, A)).toBe('new'); expect(window.observe(2, A)).toBe('new');
});
it('delivery window keeps only sixteen accepted correlations and duplicate traffic cannot refresh eviction order', () => {
    const window = new CenterDeliveryWindow();
    for (let sequence = 1; sequence <= CENTER_CHANNEL_CAPACITY; sequence++) expect(window.observe(sequence, A)).toBe('new');
    expect(window.observe(1, A)).toBe('duplicate'); expect(window.observe(17, A)).toBe('new');
    expect(window.observe(1, A)).toBe('new'); // The caller must still enforce its monotonic/pending correlation rule.
});
it('retirement clears fingerprints so a new private native source cannot inherit old correlation facts', () => {
    const window = new CenterDeliveryWindow(); window.observe(1, A); window.clear(); window.clear(); expect(window.observe(1, B)).toBe('new');
});
it('delivery correlations preserve the safe-integer boundary without wrapping it', () => {
    const window = new CenterDeliveryWindow(); expect(window.observe(Number.MAX_SAFE_INTEGER, A)).toBe('new');
    expect(window.observe(Number.MAX_SAFE_INTEGER + 1, A)).toBe('invalid');
});
it('frame text orders nested object keys without changing scalar values or array order', () => {
    expect(centerFrameText({ z: [{ b: true, a: 'Revisión' }, null], a: 1 })).toBe('{"a":1,"z":[{"a":"Revisión","b":true},null]}');
    expect(centerFrameText({ a: 1, z: [{ a: 'Revisión', b: true }, null] })).toBe(centerFrameText({ z: [{ b: true, a: 'Revisión' }, null], a: 1 }));
});
it('frame text retains ordered authored lists rather than equating a reordered operation', () => {
    expect(centerFrameText({ list: ['a', 'b'] })).not.toBe(centerFrameText({ list: ['b', 'a'] }));
});
it('changed nested values remain different despite object-key normalization', () => {
    expect(centerFrameText({ sequence: 1, message: { value: false } })).not.toBe(centerFrameText({ message: { value: true }, sequence: 1 }));
});
it('frame text distinguishes JSON null from values that have no JSON representation', () => {
    expect(centerFrameText(null)).toBe('null'); expect(centerFrameText(undefined)).toBeNull(); expect(centerFrameText(() => 1)).toBeNull();
});
it('cyclic frames fail closed without inventing a placeholder fingerprint', () => {
    const cycle: { self?: unknown } = {}; cycle.self = cycle; expect(centerFrameText(cycle)).toBeNull();
});
it('failed serialization hooks cannot escape the frame-text boundary', () => {
    expect(centerFrameText({ toJSON: () => { throw new Error('private serialization error'); } })).toBeNull();
    expect(centerFrameText(new Proxy({}, { getPrototypeOf: () => { throw new Error('private proxy'); } }))).toBeNull();
});
it('frame text preserves caller ownership instead of sorting or freezing its records in place', () => {
    const value = { z: { y: 1, a: 2 }, a: [] }; const keys = Object.keys(value.z); centerFrameText(value);
    expect(Object.keys(value.z)).toEqual(keys); expect(Object.isFrozen(value)).toBe(false); expect(Object.isFrozen(value.z)).toBe(false);
});
