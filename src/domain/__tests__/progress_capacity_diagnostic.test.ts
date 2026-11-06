import { PROGRESS_CAPACITY_DIMENSIONS, normalizeProgressCapacityContext, normalizeProgressCapacityDiagnostic, progressCapacityDiagnostic } from '../progress_capacity_diagnostic';

const capacity = () => progressCapacityDiagnostic({ phase: 'source', dimension: 'source-unit-bytes', observedCount: 256_001, supportedLimit: 256_000 });
const context = () => ({ kind: 'comparison', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), manifestDigest: 'c'.repeat(64), sourceLineId: 'none',
    requiredPathsDigest: 'd'.repeat(64), reviewedPathsDigest: 'e'.repeat(64), uncoveredPathsDigest: 'f'.repeat(64),
    requiredPathCount: 2, reviewedPathCount: 0, uncoveredPathCount: 2, paths: ['src/a.ts', 'src/b.ts'] });

it.each(Object.entries(PROGRESS_CAPACITY_DIMENSIONS))('admits the closed %s boundary with its declared unit/phase', (dimension, rule) => {
    const bound = rule.bounds[0];
    const result = normalizeProgressCapacityDiagnostic({ phase: rule.phases[0], dimension, unit: rule.unit, bound,
        observedCount: bound === 'unavailable' ? 'unavailable' : bound === 'minimum' ? 0 : 2,
        supportedLimit: bound === 'unavailable' ? 'unavailable' : 1,
        countKind: bound === 'unavailable' ? 'unavailable' : 'exact', context: { kind: 'unavailable' } });
    expect(result.dimension).toBe(dimension); expect(result.unit).toBe(rule.unit);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.context)).toBe(true);
});

