import { partitionLengthFailure } from '../progress_partition_length_failure';
import { interpretProgressAgentOutput } from '../progress_agent_response_policy';
import { progressPartitionResponseSchema } from '../../../application/policies/progress_partition_response_policy';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { ProgressPartitionLengthFailure } from '../../../domain/progress_partition_length_failure';
import type { ProgressResponseDiagnosticFacts } from '../../../domain/progress_response_diagnostic';

const field = '$.files[0].implemented';
const facts: ProgressResponseDiagnosticFacts = { phase: 'partition', reason: 'schema-string-long', field, requirementId: 'none', sourceLineId: 'none' };
const privateValue = 'PRIVATE_RESPONSE_' + '🧪'.repeat(601);
type Host = { properties: { partitionId: { enum: unknown[] }; files: { minItems: number; maxItems: number; items: { properties: {
    path: { enum: unknown[] }; unitId?: { enum: unknown[] }; implemented: { maxLength: number }; remaining: { maxLength: number };
} } } } };
function fixture(framed = false) {
    const part = { id: 'part-1', paths: ['a.ts'], evidence: 'Complete current source.', ...(framed ? { units: [{ id: 'u-a', path: 'a.ts' }] } : {}) };
    const schema = progressPartitionResponseSchema(part), host = schema as unknown as Host;
    const row: Record<string, unknown> = { path: 'a.ts', ...(framed ? { unitId: 'u-a' } : {}), implemented: privateValue, remaining: 'Unknown.' };
    const parsed: Record<string, unknown> = { outputLocale: 'en-US', partitionId: part.id, files: [row] };
    return { schema, host, parsed, row, error: new AgentResponseLengthFailure(field, 600), facts: { ...facts } };
}
const map = (f: ReturnType<typeof fixture>) => partitionLengthFailure(f.error, f.facts, f.parsed, f.schema);

it.each([false, true])('attributes a real completed native rejection framed=%s without copying the returned prose', framed => {
    const f = fixture(framed);
    try { interpretProgressAgentOutput(JSON.stringify(f.parsed), 'partition', f.schema); throw Error('Expected rejection'); }
    catch (error) {
        expect(error).toBeInstanceOf(ProgressPartitionLengthFailure);
        expect((error as ProgressPartitionLengthFailure).details).toEqual({ outputLocale: 'en-US', partitionId: 'part-1', filePath: 'a.ts',
            unitId: framed ? 'u-a' : 'none', field, maximum: 600, observed: 618 });
        expect(String(error) + JSON.stringify(error)).not.toContain('PRIVATE_RESPONSE_');
    }
});
const invalid: readonly (readonly [string, (f: ReturnType<typeof fixture>) => void])[] = [
    ['wrong phase', f => { f.facts.phase = 'scope'; }],
    ['wrong reason', f => { f.facts.reason = 'schema-type'; }],
    ['foreign schema field', f => { f.error = new AgentResponseLengthFailure('$.files[0].remaining', 600); }],
    ['non-fact location', f => { f.facts.field = '$.files'; f.error = new AgentResponseLengthFailure('$.files', 600); }],
    ['non-array files', f => { f.parsed.files = null; }],
    ['wrong minimum', f => { f.host.properties.files.minItems = 0; }],
    ['wrong maximum', f => { f.host.properties.files.maxItems = 2; }],
    ['missing row', f => { f.facts.field = '$.files[1].implemented'; f.error = new AgentResponseLengthFailure(f.facts.field, 600); }],
    ['nonrecord row', f => { f.parsed.files = [1]; }],
    ['extra row fields', f => { f.row.raw = 'PRIVATE_RESPONSE'; }],
    ['foreign part', f => { f.parsed.partitionId = 'PRIVATE_PART'; }],
    ['foreign path', f => { f.row.path = 'PRIVATE_PATH'; }],
    ['missing part enum', f => { delete (f.host.properties.partitionId as Partial<Host['properties']['partitionId']>).enum; }],
    ['nonstring fact', f => { f.row.implemented = 2; }],
    ['different maximum', f => { f.error = new AgentResponseLengthFailure(field, 599); }],
    ['nonstring locale', f => { f.parsed.outputLocale = null; }],
    ['unsafe admitted path', f => { f.row.path = '/outside.ts'; f.host.properties.files.items.properties.path.enum = [f.row.path]; }],
];
it.each(invalid)('keeps %s identity unknown instead of publishing guessed context', (_name, edit) => {
    const f = fixture(); edit(f); expect(map(f)).toBeUndefined();
});
it('rejects a returned framed unit outside the host schema and a legacy extra unit', () => {
    const framed = fixture(true); framed.row.unitId = 'PRIVATE_UNIT'; expect(map(framed)).toBeUndefined();
    const legacy = fixture(); legacy.row.unitId = 'u-a'; expect(map(legacy)).toBeUndefined();
});
it('handles a missing host properties record without promoting the schema failure', () => {
    const f = fixture(); delete f.schema.properties; expect(map(f)).toBeUndefined();
});
it('does not retain an invalid locale body when an earlier fact failed before locale validation', () => {
    const f = fixture(); const parsed = { partitionId: f.parsed.partitionId, files: f.parsed.files, outputLocale: 'PRIVATE_RESPONSE_' };
    try { interpretProgressAgentOutput(JSON.stringify(parsed), 'partition', f.schema); throw Error('Expected rejection'); }
    catch (error) { expect(error).not.toBeInstanceOf(ProgressPartitionLengthFailure); expect(JSON.stringify(error)).not.toContain('PRIVATE_RESPONSE_'); }
});
it('uses the existing canonical locale policy without keeping noncanonical producer text', () => {
    const f = fixture(); f.parsed.outputLocale = ' EN-us '; expect(map(f)?.details.outputLocale).toBe('en-US');
});
