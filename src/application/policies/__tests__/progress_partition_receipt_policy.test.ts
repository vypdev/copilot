import { aggregateProgressReceipts, framedProgressFactBudget, framedProgressFactLimit, parseProgressPartitionReceipt } from '../progress_partition_receipt_policy';
import { MAX_PROGRESS_AGGREGATE_BYTES } from '../progress_partition_response_policy';
import { bound, framed, clone } from './fixtures/framed_progress_fixture';

function receipts(diff = bound()) {
    return diff.partitions.map(part => parseProgressPartitionReceipt({ outputLocale: 'en-US', partitionId: part.id,
        files: part.units!.map(unit => ({ unitId: unit.id, path: unit.path, implemented: 'Required source exists.', remaining: 'Execution unverified.' })) }, part, 'en-US', 600));
}
it('retains actual validated request IDs in immutable receipts and the complete aggregate', () => {
    const diff = bound(), values = receipts(diff), result = JSON.parse(aggregateProgressReceipts(diff, values, MAX_PROGRESS_AGGREGATE_BYTES));
    expect(values.map(value => value.requestId)).toEqual(diff.partitions.map(part => part.id));
    expect(values.every(Object.isFrozen)).toBe(true);
    expect(result.protocol).toEqual(diff.protocol); expect(result.analysis.files).toHaveLength(2);
    expect(result.sources.map((source: { requestId: string }) => source.requestId)).toEqual(values.map(value => value.requestId));
});
it('rejects another attempt before producing a receipt', () => {
    const part = bound().partitions[0];
    expect(() => parseProgressPartitionReceipt({ partitionId: 'old-attempt', outputLocale: 'en-US', files: [] }, part, 'en-US', 600)).toThrow();
});
it('requires a bound source before reserving aggregate space', () => {
    expect(() => framedProgressFactBudget(framed(), MAX_PROGRESS_AGGREGATE_BYTES)).toThrow('(source-manifest-identity)');
});
it('subtracts all receipt metadata before calculating the worst-case prose limit', () => {
    const diff = bound(); const budget = framedProgressFactBudget(diff, 5_000);
    expect(budget).toBeGreaterThan(0); expect(budget).toBeLessThan(5_000);
    const limit = framedProgressFactLimit(diff, 5_000); expect(limit).toBeGreaterThan(0); expect(limit).toBeLessThan(600);
    const values = receipts(diff).map(receipt => ({ ...receipt, files: receipt.files.map(file => ({ ...file, implemented: '\u0000'.repeat(limit), remaining: '\u0000'.repeat(limit) })) }));
    expect(Buffer.byteLength(aggregateProgressReceipts(diff, values, 5_000))).toBeLessThanOrEqual(5_000);
});
it.each([0, 1, -1, NaN, MAX_PROGRESS_AGGREGATE_BYTES + 1])('rejects insufficient metadata budget %s before requests', budget => {
    expect(() => framedProgressFactBudget(bound(), budget)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
it.each(['missing', 'extra', 'duplicate', 'reordered', 'foreign', 'null'])('rejects incomplete or replayed receipt sets: %s', mode => {
    const diff = bound(), values = receipts(diff);
    if (mode === 'null') values[1] = null as never;
    if (mode === 'missing') values.pop();
    if (mode === 'extra') values.push(values[0]);
    if (mode === 'duplicate') values[1] = values[0];
    if (mode === 'reordered') values.reverse();
    if (mode === 'foreign') values[1] = { ...values[1], requestId: 'another-attempt' };
    expect(() => aggregateProgressReceipts(diff, values, MAX_PROGRESS_AGGREGATE_BYTES)).toThrow(/response-(inventory|identity)/);
});
it('revalidates exact path and unit coverage after receipt collection', () => {
    const diff = bound(), values = clone(receipts(diff));
    values[1] = { ...values[1], files: [{ ...values[1].files[0], path: 'unassigned.md' }] };
    expect(() => aggregateProgressReceipts(diff, values, MAX_PROGRESS_AGGREGATE_BYTES)).toThrow(expect.objectContaining({ code: 'agent.failed' }));
});
it('revalidates the source manifest after collection before final assessment', () => {
    const source = bound(), values = receipts(source), diff = { ...source, evidence: source.evidence + ' ' };
    expect(() => aggregateProgressReceipts(diff, values, MAX_PROGRESS_AGGREGATE_BYTES)).toThrow('(source-manifest-digest)');
});
