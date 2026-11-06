import { createHash } from 'node:crypto';
import { ProgressCapacityFailure } from '../../errors/progress_capacity_failure';
import { ApplicationError } from '../../errors/application_error';
import { progressComparisonCapacityContext, withProgressCapacityContext } from '../progress_capacity_context_policy';
import { progressCapacityDiffContext } from '../progress_capacity_source_context_policy';
import { partitionProgressDiff } from '../progress_diff_partition_policy';
import type { ProgressDiffEvidence } from '../../ports/progress_diff_query_ports';

const baseSha = 'a'.repeat(40), headSha = 'b'.repeat(40);
const requiredPaths = ['src/b.ts', 'src/a.ts', 'src/c.ts'];
const input = () => ({ baseSha, headSha, requiredPaths });
const digest = (paths: readonly string[]) => createHash('sha256').update(JSON.stringify(paths)).digest('hex');
const failure = () => new ProgressCapacityFailure({ phase: 'source', dimension: 'source-unit-bytes', observedCount: 3, supportedLimit: 2 }, '11111111-1111-4111-8111-111111111111');
function caught(operation: () => unknown): unknown { try { operation(); } catch (error) { return error; } throw new Error('Expected rejection'); }

it('identifies all three ordered inventories independently, including the accepted subset', () => {
    expect(progressComparisonCapacityContext({ ...input(), reviewedPaths: ['src/c.ts', 'src/b.ts'] })).toEqual({
        kind: 'comparison', baseSha, headSha, manifestDigest: 'none', sourceLineId: 'none',
        requiredPathsDigest: digest(requiredPaths), reviewedPathsDigest: digest(['src/b.ts', 'src/c.ts']),
        uncoveredPathsDigest: digest(['src/a.ts']), requiredPathCount: 3, reviewedPathCount: 2, uncoveredPathCount: 1, paths: ['src/a.ts'],
    });
});
it('distinguishes a verified empty inventory from unavailable attribution', () => {
    expect(progressComparisonCapacityContext({ baseSha, headSha, requiredPaths: [] })).toMatchObject({
        requiredPathsDigest: digest([]), reviewedPathsDigest: digest([]), uncoveredPathsDigest: digest([]), requiredPathCount: 0, paths: [],
    });
    expect(failure().diagnostic.context).toEqual({ kind: 'unavailable' });
});
it('bounds path excerpts without losing full inventory counts or digests', () => {
    const paths = Array.from({ length: 15 }, (_, i) => `src/${i}.ts`);
    expect(progressComparisonCapacityContext({ baseSha, headSha, requiredPaths: paths })).toMatchObject({
        requiredPathCount: 15, uncoveredPathCount: 15, uncoveredPathsDigest: digest(paths), paths: paths.slice(0, 8),
    });
});
it('bounds excerpts by serialized bytes when safe individual paths approach their limit', () => {
    const paths = Array.from({ length: 8 }, (_, i) => `${i}${'x'.repeat(1_023)}`);
    const result = progressComparisonCapacityContext({ baseSha, headSha, requiredPaths: paths });
    expect(result).toMatchObject({ requiredPathCount: 8, uncoveredPathCount: 8 });
    if (result.kind !== 'comparison') throw new Error('Missing comparison');
    expect(result.paths).toHaveLength(7); expect(Buffer.byteLength(JSON.stringify(result.paths))).toBeLessThanOrEqual(8_192);
});
it.each([
    { requiredPaths: null }, { requiredPaths: ['src/a.ts', 'src/a.ts'] }, { requiredPaths: ['../private'] },
    { reviewedPaths: null }, { reviewedPaths: ['src/a.ts', 'src/a.ts'] }, { reviewedPaths: ['unassigned.ts'] },
    { baseSha: 'moving-base' }, { headSha: 'moving-head' }, { manifestDigest: 'private prose' },
])('rejects unproven path attribution %#', invalid => {
    expect(() => progressComparisonCapacityContext({ ...input(), ...invalid } as never)).toThrow(TypeError);
});
it('does not retain mutable attribution arrays', () => {
    const paths = ['src/a.ts']; const result = progressComparisonCapacityContext({ baseSha, headSha, requiredPaths: paths });
    paths[0] = 'private-late-path'; expect(result).toMatchObject({ paths: ['src/a.ts'] });
    expect(Object.isFrozen(result)).toBe(true);
});
it('annotates a host planning failure without changing code, correlation or count precision', () => {
    const original = failure();
    const result = caught(() => withProgressCapacityContext(() => { throw original; }, () => progressComparisonCapacityContext(input())));
    expect(result).toBeInstanceOf(ProgressCapacityFailure);
    expect(result).toMatchObject({ code: original.code, correlationId: original.correlationId, diagnostic: {
        observedCount: 3, supportedLimit: 2, countKind: 'exact', context: { requiredPathCount: 3, reviewedPathCount: 0 },
    } });
});
it('preserves both an original physical line and comparison coverage', () => {
    const original = new ProgressCapacityFailure({ phase: 'scope', dimension: 'source-line-points', observedCount: 1_201, supportedLimit: 1_200,
        context: { kind: 'source-line', sourceLineId: 'L42' } });
    const result = caught(() => withProgressCapacityContext(() => { throw original; }, () => progressComparisonCapacityContext(input())));
    expect(result).toMatchObject({ diagnostic: { context: { kind: 'comparison', sourceLineId: 'L42', uncoveredPathCount: 3 } } });
    expect(original.withContext({ kind: 'source-line', sourceLineId: 'L1' })).toBe(original);
});
it('never replaces an existing complete comparison or evaluates a second attribution source', () => {
    const original = failure().withContext(progressComparisonCapacityContext(input())); const context = jest.fn();
    expect(caught(() => withProgressCapacityContext(() => { throw original; }, context))).toBe(original);
    expect(context).not.toHaveBeenCalled(); expect(original.withContext({ kind: 'unavailable' })).toBe(original);
});
it('retains the original error when attribution itself fails closed', () => {
    const original = failure();
    expect(caught(() => withProgressCapacityContext(() => { throw original; }, () => { throw new Error('unreadable source'); }))).toBe(original);
    expect(original.withContext({ kind: 'unavailable' })).toBe(original);
});
it.each([new ApplicationError('provider.unavailable', 'Provider unavailable'), new Error('transport'), { code: 'validation.evidence-too-large' }])('does not reclassify unrelated or lookalike failures %#', original => {
    const context = jest.fn(); expect(caught(() => withProgressCapacityContext(() => { throw original; }, context))).toBe(original);
    expect(context).not.toHaveBeenCalled();
});
it('does not evaluate attribution or change a successful planning result', () => {
    const context = jest.fn(); const value = Object.freeze({ complete: true });
    expect(withProgressCapacityContext(() => value, context)).toBe(value); expect(context).not.toHaveBeenCalled();
});
it.each([1, 2])('attributes complete legacy comparisons with %i path(s) and all-or-none accepted receipts', count => {
    const diff = partitionProgressDiff(baseSha, headSha, requiredPaths.slice(0, count).map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(count === 1 ? 1 : 150_000) })));
    expect(progressCapacityDiffContext(diff)).toMatchObject({ requiredPathCount: count, reviewedPathCount: 0, uncoveredPathCount: count });
    expect(progressCapacityDiffContext(diff, true)).toMatchObject(diff.kind === 'partitioned'
        ? { requiredPathCount: count, reviewedPathCount: count, uncoveredPathCount: 0, paths: [] }
        : { requiredPathCount: count, reviewedPathCount: 0, uncoveredPathCount: count, paths: ['src/b.ts'] });
});
it.each(['wrong head', 'invalid json', 'wrong kind', 'unsafe path', 'foreign unit', 'oversize', 'wrong assignment', 'empty parts', 'too many parts'])('refuses unverifiable legacy source context: %s', scenario => {
    const diff = partitionProgressDiff(baseSha, headSha, requiredPaths.slice(0, 2).map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(150_000) })));
    if (diff.kind !== 'partitioned') throw new Error('Expected multipart source');
    const edited = JSON.parse(JSON.stringify(diff)) as typeof diff;
    const source = JSON.parse(edited.partitions[0].evidence);
    if (scenario === 'wrong head') source.headSha = 'c'.repeat(40);
    if (scenario === 'wrong kind') source.kind = 'provider-text';
    if (scenario === 'unsafe path') source.changes[0].path = '../outside';
    if (scenario === 'foreign unit') source.changes[0].unitId = 'invented';
    const part = { ...edited.partitions[0], evidence: scenario === 'invalid json' ? '{' : scenario === 'oversize' ? 'x'.repeat(256_001) : JSON.stringify(source),
        ...(scenario === 'wrong assignment' ? { paths: ['unassigned.ts'] } : {}) };
    const partitions = scenario === 'empty parts' ? [] : scenario === 'too many parts' ? Array(65).fill(part) : [part, edited.partitions[1]];
    expect(() => progressCapacityDiffContext({ ...edited, partitions } as ProgressDiffEvidence)).toThrow();
});
