import { inventoryFixture } from './support/immutable_progress_inventory_fixture';

it('reports a real 65-part complete-patch rejection with every required path, without object reads', async () => {
    const after = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`source/${i}.ts`, 'x'.repeat(130_000)]));
    const source = inventoryFixture({}, after);
    source.data.files.forEach(file => { file.patch = '@@ -0,0 +1 @@\n+' + after[file.filename]; });
    await expect(source.read()).rejects.toMatchObject({ code: 'validation.evidence-too-large', recovery: {
        id: 'progress-evidence-capacity-exceeded', variables: expect.objectContaining({ phase: 'source', dimension: 'source-part-count', observedCount: 65, supportedLimit: 64, countKind: 'at-least',
            context: expect.objectContaining({ requiredPathCount: 65, reviewedPathCount: 0, uncoveredPathCount: 65 }) }),
    } });
    expect(source.getCommit).not.toHaveBeenCalled(); expect(source.getBlob).not.toHaveBeenCalled(); expect(source.compareCommits).toHaveBeenCalledTimes(1);
});
it('reports the exact manifest capacity after proving all 1024 immutable generated-metadata paths', async () => {
    const prefix = 'build/' + ['a', 'b', 'c', 'd'].map(point => point.repeat(190)).join('/') + '/';
    const after = Object.fromEntries(Array.from({ length: 1_024 }, (_, i) => [prefix + `${String(i).padStart(4, '0')}-${'x'.repeat(180)}.js`, 'generated']));
    const source = inventoryFixture({}, after);
    await expect(source.read()).rejects.toMatchObject({ code: 'validation.evidence-too-large', recovery: {
        id: 'progress-evidence-capacity-exceeded', variables: expect.objectContaining({ phase: 'source', dimension: 'source-manifest-bytes', supportedLimit: 256_000, countKind: 'exact',
            observedCount: expect.any(Number), context: expect.objectContaining({ requiredPathCount: 1_024, reviewedPathCount: 0, uncoveredPathCount: 1_024 }) }),
    } });
    expect(source.getCommit).toHaveBeenCalled(); expect(source.getBlob).not.toHaveBeenCalled(); expect(source.compareCommits).toHaveBeenCalledTimes(2);
});
