import { aggregateProgressFacts, MAX_PROGRESS_AGGREGATE_BYTES, progressPartitionFactLimit, parseProgressPartitionFacts, progressPartitionResponseSchema } from '../progress_partition_response_policy';
import { MAX_PROGRESS_EVIDENCE_BYTES, partitionProgressDiff } from '../progress_diff_partition_policy';

const part = { id: 'progress-1-of-2', paths: ['src/a.ts', 'src/b.ts'], evidence: 'immutable' };
const facts = () => part.paths.map(path => ({ path, implemented: 'Adds the intended behavior.', remaining: 'Runtime verification is unknown.' }));
const response = () => ({ partitionId: part.id, outputLocale: 'en-US', files: facts() });
const parse = (value: unknown) => parseProgressPartitionFacts(value, part, 'en-US');

describe('complete progress partition facts', () => {
    it('accepts complete facts in any order and freezes output', () => {
        const value = response(); value.files.reverse(); const result = parse(value);
        expect(result).toEqual(value.files); expect([result, ...result].every(Object.isFrozen)).toBe(true);
    });
    it('constrains exact identity, file paths, count and prose at the provider schema', () => {
        expect(progressPartitionResponseSchema(part)).toMatchObject({ additionalProperties: false,
            required: ['outputLocale', 'partitionId', 'files'], properties: {
                partitionId: { enum: [part.id] }, files: { minItems: 2, maxItems: 2,
                    items: { additionalProperties: false, properties: { path: { enum: part.paths }, implemented: { maxLength: 600 }, remaining: { maxLength: 600 } } } } } });
    });
    it('rejects missing or wrong locale before facts reach assessment', () => {
        expect(() => parse({ ...response(), outputLocale: 'es-ES' })).toThrow(expect.objectContaining({ code: 'agent.failed' }));
        expect(() => parse({ files: facts(), partitionId: part.id })).toThrow();
    });
    it('rejects a different partition identity', () => { expect(() => parse({ ...response(), partitionId: 'other' })).toThrow(); });
    it('rejects missing assigned files', () => { expect(() => parse({ ...response(), files: facts().slice(0, 1) })).toThrow(); });
    it('rejects extra files even when the response claims complete', () => { expect(() => parse({ ...response(), files: [...facts(), facts()[0]] })).toThrow(); });
    it('rejects duplicate assigned paths', () => { expect(() => parse({ ...response(), files: [facts()[0], facts()[0]] })).toThrow(); });
    it('rejects substituted paths', () => { expect(() => parse({ ...response(), files: [facts()[0], { ...facts()[1], path: 'outside' }] })).toThrow(); });
    it('rejects model percentages and unexpected response properties', () => { expect(() => parse({ ...response(), progress: 100 })).toThrow(); });
    it('rejects unknown file fields rather than interpreting instructions', () => { expect(() => parse({ ...response(), files: [{ ...facts()[0], run: 'command' }, facts()[1]] })).toThrow(); });
    it.each([undefined, 'json text', [], { ...response(), files: 'incomplete' }, { ...response(), files: [null, facts()[1]] }, { ...response(), files: [[], facts()[1]] }, { ...response(), files: [{ ...facts()[0], path: 1 }, facts()[1]] }])('rejects malformed structural facts %#', value => { expect(() => parse(value)).toThrow(); });
    it.each(['', ' ', 'x'.repeat(601), 42])('rejects empty, oversized or nontext facts %#', implemented => { expect(() => parse({ ...response(), files: [{ ...facts()[0], implemented }, facts()[1]] })).toThrow(); });
    it('accepts the exact prose bound and preserves untrusted content as data', () => {
        const value = response(); value.files[0].implemented = 'x'.repeat(600); value.files[1].remaining = 'Untrusted: /copilot deploy @all';
        expect(parse(value)).toEqual(value.files);
    });
    it('accepts the schema boundary of 600 supplementary Unicode code points', () => {
        const value = response(); value.files[0].implemented = '🧪'.repeat(600);
        expect(parse(value)[0].implemented).toBe(value.files[0].implemented);
        expect(value.files[0].implemented.length).toBe(1200);
    });
    it('rejects 601 supplementary code points just like schema maxLength', () => {
        const value = response(); value.files[0].implemented = '🧪'.repeat(601);
        expect(() => parse(value)).toThrow(expect.objectContaining({ code: 'agent.failed' }));
    });
    it('applies the calculated code-point limit equally to supplementary characters', () => {
        const value = { ...response(), files: part.paths.map(path => ({ path, implemented: '🧪'.repeat(20), remaining: 'Unknown' })) };
        expect(parseProgressPartitionFacts(value, part, 'en-US', 20)).toHaveLength(2);
        value.files[0].implemented += '🧪';
        expect(() => parseProgressPartitionFacts(value, part, 'en-US', 20)).toThrow();
    });
    it('aggregates every validated path with immutable identity and explicit uncertainty', () => {
        const evidence = JSON.parse(aggregateProgressFacts('a', 'b', [part], [parse(response()), []]));
        expect(evidence).toMatchObject({ baseSha: 'a', headSha: 'b', partitions: [{ id: part.id, fileCount: 2 }], files: facts() });
        expect(evidence.warning).toContain('not CI/build/test attestation');
    });
    it.each([0, -1, NaN, MAX_PROGRESS_AGGREGATE_BYTES + 1, 1])('rejects invalid or insufficient aggregate budgets %s before extraction', budget => {
        expect(() => progressPartitionFactLimit('a', 'b', [part], budget)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
    });
    it('rejects an empty assignment before deriving a fact limit', () => {
        expect(() => progressPartitionFactLimit('a', 'b', [{ ...part, paths: [] }])).toThrow();
    });
    it('enforces a smaller planned fact length at schema and parsing boundaries', () => {
        expect(progressPartitionResponseSchema(part, 20)).toMatchObject({ properties: { files: { items: { properties: { implemented: { maxLength: 20 } } } } } });
        expect(() => parseProgressPartitionFacts(response(), part, 'en-US', 20)).toThrow();
        expect(progressPartitionFactLimit('a', 'b', [part])).toBe(600);
    });
    it.each([NaN, MAX_PROGRESS_AGGREGATE_BYTES + 1, 0])('does not let an invalid aggregation budget bypass the fixed ceiling: %s', budget => {
        expect(() => aggregateProgressFacts('a', 'b', [part], [facts()], budget)).toThrow();
    });
    it('rejects oversized UTF-8 aggregate before final assessment', () => {
        expect(() => aggregateProgressFacts('a', 'b', [part], [[{ path: 'a', implemented: '🧪'.repeat(MAX_PROGRESS_AGGREGATE_BYTES / 4), remaining: 'unknown' }]])).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large', retryable: false }));
    });
    it('retains all 299 file facts at their planned maximum length even when their aggregate exceeds one source-part budget', () => {
        const paths = Array.from({ length: 299 }, (_, i) => `src/${i}-${'x'.repeat(800)}.ts`);
        const diff = partitionProgressDiff('a', 'b', paths.map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(1500) })));
        if (diff.kind !== 'partitioned') throw new Error('Expected complete multipart fixture');
        const limit = progressPartitionFactLimit('a', 'b', diff.partitions);
        const batches = diff.partitions.map(partition => parseProgressPartitionFacts({ outputLocale: 'en-US', partitionId: partition.id,
            files: partition.paths.map(path => ({ path, implemented: '\u0000'.repeat(limit), remaining: '\u0000'.repeat(limit) })) }, partition, 'en-US', limit));
        const evidence = aggregateProgressFacts('a', 'b', diff.partitions, batches);
        expect(Buffer.byteLength(evidence)).toBeGreaterThan(MAX_PROGRESS_EVIDENCE_BYTES);
        expect(Buffer.byteLength(evidence)).toBeLessThanOrEqual(MAX_PROGRESS_AGGREGATE_BYTES);
        expect(JSON.parse(evidence).files.map((file: { path: string }) => file.path)).toEqual(paths);
        expect(diff.partitions.every(partition => Buffer.byteLength(partition.evidence) <= MAX_PROGRESS_EVIDENCE_BYTES)).toBe(true);
    });
});
