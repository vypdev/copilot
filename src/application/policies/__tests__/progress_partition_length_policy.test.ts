import { bindProgressPartitionLength, progressPartitionLengthRejected, progressPartitionRepairPrompt } from '../progress_partition_length_policy';
import { ProgressPartitionLengthFailure, isProgressPartitionLengthDiagnostic } from '../../../domain/progress_partition_length_failure';
import type { ProgressPartitionLengthContext } from '../../../domain/progress_partition_length_failure';
import type { ProgressResponseDiagnosticFacts } from '../../../domain/progress_response_diagnostic';

const facts: ProgressResponseDiagnosticFacts = { phase: 'partition', reason: 'schema-string-long', field: '$.files[0].implemented', requirementId: 'none', sourceLineId: 'none' };
const details: ProgressPartitionLengthContext = { outputLocale: 'en-US', partitionId: 'part-1', filePath: 'b.ts', unitId: 'none', field: facts.field, maximum: 600, observed: 618 };
const part = { id: 'part-1', paths: ['a.ts', 'b.ts'], evidence: 'Complete current evidence.' };
const error = (patch: Record<string, unknown> = {}, other = facts) => new ProgressPartitionLengthFailure(other, { ...details, ...patch } as ProgressPartitionLengthContext);
const bind = (value: unknown) => bindProgressPartitionLength(value, part, 600, 'en-US');
const diagnostic = () => { const { outputLocale: _, ...value } = details; return value; };

it('uses the schema-admitted returned path independently of its array index and freezes bound facts', () => {
    const result = bind(error()); expect(result).toEqual(diagnostic()); expect(Object.isFrozen(result)).toBe(true);
    expect(error().details).toEqual(details); expect(Object.isFrozen(error().details)).toBe(true);
});
it('binds the exact framed path and unit pair even when their output order is different', () => {
    const framed = { ...part, units: [{ id: 'u-a', path: 'a.ts' }, { id: 'u-b', path: 'b.ts' }] };
    expect(bindProgressPartitionLength(error({ unitId: 'u-b' }), framed, 600, 'en-US')).toMatchObject({ filePath: 'b.ts', unitId: 'u-b' });
    expect(bindProgressPartitionLength(error({ unitId: 'u-a' }), framed, 600, 'en-US')).toBeNull();
});
it.each([
    ['foreign part', { partitionId: 'part-2' }], ['foreign path', { filePath: 'outside.ts' }], ['legacy unit', { unitId: 'u-a' }],
    ['foreign locale', { outputLocale: 'es-ES' }], ['different selected bound', { maximum: 599 }], ['inconsistent field', { field: '$.files[0].remaining' }],
    ['unknown metadata', { raw: 'PRIVATE_RESPONSE' }], ['absent locale', { outputLocale: undefined }],
] as const)('refuses %s without guessing a current identity', (_name, patch) => { expect(bind(error(patch))).toBeNull(); });
it('does not classify text-lookalike or untyped provider errors as completed output', () => {
    expect(bind(new Error('Progress partition schema-string-long PRIVATE_RESPONSE'))).toBeNull();
    expect(bind(Object.create(ProgressPartitionLengthFailure.prototype))).toBeNull();
});
it('refuses a forged typed error with invalid base facts or missing/nonrecord details', () => {
    const invalid = error(); Object.defineProperty(invalid, 'facts', { value: { ...facts, unknown: true } }); expect(bind(invalid)).toBeNull();
    for (const value of [undefined, 1, []]) { const malformed = error(); Object.defineProperty(malformed, 'details', { value }); expect(bind(malformed)).toBeNull(); }
});
it.each([
    { ...facts, phase: 'assessment', field: '$.requirements[0].summary' },
    { ...facts, reason: 'schema-enum' },
])('preserves other task/reason ownership for %j', other => { expect(bind(error({}, other as ProgressResponseDiagnosticFacts))).toBeNull(); });
it.each([
    ['not a record', null], ['array', []], ['missing keys', {}], ['extra keys', { ...diagnostic(), raw: 'PRIVATE_RESPONSE' }],
    ['nonstring part', { ...diagnostic(), partitionId: 1 }], ['empty part', { ...diagnostic(), partitionId: '' }],
    ['long part', { ...diagnostic(), partitionId: 'p'.repeat(257) }], ['control part', { ...diagnostic(), partitionId: 'part\n' }],
    ['empty path', { ...diagnostic(), filePath: '' }], ['long path', { ...diagnostic(), filePath: 'p'.repeat(4097) }],
    ['empty unit', { ...diagnostic(), unitId: '' }], ['unknown field', { ...diagnostic(), field: '$.files[0].PRIVATE' }],
    ['identity field', { ...diagnostic(), field: '$.files[0].path' }], ['string maximum', { ...diagnostic(), maximum: '600' }],
    ['fractional maximum', { ...diagnostic(), maximum: 1.5 }], ['zero maximum', { ...diagnostic(), maximum: 0 }],
    ['over-ceiling maximum', { ...diagnostic(), maximum: 601 }], ['string observed', { ...diagnostic(), observed: '618' }],
    ['fractional observed', { ...diagnostic(), observed: 618.5 }], ['not overflow', { ...diagnostic(), observed: 600 }],
])('rejects %s in the closed operator surface', (_name, value) => { expect(isProgressPartitionLengthDiagnostic(value)).toBe(false); });
it('retains the existing fact ceiling and never inserts a rejected body in the replacement instruction', () => {
    const prompt = progressPartitionRepairPrompt('Complete pinned source.'); expect(prompt).toContain('Complete pinned source.');
    expect(prompt).toContain('same complete immutable part'); expect(prompt).not.toContain('PRIVATE_RESPONSE');
    const rejected = progressPartitionLengthRejected(diagnostic()); expect(rejected.code).toBe('agent.failed');
    expect(rejected.recovery).toEqual({ id: 'progress-partition-length-invalid', variables: diagnostic() }); expect(rejected.retryable).toBe(false);
});
