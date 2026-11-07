import { interpretProgressAgentOutput } from '../progress_agent_response_policy';
import { assessmentLengthFailure } from '../progress_assessment_length_failure';
import { scopedProgressResponseSchema } from '../../../application/policies/progress_scope_policy';
import { ProgressAssessmentLengthFailure } from '../../../domain/progress_assessment_length_failure';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import type { ProgressResponseDiagnosticFacts } from '../../../domain/progress_response_diagnostic';

function fixture() {
    const schema = scopedProgressResponseSchema({ requirements: [{ id: 'R11', quote: 'First.' }, { id: 'R12', quote: 'Second.' }], exclusions: [] });
    const response = { outputLocale: 'en-US', progress: 100, requirements: ['R11', 'R12'].map(id => ({ id,
        status: 'supported', evidence: 'source-only', summary: '🧪'.repeat(801), remaining: null })) };
    const facts: ProgressResponseDiagnosticFacts = { phase: 'assessment', reason: 'schema-string-long', field: '$.requirements[0].summary', requirementId: 'R11', sourceLineId: 'none' };
    const failure = new AgentResponseLengthFailure(facts.field, 800);
    return { schema, response, facts, failure };
}
it('github-communication-experience-change-C175: native diagnostics measure Unicode points and retain no output text or foreign schema authority', () => {
    const f = fixture(); let caught: unknown;
    try { interpretProgressAgentOutput(JSON.stringify(f.response), 'assessment', f.schema); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ProgressAssessmentLengthFailure);
    const value = caught as ProgressAssessmentLengthFailure;
    expect(value.detailsFor(f.schema)).toEqual({ requirementId: 'R11', field: f.facts.field, maximum: 800, observed: 801, outputLocale: 'en-US' });
    expect(value.detailsFor(structuredClone(f.schema))).toBeUndefined(); expect(JSON.stringify(value)).not.toContain('🧪');
    expect(f.schema.properties.requirements.items.properties.summary.maxLength).toBe(800);
});
it.each(['phase', 'reason', 'path', 'field', 'short-array', 'long-array', 'not-array', 'not-row', 'foreign-id', 'mismatched-id',
    'not-string', 'different-limit', 'missing-locale', 'invalid-locale', 'noncanonical-locale', 'extra-field', 'duplicate-id', 'missing-schema-field', 'not-overlong'] as const)(
    'github-communication-experience-change-C175/C176: completed output with %s cannot mint a recovery carrier', mode => {
        const f = fixture(), response: any = f.response, schema: any = f.schema; let { facts, failure } = f;
        if (mode === 'phase') facts = { ...facts, phase: 'partition' };
        if (mode === 'reason') facts = { ...facts, reason: 'schema-enum' };
        if (mode === 'path') failure = new AgentResponseLengthFailure('$.requirements[1].summary', 800);
        if (mode === 'field') facts = { ...facts, field: '$.requirements[0].status' };
        if (mode === 'short-array') response.requirements.pop();
        if (mode === 'long-array') response.requirements.push(response.requirements[0]);
        if (mode === 'not-array') response.requirements = null;
        if (mode === 'not-row') response.requirements[0] = null;
        if (mode === 'foreign-id') response.requirements[0].id = 'R99';
        if (mode === 'mismatched-id') facts = { ...facts, requirementId: 'R12' };
        if (mode === 'not-string') response.requirements[0].summary = null;
        if (mode === 'different-limit') failure = new AgentResponseLengthFailure(facts.field, 799);
        if (mode === 'missing-locale') delete response.outputLocale;
        if (mode === 'invalid-locale') response.outputLocale = 'PRIVATE_INVALID_';
        if (mode === 'noncanonical-locale') response.outputLocale = 'en-us';
        if (mode === 'extra-field') response.requirements[0].private = 'PRIVATE_REJECTED';
        if (mode === 'duplicate-id') response.requirements[1].id = 'R11';
        if (mode === 'missing-schema-field') delete schema.properties.requirements.items.properties.remaining;
        if (mode === 'not-overlong') response.requirements[0].summary = '🧪'.repeat(800);
        expect(assessmentLengthFailure(failure, facts, response, schema)).toBeUndefined();
    });
it.each(['manifestDigest', 'batchId', 'headSha', 'citations', 'duplicate-citations'] as const)(
    'github-communication-experience-change-C172: a foreign batch %s cannot allocate length recovery', key => {
        const f = fixture(), schema: any = f.schema, response: any = f.response;
        for (const receipt of ['manifestDigest', 'batchId', 'headSha']) {
            schema.properties[receipt] = { type: 'string', enum: ['current-' + receipt] }; schema.required.push(receipt); response[receipt] = 'current-' + receipt;
        }
        schema.properties.requirements.items.properties.citations = { type: 'array', minItems: 1, items: { type: 'string', enum: ['source.ts'] } };
        schema.properties.requirements.items.required.push('citations'); response.requirements.forEach((row: any) => { row.citations = ['source.ts']; });
        expect(assessmentLengthFailure(f.failure, f.facts, response, schema)).toBeInstanceOf(ProgressAssessmentLengthFailure);
        if (key === 'citations') response.requirements[1].citations = ['foreign.ts'];
        else if (key === 'duplicate-citations') response.requirements[1].citations = ['source.ts', 'source.ts'];
        else response[key] = 'foreign';
        expect(assessmentLengthFailure(f.failure, f.facts, response, schema)).toBeUndefined();
    });
