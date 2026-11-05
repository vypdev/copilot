import { partitionProgressDiff, MAX_PROGRESS_EVIDENCE_BYTES, type ProgressDiffChange } from '../../application/policies/progress_diff_partition_policy';
import { remainingProgressPromptBytes, remainingProgressAssessmentPromptBytes, progressAggregateBudget } from '../../application/policies/progress_prompt_capacity_policy';
import { progressScopeResponseSchema, progressScopeSourceLines } from '../../application/policies/progress_scope_policy';
import { AGENT_PROMPT_MAX_BYTES } from '../../domain/agent_execution_plan';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const schema = progressScopeResponseSchema(progressScopeSourceLines('Implement the complete behavior.'));
const change = (path: string, length: number): ProgressDiffChange => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(length) });
function rejected(operation: () => unknown): { toJSON(): unknown } {
    try { operation(); } catch (error) { return error as { toJSON(): unknown }; }
    throw new Error('Expected a deterministic capacity rejection.');
}

// SDK-owned closed-boundary regressions; none identifies the unknown original consumer dimension.
describe('attributable progress capacity failure', () => {
    it('retains the exact serialized source-unit byte count and applicable bound without the source text', () => {
        const input = change('src/example.ts', MAX_PROGRESS_EVIDENCE_BYTES);
        const observedCount = Buffer.byteLength(JSON.stringify({ kind: 'pinned-branch-comparison', baseSha: base, headSha: head, changes: [input] }));
        const record = rejected(() => partitionProgressDiff(base, head, [input])).toJSON();
        expect(record).toMatchObject({ code: 'validation.evidence-too-large', retryable: false, recovery: {
            id: 'progress-evidence-capacity-exceeded', variables: { phase: 'source', dimension: 'source-unit-bytes', unit: 'bytes',
                observedCount, supportedLimit: MAX_PROGRESS_EVIDENCE_BYTES, countKind: 'exact' },
        } });
        expect(JSON.stringify(record)).not.toContain('x'.repeat(100));
    });

    it('reports a lower bound when the legacy part ceiling stops packing before a full plan exists', () => {
        const changes = Array.from({ length: 17 }, (_, i) => change(`src/${i}.ts`, 150_000));
        const record = rejected(() => partitionProgressDiff(base, head, changes)).toJSON();
        expect(record).toMatchObject({ code: 'validation.evidence-too-large', retryable: false, recovery: {
            id: 'progress-evidence-capacity-exceeded', variables: { phase: 'source', dimension: 'source-part-count', unit: 'parts',
                observedCount: 17, supportedLimit: 16, countKind: 'at-least' },
        } });
    });

    it('reports the complete native scope envelope rather than the smaller raw task length', () => {
        const rawAvailable = remainingProgressPromptBytes('', 'progress-scope', schema);
        const prompt = 'x'.repeat(rawAvailable + 1);
        expect(Buffer.byteLength(prompt)).toBeLessThan(AGENT_PROMPT_MAX_BYTES);
        const record = rejected(() => remainingProgressPromptBytes(prompt, 'progress-scope', schema)).toJSON();
        expect(record).toMatchObject({ code: 'validation.evidence-too-large', retryable: false, recovery: {
            id: 'progress-evidence-capacity-exceeded', variables: { phase: 'scope', dimension: 'native-prompt-bytes', unit: 'bytes',
                observedCount: AGENT_PROMPT_MAX_BYTES + 1, supportedLimit: AGENT_PROMPT_MAX_BYTES, countKind: 'exact' },
        } });
    });

    it('identifies the minimum aggregate/framing reservation when both whole final envelopes otherwise fit', () => {
        const available = remainingProgressAssessmentPromptBytes('', schema);
        const prompt = 'x'.repeat(available - 1_024);
        expect(remainingProgressAssessmentPromptBytes(prompt, schema)).toBe(1_024);
        const record = rejected(() => progressAggregateBudget(prompt, schema)).toJSON();
        expect(record).toMatchObject({ code: 'validation.evidence-too-large', retryable: false, recovery: {
            id: 'progress-evidence-capacity-exceeded', variables: { phase: 'aggregate', dimension: 'aggregate-reserve-bytes', unit: 'bytes',
                observedCount: 1_025, supportedLimit: 1_024, countKind: 'exact' },
        } });
    });

    it('already preserves every source byte in a supported synthetic 39-file multipart control', () => {
        const changes = Array.from({ length: 39 }, (_, i) => change(`src/${i}.ts`, 9_000));
        const diff = partitionProgressDiff(base, head, changes);
        expect(diff.kind).toBe('partitioned');
        if (diff.kind !== 'partitioned') throw new Error('Expected a supported multipart plan.');
        expect(diff.partitions).toHaveLength(2);
        const complete = diff.partitions.flatMap(part => {
            expect(Buffer.byteLength(part.evidence)).toBeLessThanOrEqual(MAX_PROGRESS_EVIDENCE_BYTES);
            const source = JSON.parse(part.evidence);
            expect(source.baseSha).toBe(base); expect(source.headSha).toBe(head);
            return source.changes as ProgressDiffChange[];
        });
        expect(complete).toEqual(changes);
    });
});
