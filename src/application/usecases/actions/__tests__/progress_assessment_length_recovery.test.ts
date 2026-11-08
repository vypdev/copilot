import { queryProgressAssessment } from '../query_progress_assessment_workflow';
import { progressResponseSchema } from '../progress_response';
import { productFacingAgentQueryOptions } from '../../../policies/agent_output_locale_policy';
import { interpretProgressAgentOutput } from '../../../../data/repository/progress_agent_response_policy';
import type { FindingsQueryRequest } from '../../../ports/agent_findings_ports';
import { ApplicationError } from '../../../errors/application_error';
import * as logging from '../../../ports/logging_ports';
import { assessmentWireFixture } from './fixtures/progress_assessment_wire_fixture';

afterEach(() => jest.restoreAllMocks());

function fixture(field: 'summary' | 'remaining') {
    const scope = { requirements: [{ id: 'R11', quote: 'First original requirement.' }, { id: 'R12', quote: 'Second original requirement.' }], exclusions: [] };
    const context = { scope, anchors: { R11: 'L11', R12: 'L12' }, sourceLineIds: ['L11', 'L12'], targetLocale: 'en-US' };
    const request: FindingsQueryRequest = { agentId: 'plan', prompt: 'Complete same-head source and all requirements.',
        configuration: { provider: 'codex', model: 'fixture-model', effort: 'low' },
        options: { ...productFacingAgentQueryOptions('progress', progressResponseSchema(scope, context.anchors)) } };
    const output = () => ({ outputLocale: 'en-US', progress: field === 'remaining' ? 50 : 100, requirements: scope.requirements.map((requirement, index) => ({
        id: requirement.id, status: field === 'remaining' && index === 0 ? 'missing' : 'supported',
        evidence: field === 'remaining' && index === 0 ? 'contradictory' : 'source-only',
        summary: 'The complete pinned source was inspected.', remaining: field === 'remaining' && index === 0 ? 'The requirement is still missing.' : null as string | null,
    })) });
    const interpret = (actualRequest: FindingsQueryRequest, response: ReturnType<typeof output>) => interpretProgressAgentOutput(
        JSON.stringify(assessmentWireFixture(response, actualRequest.options!.schema!, scope.requirements.filter(r => 'uncertain' in r && r.uncertain === true).map(r => r.id))),
        'assessment', actualRequest.options!.schema!);
    return { request, context, output, interpret };
}

it.each([
    ['github-communication-experience-change-C165', 'summary'],
    ['github-communication-experience-change-C166', 'remaining'],
] as const)('%s: one native %s length rejection receives a complete bounded closed-fact replacement', async (_id, field) => {
    const f = fixture(field), first = f.output(); first.requirements[0][field] = 'PRIVATE_REJECTED_' + '🧪'.repeat(801);
    const query = jest.fn(async (request: FindingsQueryRequest): Promise<Record<string, unknown>> => f.interpret(request,
        query.mock.calls.length === 1 ? first : f.output()));
    const result = await queryProgressAssessment({ query }, f.request, f.context);
    expect(result.progress).toBe(field === 'remaining' ? 50 : 100);
    expect(query).toHaveBeenCalledTimes(2);
    const firstSchema = query.mock.calls[0][0].options!.schema as ReturnType<typeof progressResponseSchema>;
    const nextSchema = query.mock.calls[1][0].options!.schema as ReturnType<typeof progressResponseSchema>;
    expect(nextSchema.properties.requirements.items.properties.id).toBe(firstSchema.properties.requirements.items.properties.id);
    expect(nextSchema.properties.requirements.items.properties).toHaveProperty('assessment');
    expect(query.mock.calls[1][0].configuration).toBe(query.mock.calls[0][0].configuration);
    expect(query.mock.calls[1][0].prompt).toContain('R11');
    expect(query.mock.calls[1][0].prompt).toContain('L11');
    expect(query.mock.calls[1][0].prompt).not.toContain('PRIVATE_REJECTED_');
});

