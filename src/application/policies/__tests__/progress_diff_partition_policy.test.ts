import { MAX_PROGRESS_EVIDENCE_BYTES, partitionProgressDiff, type ProgressDiffChange } from '../progress_diff_partition_policy';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const file = (path = 'src/a.ts', patch = '+implementation'): ProgressDiffChange => ({ path, status: 'modified', additions: 1, deletions: 0, patch });
const read = (changes: readonly ProgressDiffChange[]) => partitionProgressDiff(base, head, changes);
const boundaryPatch = () => 'x'.repeat(MAX_PROGRESS_EVIDENCE_BYTES - Buffer.byteLength(read([file('src/a.ts', '')]).evidence));

describe('complete bounded progress partitions', () => {
    it('keeps small and empty comparisons in the existing one-call contract', () => {
        expect(read([])).toMatchObject({ kind: 'single', baseSha: base, headSha: head });
        expect(JSON.parse(read([file()]).evidence).changes).toEqual([file()]);
    });
    it('accepts exactly 256000 serialized bytes', () => {
        const result = read([file('src/a.ts', boundaryPatch())]);
        expect(result.kind).toBe('single');
        expect(Buffer.byteLength(result.evidence)).toBe(MAX_PROGRESS_EVIDENCE_BYTES);
    });
    it('classifies a single file one byte beyond the boundary as terminal', () => {
        expect(() => read([file('src/a.ts', boundaryPatch() + 'x')])).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large', retryable: false }));
    });
    it('uses UTF-8 bytes for multibyte source instead of JS string length', () => {
        expect(() => read([file('src/a.ts', '🧪'.repeat(64_000))])).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
    });
    it('accounts for JSON quote and newline expansion', () => {
        expect(() => read([file('src/a.ts', '\n"'.repeat(64_000))])).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
    });
    it('packs complete files losslessly without omissions or duplicate paths', () => {
        const changes = Array.from({ length: 5 }, (_, i) => file(`src/${i}.ts`, 'x'.repeat(110_000)));
        const result = read(changes);
        if (result.kind !== 'partitioned') throw new Error('Expected multipart');
        expect(result.partitions).toHaveLength(3);
        expect(result.partitions.flatMap(part => JSON.parse(part.evidence).changes)).toEqual(changes);
        expect(result.partitions.flatMap(part => part.paths)).toEqual(changes.map(change => change.path));
        expect(result.partitions.every(part => Buffer.byteLength(part.evidence) <= MAX_PROGRESS_EVIDENCE_BYTES)).toBe(true);
    });
    it('gives every part a deterministic identity and complete bounded manifest', () => {
        const changes = [file('a', boundaryPatch()), file('b', 'x'.repeat(100))];
        const result = read(changes);
        if (result.kind !== 'partitioned') throw new Error('Expected multipart');
        expect(read(changes)).toEqual(result);
        expect(JSON.parse(result.evidence)).toMatchObject({ baseSha: base, headSha: head,
            partitions: [{ id: 'progress-1-of-2', paths: ['a'] }, { id: 'progress-2-of-2', paths: ['b'] }] });
    });
    it('freezes the complete plan and nested partition/path lists', () => {
        const result = read([file('a', 'x'.repeat(200_000)), file('b', 'x'.repeat(200_000))]);
        if (result.kind !== 'partitioned') throw new Error('Expected multipart');
        expect([result, result.partitions, ...result.partitions, ...result.partitions.map(part => part.paths)].every(Object.isFrozen)).toBe(true);
    });
    it('retains generated metadata as metadata in a larger complete comparison', () => {
        const generated = { path: 'build/index.js', status: 'modified', additions: 1, deletions: 1, evidence: 'generated-metadata-only' as const };
        const result = read([file('a', 'x'.repeat(200_000)), file('b', 'x'.repeat(200_000)), generated]);
        if (result.kind !== 'partitioned') throw new Error('Expected multipart');
        expect(result.partitions.flatMap(part => JSON.parse(part.evidence).changes).at(-1)).toEqual(generated);
    });
    it('accepts sixteen bounded complete parts', () => {
        const result = read(Array.from({ length: 16 }, (_, i) => file(`src/${i}.ts`, 'x'.repeat(200_000))));
        expect(result).toMatchObject({ kind: 'partitioned', partitions: expect.any(Array) });
        if (result.kind === 'partitioned') expect(result.partitions).toHaveLength(16);
    });
    it('rejects seventeen parts without returning a partial plan', () => {
        expect(() => read(Array.from({ length: 17 }, (_, i) => file(`src/${i}.ts`, 'x'.repeat(200_000))))).toThrow(expect.objectContaining({ retryable: false }));
    });
    it('rejects an oversized path manifest even when all source parts fit', () => {
        expect(() => read(Array.from({ length: 299 }, (_, i) => file(`${i}${'x'.repeat(1010)}`, '+x')))).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
    });
});
