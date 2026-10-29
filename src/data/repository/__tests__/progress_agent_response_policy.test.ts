import { interpretProgressAgentOutput, progressResponsePhaseForSchema } from '../progress_agent_response_policy';
import { ProgressResponseContractFailure } from '../../../domain/progress_response_diagnostic';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { AgentResponseSchemaFailure } from '../../../domain/agent_response_schema_failure';
import * as schemaPolicy from '../agent_json_schema_validator';
import { scopedProgressResponseSchema, progressScopeResponseSchema, progressScopeSourceLines } from '../../../application/policies/progress_scope_policy';
import { progressPartitionResponseSchema } from '../../../application/policies/progress_partition_response_policy';
import { FindingsAgentAdapter } from '../ai/findings_agent_adapter';

const scope = { requirements: [{ id: 'R1', quote: 'First.' }, { id: 'R2', quote: 'Second.' }], exclusions: [] };
const schema = scopedProgressResponseSchema(scope);
const response = () => ({ outputLocale: 'en-US', progress: 100, requirements: scope.requirements.map(requirement => ({
    id: requirement.id, status: 'supported', evidence: 'source-only', summary: 'Required source.', remaining: null as string | null,
})) });
function failure(value: unknown) {
    try { interpretProgressAgentOutput(typeof value === 'string' ? value : JSON.stringify(value), 'assessment', schema); }
    catch (error) { if (error instanceof ProgressResponseContractFailure) return error; throw error; }
    throw Error('Expected owned output rejection');
}
it.each([
    ['progress_scope', 'scope'], ['progress_partition_facts', 'partition'], ['progress_response', 'assessment'], ['bugbot_findings', undefined], ['PRIVATE_MODEL_NAME', undefined],
])('selects only existing host schema names %#', (name, phase) => { expect(progressResponsePhaseForSchema(name!)).toBe(phase); });
it.each(['', 'PRIVATE_MODEL_TEXT', 'null', '[]', '{"a":1}{"b":2}', 'Prefix {"outputLocale":"en-US"}'])('rejects malformed completed JSON without echoing it %#', text => {
    const error = failure(text); expect(error.facts).toEqual({ phase: 'assessment', reason: 'json-invalid', field: '$', requirementId: 'none', sourceLineId: 'none' });
    expect(String(error)).not.toContain('PRIVATE_MODEL_TEXT');
});
it('preserves the single supported JSON fence and complete positive output', () => {
    expect(interpretProgressAgentOutput('```json\n' + JSON.stringify(response()) + '\n```', 'assessment', schema)).toEqual(response());
});
it.each([
    ['id', 'PRIVATE_RETURNED_ID', 'schema-enum', '$.requirements[1].id', 'none'],
    ['status', 'PRIVATE_STATUS', 'schema-enum', '$.requirements[1].status', 'R2'],
    ['evidence', 'PRIVATE_EVIDENCE', 'schema-enum', '$.requirements[1].evidence', 'R2'],
    ['summary', '', 'schema-string-short', '$.requirements[1].summary', 'R2'],
    ['summary', 'x'.repeat(801), 'schema-string-long', '$.requirements[1].summary', 'R2'],
    ['summary', 12, 'schema-type', '$.requirements[1].summary', 'R2'],
])('maps native known fields and host IDs without returned values %#', (key, value, reason, field, id) => {
    const output = response(); Object.assign(output.requirements[1], { [key]: value }); const error = failure(output);
    expect(error.facts).toMatchObject({ reason, field, requirementId: id, sourceLineId: 'none' }); expect(JSON.stringify(error)).not.toContain('PRIVATE_');
});
it('never guesses a requirement from an invalid array entry position', () => {
    const output = { ...response(), requirements: [response().requirements[0], 1] };
    expect(failure(output).facts).toMatchObject({ reason: 'schema-type', field: '$.requirements[1]', requirementId: 'none' });
});
it('reports an actually missing host requirement at the array location', () => {
    const output = response(); output.requirements.pop();
    expect(failure(output).facts).toMatchObject({ reason: 'schema-array-short', field: '$.requirements', requirementId: 'R2' });
});
it('does not invent a missing ID when an oversized array already contains all required IDs', () => {
    const output = response(); output.requirements.push(output.requirements[0]);
    expect(failure(output).facts).toMatchObject({ reason: 'schema-array-long', requirementId: 'none' });
});
it('uses the schema-owned missing field instead of producer prose', () => {
    const output = response(); delete (output.requirements[1] as Partial<typeof output.requirements[number]>).remaining;
    expect(failure(output).facts).toMatchObject({ reason: 'schema-required', field: '$.requirements[1].remaining', requirementId: 'R2' });
});
it('omits unknown property names while retaining the known containing record', () => {
    const output = response(); Object.assign(output.requirements[1], { 'PRIVATE_FIELD@all<script>': 'PRIVATE_VALUE' }); const error = failure(output);
    expect(error.facts).toMatchObject({ reason: 'schema-additional', field: '$.requirements[1]', requirementId: 'R2' });
    expect(String(error) + JSON.stringify(error)).not.toMatch(/PRIVATE_|@all|<script>/u);
});
it.each([[-1, 'schema-number-min'], [101, 'schema-number-max'], ['private', 'schema-type']])('diagnoses percentage schema boundaries %#', (value, reason) => {
    expect(failure({ ...response(), progress: value }).facts).toMatchObject({ reason, field: '$.progress', requirementId: 'none' });
});
it('handles a syntactically valid overflowing JSON number without output leakage', () => {
    expect(failure(JSON.stringify(response()).replace('"progress":100', '"progress":1e400')).facts.reason).toBe('schema-number-finite');
});
it('retains an exact Unicode code-point length boundary', () => {
    const output = response(); output.requirements[1].summary = '🧪'.repeat(800);
    expect(interpretProgressAgentOutput(JSON.stringify(output), 'assessment', schema)).toEqual(output);
});
const sourceLines = progressScopeSourceLines('First.\n\nSecond.');
const scopeSchema = progressScopeResponseSchema(sourceLines);
it('maps reordered original source IDs rather than array position', () => {
    const output = { outputLocale: 'en-US', lines: [{ id: 'L3', kind: 'PRIVATE_KIND' }, { id: 'L1', kind: 'required' }] };
    expect(() => interpretProgressAgentOutput(JSON.stringify(output), 'scope', scopeSchema)).toThrow(expect.objectContaining({ facts: expect.objectContaining({
        field: '$.lines[0].kind', requirementId: 'none', sourceLineId: 'L3',
    }) }));
});
it('refuses an unrecognized source ID without assigning the expected positional ID', () => {
    const output = { outputLocale: 'en-US', lines: [{ id: 'L999', kind: 'required' }, { id: 'L1', kind: 'required' }] };
    expect(() => interpretProgressAgentOutput(JSON.stringify(output), 'scope', scopeSchema)).toThrow(expect.objectContaining({ facts: expect.objectContaining({ sourceLineId: 'none' }) }));
});
it('identifies a missing original physical line independently of response order', () => {
    const output = { outputLocale: 'en-US', lines: [{ id: 'L3', kind: 'required' }] };
    expect(() => interpretProgressAgentOutput(JSON.stringify(output), 'scope', scopeSchema)).toThrow(expect.objectContaining({ facts: expect.objectContaining({ sourceLineId: 'L1', field: '$.lines' }) }));
});
it('keeps partition facts separate from issue requirement/source identities', () => {
    const part = { id: 'owned-request', paths: ['a.md'], evidence: 'Owned source' };
    const output = { outputLocale: 'en-US', partitionId: 'wrong', files: [] };
    expect(() => interpretProgressAgentOutput(JSON.stringify(output), 'partition', progressPartitionResponseSchema(part))).toThrow(expect.objectContaining({ facts: expect.objectContaining({
        field: '$.partitionId', requirementId: 'none', sourceLineId: 'none',
    }) }));
});
it('uses no identity when a host schema has no admitted enum', () => {
    const host = { type: 'object', properties: { requirements: { type: 'array', items: { type: 'object', required: ['id'] } } } };
    expect(() => interpretProgressAgentOutput('{"requirements":[{}]}', 'assessment', host)).toThrow(expect.objectContaining({ facts: expect.objectContaining({ requirementId: 'none' }) }));
});
it.each(['scope', 'assessment'] as const)('does not invent an identity when the %s container has the wrong type', phase => {
    const host = phase === 'scope' ? scopeSchema : schema;
    const output = phase === 'scope' ? { outputLocale: 'en-US', lines: 'PRIVATE_ARRAY_VALUE' } : { ...response(), requirements: 'PRIVATE_ARRAY_VALUE' };
    expect(() => interpretProgressAgentOutput(JSON.stringify(output), phase, host)).toThrow(expect.objectContaining({ facts: expect.objectContaining({
        reason: 'schema-type', requirementId: 'none', sourceLineId: 'none',
    }) }));
});
it('does not trust over-capacity enum metadata', () => {
    const host = structuredClone(schema); (host.properties.requirements.items.properties.id as { enum: string[] }).enum = Array(33).fill('R1');
    expect(() => interpretProgressAgentOutput(JSON.stringify({ ...response(), requirements: [{ ...response().requirements[0], id: 'R2' }, response().requirements[1]] }), 'assessment', host)).toThrow(expect.objectContaining({ facts: expect.objectContaining({ requirementId: 'none' }) }));
});
it('closes unknown dynamic field paths instead of publishing model property names', () => {
    const host = { type: 'object', additionalProperties: { type: 'number' } };
    expect(() => interpretProgressAgentOutput('{"PRIVATE_DYNAMIC_FIELD":"bad"}', 'assessment', host)).toThrow(expect.objectContaining({ facts: expect.objectContaining({ field: '$', requirementId: 'none' }) }));
});
it('retains unrelated internal errors instead of classifying them from their message', () => {
    const sentinel = Error('Owned unrelated schema implementation defect'), spy = jest.spyOn(schemaPolicy, 'assertAgentResponseSchema').mockImplementationOnce(() => { throw sentinel; });
    try { expect(() => interpretProgressAgentOutput(JSON.stringify(response()), 'assessment', schema)).toThrow(sentinel); } finally { spy.mockRestore(); }
});
it('retains the existing non-progress SDD length error and bound', async () => {
    const output = JSON.stringify({ markdown: 'too long' }), native = new FindingsAgentAdapter({ cli: { execute: async () => output } });
    await expect(native.query({ ...{ configuration: { provider: 'codex' as const, model: 'fixture-model' }, agentId: 'plan', prompt: 'Owned non-progress fixture' },
        options: { expectJson: true, schemaName: 'sdd_draft', schema: { type: 'object', properties: { markdown: { type: 'string', maxLength: 3 } } } } })).rejects.toMatchObject({ name: 'AgentResponseLengthFailure', path: '$.markdown', maximum: 3 });
    expect(() => schemaPolicy.assertAgentResponseSchema('too long', { type: 'string', maxLength: 3 })).toThrow(AgentResponseLengthFailure);
    expect(() => schemaPolicy.assertAgentResponseSchema(1, { type: 'string' })).toThrow(AgentResponseSchemaFailure);
});
