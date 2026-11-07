import { bindProgressAssessmentLength, progressAssessmentLengthRepairPrompt, reservedProgressAssessmentLengthPrompt } from '../progress_assessment_length_policy';
import { ProgressAssessmentLengthFailure, isProgressAssessmentLengthFacts, isProgressAssessmentLengthDiagnostic, type ProgressAssessmentLengthContext } from '../../../domain/progress_assessment_length_failure';
import type { ProgressResponseDiagnosticFacts } from '../../../domain/progress_response_diagnostic';
import { scopedProgressResponseSchema } from '../progress_scope_policy';
import { remainingProgressAssessmentPromptBytes, remainingProgressPromptBytes } from '../progress_prompt_capacity_policy';
import { queryProgressAssessment } from '../../usecases/actions/query_progress_assessment_workflow';

const scope = { requirements: [{ id: 'R11', quote: 'Current source.' }], exclusions: [] }, anchors = { R11: 'L11' };
const schema = scopedProgressResponseSchema(scope, anchors);
const facts: ProgressResponseDiagnosticFacts = { phase: 'assessment', reason: 'schema-string-long', field: '$.requirements[0].summary', requirementId: 'R11', sourceLineId: 'none' };
const details: ProgressAssessmentLengthContext = { outputLocale: 'en-US', requirementId: 'R11', field: facts.field, maximum: 800, observed: 801 };
const error = (patch: Record<string, unknown> = {}, other = facts, owner: object = schema) => new ProgressAssessmentLengthFailure(other, { ...details, ...patch } as ProgressAssessmentLengthContext, owner);
const bind = (value: unknown) => bindProgressAssessmentLength(value, schema, scope, anchors, ['L11'], 'en-US');
const diagnostic = { requirementId: 'R11', field: facts.field, maximum: 800, observed: 801, sourceLineId: 'L11' };

