import { expect, it } from 'vitest';
import { decodeHelperSample } from '../../src/domain/helper_sample_view.ts';
import { helperSamplesFixture } from '../fixtures/helper_samples.ts';

const sample = () => { const f = helperSamplesFixture(); f.owner.attach(f.capture(), 1); return f.owner.read(1); };
it.each(['empty', 'unavailable'] as const)('the exact %s reply is valid without a synthetic ring', state => {
    expect(decodeHelperSample({ state })).toEqual({ state }); expect(decodeHelperSample({ state, health: { blocked: [], events: [] } })).toBeNull();
});
it('a complete sample is deeply detached and cannot retain mutable provider references', () => {
    const source = JSON.parse(JSON.stringify(sample())); const decoded = decodeHelperSample(source)!; source.health.events.splice(0); source.retention.splice(0);
    expect(decoded.state).toBe('sample'); if (decoded.state !== 'sample') throw new Error('missing sample'); expect(decoded.health.events).toHaveLength(3); expect(Object.isFrozen(decoded.health.events[0])).toBe(true);
});
it.each([null, [], 'sample', { state: 'future' }, { state: 'sample' }])('unknown or incomplete reply %j is not empty healthy evidence', input => { expect(decodeHelperSample(input)).toBeNull(); });
it.each([
    ['private source', { sourceTree: 'private' }], ['wrong state', { state: 'ready' }], ['invalid capture time', { capturedAt: -1 }],
    ['untrusted ring', { health: { blocked: ['private'], events: [] } }], ['missing retention', { retention: undefined }],
    ['nonarray retention', { retention: {} }], ['more than two helper tickets', { retention: [{}, {}, {}] }], ['missing helper status', { retention: [] }],
    ['unregistered helper', { retention: [{ helper: 'private', retention: 'stored' }, { helper: 'center-shortcuts', retention: 'stored' }] }],
    ['unknown retention', { retention: [{ helper: 'runtime-health', retention: 'private' }, { helper: 'center-shortcuts', retention: 'stored' }] }],
    ['duplicate helper status', { retention: [{ helper: 'runtime-health', retention: 'stored' }, { helper: 'runtime-health', retention: 'stored' }] }],
    ['expanded ticket', { retention: [{ helper: 'runtime-health', retention: 'stored', ticket: 'private' }, { helper: 'center-shortcuts', retention: 'stored' }] }],
] as const)('rejects %s at the closed metadata boundary', (_label, patch) => { expect(decodeHelperSample({ ...sample(), ...patch })).toBeNull(); });
it('a source snapshot with no reasons needs no invented retention row, even if a helper was sampled held', () => {
    expect(decodeHelperSample({ state: 'sample', capturedAt: 0, health: { blocked: ['runtime-health'], events: [] }, retention: [] })).not.toBeNull();
});
it('reordered helper statuses cannot be attributed to another reason or callback', () => {
    const value = sample(); if (value.state !== 'sample') throw new Error('missing sample');
    expect(decodeHelperSample({ ...value, retention: [...value.retention].reverse() })).toBeNull();
});
it('throwing provider serialization cannot escape the metadata decoder', () => {
    expect(() => decodeHelperSample({ toJSON() { throw new Error('private'); } })).not.toThrow(); expect(decodeHelperSample({ toJSON() { throw new Error('private'); } })).toBeNull();
});
