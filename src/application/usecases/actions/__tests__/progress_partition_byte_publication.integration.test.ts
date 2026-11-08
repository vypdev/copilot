import { completeInventoryScenario } from './fixtures/complete_inventory_workflow_fixture';
import { largeCompleteProgressFixture } from '../../../../data/repository/__tests__/support/large_complete_progress_fixture';
import { interpretProgressAgentOutput } from '../../../../data/repository/progress_agent_response_policy';
import * as logging from '../../../ports/logging_ports';

function scenario(mode: 'recover' | 'stale' | 'exhaust' | 'uncertain') {
    const f = completeInventoryScenario(largeCompleteProgressFixture()), accepted = new Map<string, Record<string, any>>(), calls = new Map<string, number>();
    let blobReads = 0;
    if (mode === 'uncertain') f.state.issue = 'PRIVATE_SCOPE requires clarified source ownership.';
    f.query.mockImplementation(async request => {
        if (request.options?.schemaName === 'progress_scope') {
            const response = await f.answer(request);
            if (mode === 'uncertain') (response.lines as any[])[0].kind = 'uncertain';
            return response;
        }
        if (request.options?.schemaName !== 'progress_partition_facts') return f.answer(request);
        const properties = (request.options.schema as any).properties, id = properties.partitionId.enum[0];
        let original = accepted.get(id);
        if (!original) {
            original = await f.answer(request); accepted.set(id, structuredClone(original));
            if (accepted.size === 1) blobReads = f.source.getBlob.mock.calls.length;
        }
        const response = structuredClone(original), diff = f.diff();
        if (diff?.kind !== 'partitioned') throw Error('Expected full immutable comparison.');
        const ids = properties.files.items.properties.unitId.enum as string[];
        const current = diff.partitions.find(part => part.units?.length === ids.length && part.units.every((unit, i) => unit.id === ids[i]))!;
        const selected = mode === 'uncertain' ? diff.partitions[0] : diff.partitions.at(-1)!;
        const count = (calls.get(id) ?? 0) + 1; calls.set(id, count);
        if (current === selected) {
            if (count === 1 || mode === 'exhaust' || mode === 'uncertain') {
                const limit = properties.files.items.properties.remaining.maxLength;
                expect(limit).toBeLessThan(600); // In this workload the JSON-byte quota is the native point maximum.
                response.files[0].remaining = '\u0000'.repeat(Math.floor(limit / 6) + 1);
            } else if (mode === 'stale') f.state.head = 'c'.repeat(40);
        }
        return interpretProgressAgentOutput(JSON.stringify(response), 'partition', request.options.schema!);
    });
    return { ...f, calls, blobReads: () => blobReads };
}

it('progress-partition-size-C19: a late byte repair preserves every original unit and publishes one complete same-head assessment without recollection', async () => {
    const f = scenario('recover');
    expect((await f.invoke())[0]).toMatchObject({ success: true, payload: { progress: 100 } });
    const diff = f.diff(); if (diff?.kind !== 'partitioned') throw Error('Expected full comparison.');
    expect(diff.protocol).toMatchObject({ version: 'immutable-tree-v1', unitCount: 952 }); expect(diff.protocol!.requiredPaths).toHaveLength(887);
    expect(f.parts()).toBe(diff.partitions.length); expect([...f.calls.values()].filter(count => count === 2)).toHaveLength(1);
    expect(f.query).toHaveBeenCalledTimes(diff.partitions.length + 3); expect(f.source.getBlob).toHaveBeenCalledTimes(f.blobReads());
    expect(f.getDiff).toHaveBeenCalledTimes(1); expect(f.setProgressLabel).toHaveBeenCalledTimes(1); expect(f.setLabels).not.toHaveBeenCalled();
}, 60_000);

it('progress-partition-size-C20: moving the source during byte repair still prevents all progress publication', async () => {
    const f = scenario('stale'); expect((await f.invoke())[0]).toMatchObject({ executed: false });
    expect([...f.calls.values()].filter(count => count === 2)).toHaveLength(1);
    expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
}, 60_000);

it('progress-partition-size-C21: late byte exhaustion discards provisional receipts and enters neither final assessment nor publication', async () => {
    const f = scenario('exhaust'), result = (await f.invoke())[0], diff = f.diff();
    if (diff?.kind !== 'partitioned') throw Error('Expected full comparison.');
    expect(result).toMatchObject({ success: false, errors: [{ retryable: false, recovery: { id: 'progress-partition-bytes-invalid' } }] });
    expect(f.parts()).toBe(diff.partitions.length); expect(f.query).toHaveBeenCalledTimes(diff.partitions.length + 2);
    expect(f.query.mock.calls.filter(([r]) => Boolean((r.options?.schema as any)?.properties.requirements))).toHaveLength(0);
    expect(f.source.getBlob).toHaveBeenCalledTimes(f.blobReads()); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
}, 60_000);

it('progress-partition-size-C22: an early failure retains bounded admitted identities and uncertainty for audit without logging source prose', async () => {
    const log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
    try {
        const f = scenario('uncertain'); expect((await f.invoke())[0].success).toBe(false);
        const lines = log.mock.calls.map(([line]) => line);
        expect(lines).toContainEqual(expect.stringMatching(/^Admitted acceptance identities for manifest [a-f0-9]{64} \(question mark means uncertain\): R1\?\.$/u));
        expect(lines.join('\n')).not.toContain('PRIVATE_SCOPE'); expect(f.setProgressLabel).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
}, 60_000);