it('github-communication-experience-change-C172: binds only the captured schema and host-owned source anchor', () => {
    const failure = error(); expect(bind(failure)).toEqual(diagnostic); expect(Object.isFrozen(bind(failure))).toBe(true);
    expect(Object.isFrozen(failure.detailsFor(schema))).toBe(true); expect(failure.detailsFor({})).toBeUndefined();
    expect(bind(error({}, facts, structuredClone(schema)))).toBeNull();
    expect(bind(error({}, { ...facts, sourceLineId: 'L11' }))).toEqual(diagnostic);
    expect(bind(error({}, { ...facts, sourceLineId: 'L12' }))).toBeNull();
    expect(bindProgressAssessmentLength(failure, undefined, scope, anchors, ['L11'], 'en-US')).toBeNull();
    expect(bindProgressAssessmentLength(failure, schema, scope, { R11: 'L12' }, ['L11'], 'en-US')).toBeNull();
    expect(bindProgressAssessmentLength(failure, schema, scope, {}, ['L11'], 'en-US')).toBeNull();
    expect(bindProgressAssessmentLength(failure, schema, { ...scope, requirements: [] }, anchors, ['L11'], 'en-US')).toBeNull();
    expect(bindProgressAssessmentLength(failure, schema, { ...scope, requirements: [{ id: 'R12', quote: 'Foreign.' }] }, anchors, ['L11'], 'en-US')).toBeNull();
    const unsupported = {};
    expect(bindProgressAssessmentLength(error({}, facts, unsupported), unsupported, scope, anchors, ['L11'], 'en-US')).toBeNull();
});
it.each([
    { requirementId: 'R12' }, { outputLocale: 'es-ES' }, { maximum: 799 }, { field: '$.requirements[1].summary' },
    { field: '$.requirements[0].remaining' }, { outputLocale: undefined }, { private: 'PRIVATE_RAW' },
])('github-communication-experience-change-C172: rejects mismatched carrier details %j', patch => { expect(bind(error(patch))).toBeNull(); });
it.each([
    { ...facts, phase: 'scope', field: '$.lines[0]', requirementId: 'none' }, { ...facts, reason: 'schema-enum' },
])('github-communication-experience-change-C172: preserves foreign phase or reason ownership %j', other => {
    expect(bind(error({}, other as ProgressResponseDiagnosticFacts))).toBeNull();
});
it('github-communication-experience-change-C176: rejects untyped, forged or malformed carriers without echoing input', () => {
    for (const value of [undefined, [], new Error('PRIVATE_RAW schema-string-long'), Object.create(ProgressAssessmentLengthFailure.prototype)]) expect(bind(value)).toBeNull();
    const invalid = error(); Object.defineProperty(invalid, 'facts', { value: { ...facts, private: 'PRIVATE_RAW' } }); expect(bind(invalid)).toBeNull();
    const missing = error(); jest.spyOn(missing, 'detailsFor').mockReturnValue(undefined); expect(bind(missing)).toBeNull();
});
it.each([
    null, [], {}, { ...diagnostic, private: 'PRIVATE_RAW' }, { ...diagnostic, requirementId: 'R0' }, { ...diagnostic, sourceLineId: 'L0' },
    { ...diagnostic, field: '$.requirements[0].status' }, { ...diagnostic, field: '$.requirements[32].summary' },
    { ...diagnostic, maximum: 0 }, { ...diagnostic, maximum: 801 }, { ...diagnostic, maximum: 1.5 }, { ...diagnostic, maximum: '800' },
    { ...diagnostic, observed: 800 }, { ...diagnostic, observed: 801.5 }, { ...diagnostic, observed: '801' }, { ...diagnostic, observed: Infinity },
])('github-communication-experience-change-C176: closes operator diagnostic %j', value => {
    expect(isProgressAssessmentLengthDiagnostic(value)).toBe(false);
    expect(() => progressAssessmentLengthRepairPrompt('Complete evidence.', value as never)).toThrow('diagnostic is invalid');
});
it('github-communication-experience-change-C176: the four native measurements cannot carry presentation metadata', () => {
    const { sourceLineId: _, ...value } = diagnostic;
    expect(isProgressAssessmentLengthFacts(value)).toBe(true); expect(isProgressAssessmentLengthFacts(diagnostic)).toBe(false);
    expect(isProgressAssessmentLengthFacts(null)).toBe(false); expect(isProgressAssessmentLengthFacts([])).toBe(false);
});
it('github-communication-experience-change-C177: maximal closed facts fit the fixed reserve with no runtime padding', () => {
    const largest = { requirementId: 'R524289', sourceLineId: 'L524289', field: '$.requirements[31].remaining', maximum: 800, observed: Number.MAX_SAFE_INTEGER };
    const prompt = progressAssessmentLengthRepairPrompt('Complete evidence.', largest);
    expect(Buffer.byteLength(JSON.stringify(largest))).toBeLessThanOrEqual(256);
    expect(Buffer.byteLength(prompt)).toBeLessThanOrEqual(Buffer.byteLength(reservedProgressAssessmentLengthPrompt('Complete evidence.')));
    expect(prompt).not.toContain(' '.repeat(256)); expect(prompt).not.toContain('PRIVATE_RAW');
});
it('github-communication-experience-change-C178: reserves the larger complete replacement before admitting a query', async () => {
    const prompt = 'Pinned evidence.', available = remainingProgressAssessmentPromptBytes(prompt, schema);
    const full = prompt + 'x'.repeat(available + 1), query = jest.fn();
    expect(remainingProgressPromptBytes(full, 'progress', schema)).toBeGreaterThanOrEqual(0);
    await expect(queryProgressAssessment({ query }, { configuration: undefined, agentId: 'plan', prompt: full, options: { expectJson: true, schema } },
        { scope, anchors, sourceLineIds: ['L11'], targetLocale: 'en-US' })).rejects.toMatchObject({ code: 'validation.evidence-too-large' });
    expect(query).not.toHaveBeenCalled();
});