it.each([
    ['github-communication-experience-change-C168', 'length-length'],
    ['github-communication-experience-change-C169', 'length-completion'],
    ['github-communication-experience-change-C170', 'completion-length'],
] as const)(
    '%s: %s shares one allowance and exposes only the terminal safe facts', async (_id, mode) => {
        const f = fixture('summary');
        if (mode === 'length-length') {
            // The tiny legacy profile cannot fit the closed label catalog and retains its old repair path.
            const schema = f.request.options!.schema as ReturnType<typeof progressResponseSchema>;
            Object.assign(schema.properties.requirements.items.properties.summary, { maxLength: 8 });
            Object.assign(schema.properties.requirements.items.properties.remaining, { maxLength: 8 });
        }
        const query = jest.fn(async (request: FindingsQueryRequest) => {
            const response = f.output(), second = query.mock.calls.length === 2;
            if (mode === 'length-length') response.requirements.forEach(fact => { fact.summary = 'OK'; });
            if (mode === 'length-completion' && second || mode === 'completion-length' && !second) response.progress = 70;
            else response.requirements[second ? 1 : 0].summary = 'PRIVATE_REJECTED_' + '🧪'.repeat(second ? 900 : 801);
            return f.interpret(request, response);
        });
        const failure = await queryProgressAssessment({ query }, f.request, f.context).catch(error => error as ApplicationError);
        expect(failure).toBeInstanceOf(ApplicationError); expect(query).toHaveBeenCalledTimes(2);
        expect((failure as ApplicationError).recovery).toMatchObject(mode === 'length-completion'
            ? { id: 'progress-completion-recovery-exhausted', variables: { reportedProgress: 70 } }
            : { id: 'progress-assessment-length-invalid', variables: { requirementId: 'R12', sourceLineId: 'L12', field: '$.requirements[1].summary', maximum: mode === 'length-length' ? 8 : 800, observed: 917 } });
        expect(JSON.stringify(failure)).not.toContain('PRIVATE_REJECTED_');
    });

it('github-communication-experience-change-C166: replacing remaining length preserves host uncertainty and partial progress', async () => {
    const f = fixture('remaining'), valid = f.output();
    Object.assign(f.context.scope.requirements[0], { uncertain: true });
    valid.requirements[0].status = 'verification-unknown'; valid.requirements[0].evidence = 'external-unverified';
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const response = structuredClone(valid);
        if (query.mock.calls.length === 1) response.requirements[0].remaining = '🧪'.repeat(801);
        return f.interpret(request, response);
    });
    const result = await queryProgressAssessment({ query }, f.request, f.context);
    expect(result).toMatchObject({ progress: 50, remaining: expect.stringContaining('[R11]') });
    expect(query).toHaveBeenCalledTimes(2);
});

it.each(['provider.unavailable', 'workflow.cancelled'] as const)(
    'github-communication-experience-change-C171: length replacement %s retains its original identity', async code => {
        const f = fixture('summary'), failure = new ApplicationError(code, 'Original classified failure.');
        const query = jest.fn(async (request: FindingsQueryRequest) => {
            if (query.mock.calls.length === 2) throw failure;
            const response = f.output(); response.requirements[0].summary = 's'.repeat(801);
            return f.interpret(request, response);
        });
        await expect(queryProgressAssessment({ query }, f.request, f.context)).rejects.toBe(failure);
        expect(query).toHaveBeenCalledTimes(2);
    });

it('github-communication-experience-change-C173: length recovery uses captured state despite caller mutation', async () => {
    const f = fixture('summary'), expected = structuredClone(f.request), valid = f.output();
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        if (query.mock.calls.length === 1) expect(request.options).toEqual(expected.options);
        else expect(request.options!.schema).toHaveProperty('properties.requirements.items.properties.assessment');
        expect(request.configuration).toEqual(expected.configuration);
        if (query.mock.calls.length === 1) {
            f.request.configuration!.model = 'foreign'; f.context.scope.requirements[0].id = 'R99';
            f.context.anchors.R11 = 'L99'; f.context.sourceLineIds[0] = 'L99'; f.context.targetLocale = 'es-ES';
            f.request.options!.schema = {}; const response = structuredClone(valid); response.requirements[0].summary = 's'.repeat(801);
            return f.interpret(request, response);
        }
        return f.interpret(request, valid);
    });
    expect((await queryProgressAssessment({ query }, f.request, f.context)).progress).toBe(100);
    expect(query.mock.calls[1][0].prompt).toContain('L11'); expect(Object.isFrozen(f.request)).toBe(false);
});

it('github-communication-experience-change-C174: returned order selects the actual requirement rather than the host array index', async () => {
    const f = fixture('summary');
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const response = f.output(); response.requirements.reverse();
        if (query.mock.calls.length === 1) response.requirements[0].summary = 's'.repeat(801);
        return f.interpret(request, response);
    });
    expect((await queryProgressAssessment({ query }, f.request, f.context)).progress).toBe(100);
    expect(query.mock.calls[1][0].prompt).toContain('"requirementId":"R12"');
    expect(query.mock.calls[1][0].prompt).toContain('"sourceLineId":"L12"');
});

it('github-communication-experience-change-C183: length recovery logs one fixed message and never submits reserve padding', async () => {
    const f = fixture('summary'), log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const response = f.output(); if (query.mock.calls.length === 1) response.requirements[0].summary = 'PRIVATE_@all /copilot deploy' + 's'.repeat(801);
        return f.interpret(request, response);
    });
    await queryProgressAssessment({ query }, f.request, f.context);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('A progress acceptance fact exceeded its unchanged response limit. Requesting one complete replacement for the same pinned batch; previous progress is retained.');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE_|@all|R11/u);
    expect(query.mock.calls[1][0].prompt).not.toContain(' '.repeat(256));
});
