import { aggregateProgressFacts, parseProgressPartitionFacts, progressPartitionResponseSchema } from '../progress_partition_response_policy';

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
    it('aggregates every validated path with immutable identity and explicit uncertainty', () => {
        const evidence = JSON.parse(aggregateProgressFacts('a', 'b', 'manifest', [parse(response()), []]));
        expect(evidence).toMatchObject({ baseSha: 'a', headSha: 'b', manifest: 'manifest', files: facts() });
        expect(evidence.warning).toContain('not CI/build/test attestation');
    });
    it('rejects oversized UTF-8 aggregate before final assessment', () => {
        expect(() => aggregateProgressFacts('a', 'b', 'manifest', [[{ path: 'a', implemented: '🧪'.repeat(64_000), remaining: 'unknown' }]])).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large', retryable: false }));
    });
});
