import { captureProgressScopeSource } from '../progress_scope_source_policy';
import { renderProgressPromptData } from '../../../prompts/progress_scope';
import { invalidProgressCapacityAllocation, partitionProgressDiff } from '../progress_diff_partition_policy';
import { aggregateProgressFacts, progressPartitionFactLimit } from '../progress_partition_response_policy';
import { framedProgressFactBudget } from '../progress_partition_receipt_policy';
import { remainingProgressPromptBytes, remainingProgressAssessmentPromptBytes } from '../progress_prompt_capacity_policy';
import { ProgressCapacityFailure } from '../../errors/progress_capacity_failure';
import { AGENT_PROMPT_MAX_BYTES } from '../../../domain/agent_execution_plan';
import { bound } from './fixtures/framed_progress_fixture';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const diff = () => partitionProgressDiff(base, head, [{ path: 'a.ts', status: 'added', additions: 1, deletions: 0, unitId: 'u1', patch: 'x' }]);
const parts = () => { const value = diff(); if (value.kind !== 'partitioned') throw new Error('Expected units'); return value.partitions; };
function rejected(operation: () => unknown): ProgressCapacityFailure {
    try { operation(); } catch (error) { expect(error).toBeInstanceOf(ProgressCapacityFailure); return error as ProgressCapacityFailure; }
    throw new Error('Expected a capacity guard');
}

