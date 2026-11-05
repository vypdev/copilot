import { progressCapacityDiffContext } from '../progress_capacity_source_context_policy';
import { bound, framed, plan, clone } from './fixtures/framed_progress_fixture';
import { largeCompleteProgressFixture } from '../../../data/repository/__tests__/support/large_complete_progress_fixture';

it('attributes unbound framed source without inventing request receipts', () => {
    const source = framed(); expect(progressCapacityDiffContext(source)).toMatchObject({ manifestDigest: source.protocol!.manifestDigest,
        requiredPathCount: 2, reviewedPathCount: 0, uncoveredPathCount: 2, paths: ['specs/a.md', 'specs/b.md'] });
});
it('attributes bound framed source after every exact receipt is accepted', () => {
    const source = bound(); expect(progressCapacityDiffContext(source, true)).toMatchObject({ manifestDigest: source.protocol!.manifestDigest,
        requiredPathCount: 2, reviewedPathCount: 2, uncoveredPathCount: 0, paths: [] });
});
it('preserves legacy recovered-unit attribution without inventing a framed manifest', () => {
    expect(progressCapacityDiffContext(plan())).toMatchObject({ manifestDigest: 'none', requiredPathCount: 2, reviewedPathCount: 0 });
});
it('rejects a changed unit assignment before claiming source coverage', () => {
    const source = clone(plan()); const partitions = [{ ...source.partitions[0], units: [{ id: 'foreign', path: 'specs/a.md' }] }, ...source.partitions.slice(1)];
    expect(() => progressCapacityDiffContext({ ...source, partitions })).toThrow();
});
it('retains protocol rejection for a corrupt framed source rather than attesting its advertised inventory', () => {
    const source = framed(); const changed = { ...source, evidence: source.evidence + ' ' };
    expect(() => progressCapacityDiffContext(changed)).toThrow('(source-manifest-digest)');
});
it('preserves complete immutable-tree attribution at the existing 887-path, 952-unit incident geometry', async () => {
    const source = largeCompleteProgressFixture(); const diff = await source.read();
    if (diff.kind !== 'partitioned') throw new Error('Expected complete immutable source');
    expect(diff.protocol).toMatchObject({ version: 'immutable-tree-v1', unitCount: 952 });
    expect(progressCapacityDiffContext(diff)).toMatchObject({ manifestDigest: diff.protocol!.manifestDigest, requiredPathCount: 887, reviewedPathCount: 0, uncoveredPathCount: 887 });
    expect(progressCapacityDiffContext(diff, true)).toMatchObject({ requiredPathCount: 887, reviewedPathCount: 887, uncoveredPathCount: 0, paths: [] });
});
