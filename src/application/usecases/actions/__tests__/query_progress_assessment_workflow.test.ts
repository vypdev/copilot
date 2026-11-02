import { queryProgressAssessment } from '../query_progress_assessment_workflow';
import * as parser from '../progress_response';
import { ProgressCompletionMismatch } from '../../../errors/progress_completion_mismatch';
import { ApplicationError } from '../../../errors/application_error';
import type { FindingsQueryRequest } from '../../../ports/agent_findings_ports';
import { productFacingAgentQueryOptions } from '../../../policies/agent_output_locale_policy';
import * as logging from '../../../ports/logging_ports';

function fixture() {
    const scope = { requirements: [{ id: 'R1', quote: 'Owned source' }], exclusions: [] };
    const context = { scope, anchors: { R1: 'L1' }, sourceLineIds: ['L1'], targetLocale: 'en-US' };
    const request: FindingsQueryRequest = { configuration: { provider: 'codex', model: 'fixture-model', effort: 'low' },
        agentId: 'plan', prompt: 'Complete unchanged immutable comparison.',
        options: { ...productFacingAgentQueryOptions('progress', parser.progressResponseSchema(scope, context.anchors)), includeReasoning: undefined } };
    const output = (progress = 70) => ({ outputLocale: 'en-US', progress,
        requirements: [{ id: 'R1', status: 'supported', evidence: 'source-only', summary: 'Owned source is present.', remaining: null }] });
    return { scope, context, request, output };
}
const original = () => new ApplicationError('agent.failed', 'Closed host parser mismatch.', { recovery: {
    id: 'progress-result-contract-invalid', variables: { phase: 'assessment', reason: 'progress-completion-mismatch', field: '$.progress', requirementId: 'none', sourceLineId: 'none' },
} });
const diagnostic = { reportedProgress: 70, requirementCount: 1, supportedCount: 1, missingCount: 0, unknownCount: 0 };
afterEach(() => jest.restoreAllMocks());

it('github-communication-experience-change-C140: immutable request and scope snapshots preserve undefined options without freezing caller state', async () => {
    const f = fixture(), shared = { type: 'string', examples: [null, 'value'] };
    f.request.options!.schema!.$defs = { first: shared, second: shared };
    const expected = globalThis.structuredClone(f.request);
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        expect(Object.isFrozen(request)).toBe(query.mock.calls.length === 1);
        expect(Object.isFrozen(request.configuration)).toBe(true);
        expect(Object.isFrozen(request.options)).toBe(true); expect(Object.isFrozen(request.options!.schema)).toBe(true);
        expect(request.configuration).toEqual(expected.configuration); expect(request.options).toEqual(expected.options);
        if (query.mock.calls.length === 1) {
            f.request.configuration!.model = 'changed'; f.request.options!.includeReasoning = true;
            (f.request.options!.schema!.required as string[]).push('PRIVATE_NEW_FIELD'); shared.examples.push('PRIVATE_CHANGED');
            f.scope.requirements[0].id = 'R99'; f.context.anchors.R1 = 'L99'; f.context.sourceLineIds[0] = 'L99'; f.context.targetLocale = 'es-ES';
            return f.output();
        }
        return f.output(100);
    });
    expect((await queryProgressAssessment({ query }, f.request, f.context)).progress).toBe(100);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0].configuration).toBe(query.mock.calls[0][0].configuration);
    expect(query.mock.calls[1][0].options).toBe(query.mock.calls[0][0].options);
    expect(Object.isFrozen(f.request)).toBe(false); expect(Object.isFrozen(f.request.options)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(query.mock.calls[1][0].options, 'includeReasoning')).toBe(true);
    expect(query.mock.calls[1][0].options!.includeReasoning).toBeUndefined();
});
it('github-communication-experience-change-C141: fresh invocation spends a fresh allowance without replaying a previous prompt or estimate', async () => {
    const f = fixture(), query = jest.fn().mockResolvedValueOnce(f.output()).mockResolvedValueOnce(f.output(100))
        .mockResolvedValueOnce(f.output(60)).mockResolvedValueOnce(f.output(100));
    expect((await queryProgressAssessment({ query }, f.request, f.context)).progress).toBe(100);
    expect((await queryProgressAssessment({ query }, f.request, f.context)).progress).toBe(100);
    expect(query).toHaveBeenCalledTimes(4); expect(query.mock.calls[2][0].prompt).toBe(f.request.prompt);
    expect(query.mock.calls[3][0].prompt).toContain('"reportedProgress":60');
});
it.each([
    ['github-communication-experience-change-C142', 'provider.unavailable'],
    ['github-communication-experience-change-C143', 'workflow.cancelled'],
] as const)('%s: replacement %s retains identity and never starts a third query', async (_id, code) => {
    const f = fixture(), error = new ApplicationError(code, 'A classified query failure.'),
        query = jest.fn().mockResolvedValueOnce(f.output()).mockRejectedValueOnce(error);
    await expect(queryProgressAssessment({ query }, f.request, f.context)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(2);
});
it('github-communication-experience-change-C144: a provider-thrown typed mismatch cannot enter the parse-only recovery path', async () => {
    const f = fixture(), error = new ProgressCompletionMismatch(original(), diagnostic, f.scope), query = jest.fn().mockRejectedValue(error);
    await expect(queryProgressAssessment({ query }, f.request, f.context)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
});
it('github-communication-experience-change-C163: the intermediate log is one fixed bounded message without caught values or rejected prose', async () => {
    const f = fixture(), first = f.output(); first.requirements[0].summary = 'PRIVATE_REJECTED @all /copilot deploy';
    const query = jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(f.output(100));
    const log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
    await queryProgressAssessment({ query }, f.request, f.context);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Reassessing one inconsistent completed progress estimate using the same complete pinned evidence. Previous progress is retained.');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE_|@all|reportedProgress/u);
    expect(query.mock.calls[1][0].prompt).not.toContain('PRIVATE_REJECTED');
    expect(query.mock.calls[1][0].prompt).not.toContain(' '.repeat(256));
});
it.each(['foreign identity', 'foreign total'] as const)('rejects host-parser contract fault with %s without allocating a replacement', async mode => {
    const f = fixture(), query = jest.fn().mockResolvedValue(f.output()); let thrown: ProgressCompletionMismatch | undefined;
    jest.spyOn(parser, 'parseProgressResponse').mockImplementationOnce((_response, _locale, scope) => {
        thrown = new ProgressCompletionMismatch(original(), mode === 'foreign total' ? { ...diagnostic, requirementCount: 2, supportedCount: 2 } : diagnostic,
            mode === 'foreign identity' ? {} : scope);
        throw thrown;
    });
    await expect(queryProgressAssessment({ query }, f.request, f.context)).rejects.toBeInstanceOf(ProgressCompletionMismatch);
    expect(query).toHaveBeenCalledTimes(1); expect(JSON.stringify(thrown)).not.toContain('reportedProgress');
});
it.each(['missing options', 'missing schema', 'not JSON'] as const)('rejects %s before querying an unsupported final task', async mode => {
    const f = fixture(), query = jest.fn();
    if (mode === 'missing options') f.request.options = undefined;
    if (mode === 'missing schema') f.request.options!.schema = undefined;
    if (mode === 'not JSON') f.request.options!.expectJson = false;
    await expect(queryProgressAssessment({ query }, f.request, f.context)).rejects.toMatchObject({ code: 'configuration.unsupported' });
    expect(query).not.toHaveBeenCalled();
});