it('reports the source minimum as a measured zero rather than an unavailable count', () => {
    expect(rejected(() => captureProgressScopeSource('\n  \n')).diagnostic).toMatchObject({ phase: 'scope', dimension: 'source-line-count', observedCount: 0, supportedLimit: 1, bound: 'minimum' });
});
it('counts all original nonempty lines and retains the first crossing physical ID', () => {
    const source = Array.from({ length: 1_025 }, (_, i) => `requirement ${i}`).join('\n\n');
    expect(rejected(() => captureProgressScopeSource(source)).diagnostic).toMatchObject({ dimension: 'source-line-count', observedCount: 1_025, supportedLimit: 1_024, context: { sourceLineId: 'L2049' } });
});
it('measures Unicode source length in code points with its original line anchor', () => {
    expect(rejected(() => captureProgressScopeSource(`\n\n${'😀'.repeat(1_201)}`)).diagnostic).toMatchObject({ dimension: 'source-line-points', unit: 'code-points', observedCount: 1_201, supportedLimit: 1_200, context: { sourceLineId: 'L3' } });
});
it('admits exact source-line and original-line-count boundaries without clipping', () => {
    const value = Array(1_024).fill('😀'.repeat(1_200)).join('\n');
    const source = captureProgressScopeSource(value); expect(source.lines).toHaveLength(1_024); expect(source.lines[1_023].quote).toBe('😀'.repeat(1_200));
});
it.each(['input', 'scope', 'partition', 'assessment'] as const)('attributes raw UTF-8 framing to the actual %s caller', phase => {
    expect(rejected(() => renderProgressPromptData('😀', 'untrusted', 3, phase)).diagnostic).toMatchObject({ phase, dimension: 'input-text-bytes', observedCount: 4, supportedLimit: 3 });
});
it('preserves text at the exact UTF-8 bound', () => {
    const output = renderProgressPromptData('😀\n<source>', 'untrusted', Buffer.byteLength('😀\n<source>'));
    expect(output).toContain('😀\n<source>');
});
it('does not invent count facts for an invalid host allocation', () => {
    expect(rejected(() => renderProgressPromptData('x', 'untrusted', -1)).diagnostic).toMatchObject({ dimension: 'invalid-allocation', countKind: 'unavailable', observedCount: 'unavailable', supportedLimit: 'unavailable' });
});
it.each(['progress-scope', 'progress-partition', 'progress'] as const)('measures the whole native %s envelope including schema and effort', task => {
        const schema = { type: 'object', properties: { outputLocale: { type: 'string' } }, required: ['outputLocale'] };
    const available = remainingProgressPromptBytes('', task, schema, 'high');
    expect(remainingProgressPromptBytes('x'.repeat(available), task, schema, 'high')).toBe(0);
    expect(rejected(() => remainingProgressPromptBytes('x'.repeat(available + 1), task, schema, 'high')).diagnostic)
        .toMatchObject({ dimension: 'native-prompt-bytes', observedCount: AGENT_PROMPT_MAX_BYTES + 1, supportedLimit: AGENT_PROMPT_MAX_BYTES });
});
it('attributes the complete final replacement reserve rather than the smaller original prompt', () => {
    const schema = { type: 'object', properties: { outputLocale: { type: 'string' } }, required: ['outputLocale'] }, available = remainingProgressAssessmentPromptBytes('', schema);
    const prompt = 'x'.repeat(available + 1);
    expect(remainingProgressPromptBytes(prompt, 'progress', schema)).toBeGreaterThan(0);
    expect(rejected(() => remainingProgressAssessmentPromptBytes(prompt, schema)).diagnostic).toMatchObject({ phase: 'assessment', dimension: 'native-prompt-reserve-bytes', observedCount: AGENT_PROMPT_MAX_BYTES + 1 });
});
it('reports the actual complete legacy fact reservation before a model request', () => {
    const result = rejected(() => progressPartitionFactLimit(base, head, parts(), 1)).diagnostic;
    expect(result).toMatchObject({ dimension: 'minimum-fact-bytes', supportedLimit: 1, countKind: 'exact' });
    expect(result.observedCount).toBeGreaterThan(1);
});
it('keeps the immutable profile minimum fact length in its complete reservation', () => {
    const legacy = rejected(() => progressPartitionFactLimit(base, head, parts(), 1)).diagnostic;
    const immutable = rejected(() => progressPartitionFactLimit(base, head, parts(), 1, 'immutable-tree-v1')).diagnostic;
    expect(immutable.dimension).toBe('minimum-fact-bytes'); expect(immutable.observedCount).toBeGreaterThan(1);
    expect(immutable.observedCount).not.toBe(legacy.observedCount);
});
it('reports an empty unit inventory as a measured unsupported minimum', () => {
    expect(rejected(() => progressPartitionFactLimit(base, head, [])).diagnostic).toMatchObject({ dimension: 'evidence-unit-count', observedCount: 0, supportedLimit: 1, bound: 'minimum' });
});
it('retains unavailable facts for an invalid fact allocation', () => {
    expect(rejected(() => progressPartitionFactLimit(base, head, parts(), NaN)).diagnostic).toMatchObject({ dimension: 'invalid-allocation', supportedLimit: 'unavailable' });
});
it('reports a known excessive aggregate allocation against its applicable maximum', () => {
    expect(rejected(() => aggregateProgressFacts(base, head, parts(), [], 384_001)).diagnostic).toMatchObject({ dimension: 'aggregate-allocation-bytes', observedCount: 384_001, supportedLimit: 384_000, bound: 'maximum' });
});
it('reports complete serialized aggregate bytes rather than text length', () => {
    const values = [[{ unitId: 'u1', path: 'a.ts', implemented: '😀', remaining: 'Unverified' }]];
    const complete = aggregateProgressFacts(base, head, parts(), values);
    expect(rejected(() => aggregateProgressFacts(base, head, parts(), values, Buffer.byteLength(complete) - 1)).diagnostic)
        .toMatchObject({ dimension: 'aggregate-fact-bytes', observedCount: Buffer.byteLength(complete), supportedLimit: Buffer.byteLength(complete) - 1 });
});
it('keeps receipt-envelope reservation separate from the unavailable prose payload', () => {
    expect(rejected(() => framedProgressFactBudget(bound(), 1)).diagnostic).toMatchObject({ dimension: 'aggregate-envelope-bytes', supportedLimit: 1, countKind: 'at-least' });
});
it('validates the receipt allocation without weakening the complete source protocol', () => {
    expect(rejected(() => framedProgressFactBudget(bound(), 384_001)).diagnostic).toMatchObject({ dimension: 'aggregate-allocation-bytes', observedCount: 384_001, supportedLimit: 384_000, bound: 'maximum' });
});
it('reports a measured zero aggregate allocation against the known minimum', () => {
    expect(rejected(() => framedProgressFactBudget(bound(), 0)).diagnostic).toMatchObject({ dimension: 'aggregate-allocation-bytes', observedCount: 0, supportedLimit: 1, bound: 'minimum' });
});
it('does not manufacture integer allocation facts from negative or fractional bytes', () => {
    for (const budget of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(rejected(() => progressPartitionFactLimit(base, head, parts(), budget)).diagnostic).toMatchObject({ dimension: 'invalid-allocation', observedCount: 'unavailable' });
    }
});
it('keeps a missing or invalid host maximum explicitly unavailable', () => {
    for (const maximum of [undefined, 0, 0.5]) {
        expect(invalidProgressCapacityAllocation('aggregate', 2, maximum).diagnostic).toMatchObject({ dimension: 'invalid-allocation', supportedLimit: 'unavailable' });
    }
});
it('does not invent a maximum breach when an allocation is inside the supplied range', () => {
    expect(invalidProgressCapacityAllocation('aggregate', 2, 3).diagnostic).toMatchObject({ dimension: 'invalid-allocation', observedCount: 'unavailable' });
});