it.each([
    ['phase', 'PRIVATE_PHASE'], ['dimension', 'PRIVATE_DIMENSION'], ['dimension', 'toString'], ['unit', 'characters'],
    ['bound', 'minimum'], ['countKind', 'guessed'], ['countKind', 'unavailable'], ['observedCount', 'unavailable'],
    ['observedCount', 256_000], ['observedCount', 0], ['supportedLimit', 256_001], ['extra', 'PRIVATE_EXTRA'],
])('rejects a mismatched or contradictory %s %#', (key, value) => {
    expect(() => normalizeProgressCapacityDiagnostic({ ...capacity(), [key]: value })).toThrow('Invalid closed progress capacity diagnostic.');
});
it.each([null, [], 'PRIVATE_INPUT'])('rejects a nonrecord diagnostic %#', value => {
    expect(() => normalizeProgressCapacityDiagnostic(value)).toThrow(TypeError);
});
it.each(['observedCount', 'supportedLimit'])('rejects noncount values at %s', key => {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, 'PRIVATE_VALUE']) {
        expect(() => normalizeProgressCapacityDiagnostic({ ...capacity(), [key]: value })).toThrow(TypeError);
    }
});
it('preserves known zero, lower bounds and an unavailable count as distinct facts', () => {
    const empty = progressCapacityDiagnostic({ phase: 'scope', dimension: 'source-line-count', observedCount: 0, supportedLimit: 1, bound: 'minimum' });
    const lower = progressCapacityDiagnostic({ phase: 'source', dimension: 'source-part-count', observedCount: 17, supportedLimit: 16, countKind: 'at-least' });
    const unread = progressCapacityDiagnostic({ phase: 'source', dimension: 'source-unit-bytes', observedCount: 'unavailable', supportedLimit: 256_000, countKind: 'unavailable' });
    expect(empty.observedCount).toBe(0); expect(lower.countKind).toBe('at-least'); expect(unread.observedCount).toBe('unavailable');
    expect(unread.supportedLimit).toBe(256_000);
});
it('rejects an unproven minimum and invented counts for an invalid allocation', () => {
    expect(() => progressCapacityDiagnostic({ phase: 'scope', dimension: 'source-line-count', observedCount: 0, supportedLimit: 1, bound: 'minimum', countKind: 'at-least' })).toThrow(TypeError);
    expect(() => progressCapacityDiagnostic({ phase: 'scope', dimension: 'source-line-count', observedCount: 1, supportedLimit: 1, bound: 'minimum' })).toThrow(TypeError);
    expect(() => progressCapacityDiagnostic({ phase: 'aggregate', dimension: 'invalid-allocation', observedCount: 'unavailable', supportedLimit: 0, bound: 'unavailable', countKind: 'unavailable' })).toThrow(TypeError);
});
it('keeps unknown limits explicit without inventing a supported capacity', () => {
    expect(progressCapacityDiagnostic({ phase: 'aggregate', dimension: 'invalid-allocation', observedCount: 'unavailable', supportedLimit: 'unavailable', bound: 'unavailable', countKind: 'unavailable' }))
        .toMatchObject({ observedCount: 'unavailable', supportedLimit: 'unavailable' });
});
it.each([null, [], {}, { kind: 'unavailable', private: 'PRIVATE_CONTEXT' }, { kind: 'foreign' },
    { kind: 'source-line', sourceLineId: 'PRIVATE_SOURCE' }, { kind: 'source-line', sourceLineId: 'L1', private: 'PRIVATE_CONTEXT' }])('rejects an unknown or unsafe context %#', value => {
    expect(() => normalizeProgressCapacityContext(value)).toThrow(TypeError);
});
it('retains the original source anchor only for the source guard that owns it', () => {
    const value = progressCapacityDiagnostic({ phase: 'scope', dimension: 'source-line-points', observedCount: 1_201, supportedLimit: 1_200,
        context: { kind: 'source-line', sourceLineId: 'L42' } });
    expect(value.context).toEqual({ kind: 'source-line', sourceLineId: 'L42' });
    expect(() => normalizeProgressCapacityDiagnostic({ ...capacity(), context: value.context })).toThrow(TypeError);
});
it.each([
    ['baseSha', 'moving-ref'], ['headSha', 'b'.repeat(40) + '\n'], ['manifestDigest', 'PRIVATE_DIGEST'],
    ['requiredPathsDigest', 'd'.repeat(63)], ['requiredPathCount', -1], ['reviewedPathCount', 3],
    ['reviewedPathsDigest', 'untrusted'], ['uncoveredPathsDigest', 'f'.repeat(64) + '\n'],
    ['sourceLineId', 'PRIVATE_LINE'],
    ['reviewedPathCount', 1], ['uncoveredPathCount', 1], ['paths', []], ['paths', ['../outside']],
    ['paths', ['src/a.ts', 'src/a.ts']], ['paths', Array(9).fill('src/a.ts')], ['paths', 'PRIVATE_PATHS'],
    ['extra', 'PRIVATE_SOURCE'],
])('rejects unverifiable or inconsistent comparison %s %#', (key, value) => {
    expect(() => normalizeProgressCapacityContext({ ...context(), [key]: value })).toThrow(TypeError);
});
it('copies and freezes source coverage rather than retaining mutable caller state', () => {
    const original = context(), normalized = normalizeProgressCapacityContext(original);
    original.paths.push('PRIVATE_LATE_PATH'); original.reviewedPathCount = 2;
    expect(normalized).toMatchObject({ requiredPathCount: 2, reviewedPathCount: 0, uncoveredPathCount: 2, paths: ['src/a.ts', 'src/b.ts'] });
    expect(Object.isFrozen(normalized)).toBe(true);
    if (normalized.kind !== 'comparison') throw new Error('Expected comparison coverage.');
    expect(Object.isFrozen(normalized.paths)).toBe(true);
});
it('distinguishes a verified empty comparison, completed receipts and legacy absence of a manifest digest', () => {
    expect(normalizeProgressCapacityContext({ ...context(), requiredPathCount: 0, uncoveredPathCount: 0, paths: [], manifestDigest: 'none' }))
        .toMatchObject({ requiredPathCount: 0, reviewedPathCount: 0, uncoveredPathCount: 0, paths: [] });
    expect(normalizeProgressCapacityContext({ ...context(), reviewedPathCount: 2, uncoveredPathCount: 0, paths: [] }))
        .toMatchObject({ reviewedPathCount: 2, uncoveredPathCount: 0 });
});
it('rejects oversized serialized path excerpts even when every individual path is bounded', () => {
    const paths = Array.from({ length: 8 }, (_, i) => `${i}${'x'.repeat(1_023)}`);
    expect(() => normalizeProgressCapacityContext({ ...context(), requiredPathCount: 8, uncoveredPathCount: 8, paths })).toThrow(TypeError);
});
it('rejects missing and extra factory fields instead of silently dropping them', () => {
    for (const value of [null, {}, { phase: 'source', dimension: 'source-unit-bytes', observedCount: 2, supportedLimit: 1, private: 'PRIVATE_EXTRA' }]) {
        expect(() => progressCapacityDiagnostic(value as never)).toThrow(TypeError);
    }
});
