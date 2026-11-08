import { queryProgressAssessment } from '../query_progress_assessment_workflow';
import { captureProgressScopeSource } from '../../../policies/progress_scope_source_policy';
import { parseProgressScopeWithAnchors } from '../../../policies/progress_scope_policy';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import { createProgressScopeManifest, planProgressAssessmentBatches, progressBatchResponseSchema,
    progressBatchDisplayScope, readProgressAssessmentEvidence, parseProgressAssessmentReceipt, PROGRESS_BATCH_PROFILE } from '../../../policies/progress_batch_policy';
import { productFacingAgentQueryOptions } from '../../../policies/agent_output_locale_policy';
import { interpretProgressAgentOutput } from '../../../../data/repository/progress_agent_response_policy';
import type { FindingsQueryRequest } from '../../../ports/agent_findings_ports';
import { assessmentWireFixture } from './fixtures/progress_assessment_wire_fixture';
import { ApplicationError } from '../../../errors/application_error';
import { progressCitationRepetitionError, bindProgressCitationRepetition, progressCitationRepairPrompt,
    reservedProgressCitationPrompt, PROGRESS_CITATION_HINT_MAX_BYTES, hasProgressCitationsSchema } from '../../../policies/progress_citation_recovery_policy';
import { isProgressCitationRepetitionDiagnostic } from '../../../../domain/progress_citation_repetition';
import { remainingProgressAssessmentPromptBytes } from '../../../policies/progress_prompt_capacity_policy';
import { boundProgressBatchAgent } from '../../../policies/progress_batch_query_policy';
import { compactProgressAssessmentPlan } from '../../../policies/progress_compact_assessment_policy';
import { buildApplicationErrorPresentation } from '../../../policies/application_error_presentation_policy';
import * as logging from '../../../ports/logging_ports';

afterEach(() => jest.restoreAllMocks());
const thrown = (action: () => unknown): unknown => { try { action(); } catch (error) { return error; } throw Error('Expected rejection.'); };
const facts = { requirementId: 'R1', sourceLineId: 'L1', batch: 1, citationCount: 3, distinctCount: 2 };
const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
    return value;
};

type Profile = 'prose' | 'closed';
type Row = Record<string, unknown> & { id: string; status: string; evidence: string; summary: string; remaining: string | null; citations: string[] };
function fixture(profile: Profile) {
    const body = 'First original obligation.\nSecond original obligation.';
    const source = captureProgressScopeSource(body), classifications = source.lines.map(line => ({ id: line.id, kind: 'required' }));
    const extraction = parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines: classifications }, source, 'en-US', PROGRESS_BATCH_PROFILE);
    const base = 'a'.repeat(40), head = 'b'.repeat(40), compact = profile === 'closed';
    const diff = partitionProgressDiff(base, head, ['src/first.ts', 'src/second.ts'].map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: '+source' })));
    const manifest = createProgressScopeManifest({ capturedSource: source, classifications, repository: 'owner/repo', issueNumber: 944,
        issueDescription: body, comparisonSource: { kind: 'development', baseBranch: 'develop' }, baseSha: base, headSha: head, scope: extraction.scope }, diff);
    const batch = planProgressAssessmentBatches(manifest)[0], schema = progressBatchResponseSchema(manifest, batch, extraction.anchors, compact);
    const context = { scope: structuredClone(progressBatchDisplayScope(batch, compact)), anchors: structuredClone(extraction.anchors),
        sourceLineIds: source.lines.map(line => line.id), targetLocale: 'en-US', preferCompactFacts: compact };
    const request: FindingsQueryRequest = { agentId: 'plan', prompt: 'Complete pinned comparison; preserve every original obligation and admitted source reference.',
        configuration: { provider: 'codex', model: 'fixture-model', effort: 'low' }, options: { ...productFacingAgentQueryOptions('progress', schema) } };
    const references = manifest.evidence.filter(reference => !reference.generated).map(reference => reference.id);
    const output = (repeated = false) => ({ outputLocale: 'en-US', progress: 50, manifestDigest: manifest.digest, batchId: batch.id, headSha: head,
        requirements: batch.scope.requirements.map((requirement, index): Row => ({ id: requirement.id, status: 'verification-unknown', evidence: 'source-only',
            summary: 'The original source was inspected.', remaining: 'Execution remains unverified.',
            citations: index === 0 ? repeated ? [references[0], references[0], references[1]] : [...references] : [references[1]] })) });
    const interpret = (actual: FindingsQueryRequest, response: ReturnType<typeof output>) => interpretProgressAgentOutput(
        JSON.stringify(assessmentWireFixture(response, actual.options!.schema!)), 'assessment', actual.options!.schema!);
    let accepted: unknown;
    const project = (response: Parameters<typeof readProgressAssessmentEvidence>[0], requestSchema?: Record<string, unknown>) => {
        const result = readProgressAssessmentEvidence(response, manifest, batch, 'en-US', extraction.anchors, compact, requestSchema);
        accepted = response;
        return result.payload;
    };
    const receipt = () => parseProgressAssessmentReceipt(accepted, manifest, batch, extraction.anchors, 'en-US', compact);
    return { request, context, output, interpret, project, receipt, schema, manifest, batch, extraction, references };
}

it.each(['prose', 'closed'] as const)('inventory1-C01: a native %s duplicate receives one complete same-profile correction', async profile => {
    const f = fixture(profile);
    const query = jest.fn(async (request: FindingsQueryRequest): Promise<Record<string, unknown>> => f.interpret(request, f.output(query.mock.calls.length === 1)));
    const result = await queryProgressAssessment({ query }, f.request, f.context, f.project);
    expect(result.progress).toBe(50);
    expect(query).toHaveBeenCalledTimes(2);
    const [first, second] = query.mock.calls.map(([request]) => request);
    expect(second.options).toEqual(first.options);
    expect(second.configuration).toBe(first.configuration);
    expect(second.prompt.startsWith(first.prompt)).toBe(true);
    expect(second.prompt).toContain('"requirementId":"R1"');
    expect(second.prompt).toContain('"sourceLineId":"L1"');
    expect(f.receipt()).toMatchObject({ requirementIds: ['R1', 'R2'], citations: [f.references, [f.references[1]]] });
});

it.each(['prose', 'closed'] as const)('inventory1-C02: a unique native %s receipt keeps its ordinary one-query path', async profile => {
    const f = fixture(profile), query = jest.fn(async (request: FindingsQueryRequest) => f.interpret(request, f.output()));
    expect((await queryProgressAssessment({ query }, f.request, f.context, f.project)).progress).toBe(50);
    expect(query).toHaveBeenCalledTimes(1);
    expect(f.receipt().requirementIds).toEqual(['R1', 'R2']);
});

it.each(['prose', 'closed'] as const)('inventory1-C03: a second %s repetition is terminal, content-free and never silently deduplicated', async profile => {
    const f = fixture(profile), query = jest.fn(async (request: FindingsQueryRequest) => f.interpret(request, f.output(true)));
    const error = await queryProgressAssessment({ query }, f.request, f.context, f.project).catch(error => error);
    expect(query).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({ code: 'validation.evidence-unavailable', retryable: false,
        recovery: { id: 'progress-batch-retained', variables: { reason: 'evidence-duplicate', batch: 1, requirementId: 'R1' } } });
    expect(JSON.stringify(error)).not.toContain(f.references[0]);
    expect(() => f.receipt()).toThrow();
    expect(bindProgressCitationRepetition(error, query.mock.calls[1][0].options!.schema, f.context.scope, f.context.anchors, ['L1', 'L2'], 'en-US')).toBeNull();
});

it.each(['duplicate-completion', 'completion-duplicate', 'length-duplicate', 'duplicate-length'] as const)(
    'inventory1-C04: %s consumes the same single replacement allowance', async mode => {
        const f = fixture('prose');
        const query = jest.fn(async (request: FindingsQueryRequest) => {
            const first = query.mock.calls.length === 1;
            const response = f.output(mode.startsWith('duplicate-') ? first : !first);
            if (mode === 'duplicate-completion' && !first || mode === 'completion-duplicate' && first) response.progress = 100;
            if (mode === 'length-duplicate' && first) response.requirements[0].summary = 'PRIVATE_' + 'x'.repeat(801);
            if (mode === 'duplicate-length' && !first) response.requirements[0].summary = 'PRIVATE_' + 'x'.repeat(801);
            return f.interpret(request, response);
        });
        const error = await queryProgressAssessment({ query }, f.request, f.context, f.project).catch(error => error);
        expect(query).toHaveBeenCalledTimes(2);
        expect(error).toMatchObject(mode === 'duplicate-completion'
            ? { code: 'agent.failed', recovery: { id: 'progress-completion-recovery-exhausted' } }
            : mode === 'duplicate-length' ? { retryable: false, recovery: { id: 'progress-assessment-length-invalid' } }
            : { retryable: false, recovery: { variables: { reason: 'evidence-duplicate' } } });
        expect(JSON.stringify(error)).not.toContain('PRIVATE_');
    });

it('inventory1-C05: other missing, foreign, stale, generated or malformed evidence never acquires citation correction authority', async () => {
    for (const mode of ['empty', 'foreign', 'stale', 'generated', 'malformed', 'wrong-head', 'wrong-batch', 'wrong-manifest', 'missing-row', 'missing-array']) {
        const f = fixture('prose');
        let manifest = f.manifest;
        if (mode === 'stale' || mode === 'generated') manifest = { ...manifest, evidence: manifest.evidence.map(reference =>
            reference.id === f.references[1] ? { ...reference, ...(mode === 'stale' ? { headSha: 'c'.repeat(40) } : { generated: true }) } : reference) };
        const query = jest.fn(async () => {
            const response = f.output(true);
            if (mode === 'empty') response.requirements[1].citations = [];
            if (mode === 'foreign') response.requirements[1].citations = ['PRIVATE_FOREIGN'];
            if (mode === 'malformed') Object.assign(response.requirements[1], { citations: 42 });
            if (mode === 'wrong-head') response.headSha = 'c'.repeat(40);
            if (mode === 'wrong-batch') response.batchId = 'PRIVATE_BATCH';
            if (mode === 'wrong-manifest') response.manifestDigest = 'PRIVATE_DIGEST';
            if (mode === 'missing-row') response.requirements.pop();
            if (mode === 'missing-array') Object.assign(response, { requirements: null });
            return response;
        });
        // Bypass the adapter here to also test the receipt trust boundary against an untrusted port.
        const error = await queryProgressAssessment({ query }, f.request, f.context, (response, schema) =>
            readProgressAssessmentEvidence(response, manifest, f.batch, 'en-US', f.extraction.anchors, false, schema).payload).catch(error => error);
        expect(error).toBeInstanceOf(ApplicationError); expect(query).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(error)).not.toMatch(/PRIVATE_/u);
    }
});

it('inventory1-C06: plain, serialized, previous-invocation and provider-thrown carriers cannot allocate a correction', async () => {
    const f = fixture('prose'), schema = freeze(structuredClone(f.schema));
    const native = thrown(() => readProgressAssessmentEvidence(f.output(true), f.manifest, f.batch, 'en-US', f.extraction.anchors, false, schema));
    expect(bindProgressCitationRepetition(native, schema, f.context.scope, f.context.anchors, ['L1', 'L2'], 'en-US')).toEqual(facts);
    const plain = new ApplicationError('validation.evidence-unavailable', 'Forged.', { recovery: { id: 'progress-batch-retained',
        variables: { reason: 'evidence-duplicate', verified: 0, expected: 0, batch: 1, requirementId: 'R1' } } });
    for (const error of [plain, JSON.parse(JSON.stringify(native)), native, null]) {
        const query = jest.fn(async () => { throw error; });
        await expect(queryProgressAssessment({ query }, f.request, f.context, f.project)).rejects.toBeDefined();
        expect(query).toHaveBeenCalledTimes(1);
    }
    const query = jest.fn(async (request: FindingsQueryRequest) => f.interpret(request, f.output()));
    await expect(queryProgressAssessment({ query }, f.request, f.context, () => { throw native; })).rejects.toBe(native);
    expect(query).toHaveBeenCalledTimes(1);
    expect(bindProgressCitationRepetition(native, freeze(structuredClone(schema)), f.context.scope, f.context.anchors, ['L1', 'L2'], 'en-US')).toBeNull();
});

it('inventory1-C07: simultaneous completion, semantic, locale and coverage defects cannot use repetition recovery', async () => {
    for (const mode of ['completion', 'remaining', 'status', 'locale', 'ids', 'extra', 'length']) {
        const f = fixture('prose'), query = jest.fn(async (request: FindingsQueryRequest) => {
            const response = f.output(true);
            if (mode === 'completion') response.progress = 100;
            if (mode === 'remaining') response.requirements[1].remaining = null;
            if (mode === 'status') response.requirements[1].status = 'invented';
            if (mode === 'locale') response.outputLocale = 'es-ES';
            if (mode === 'ids') response.requirements[1].id = 'R1';
            if (mode === 'extra') response.requirements[1].unexpected = 'PRIVATE_';
            if (mode === 'length') response.requirements[1].summary = 'x'.repeat(801);
            return f.interpret(request, response);
        });
        await expect(queryProgressAssessment({ query }, f.request, f.context, f.project)).rejects.toBeDefined();
        expect(query).toHaveBeenCalledTimes(1);
    }
});

it('inventory1-C08: only the frozen complete current contract and closed bounded diagnostic can mint a native origin', () => {
    const f = fixture('prose'), schema = freeze(structuredClone(f.schema));
    const mint = (candidate: unknown, actual: Record<string, unknown> | undefined = schema, canonical: Record<string, unknown> = f.schema) =>
        progressCitationRepetitionError(canonical, f.context.scope, f.context.anchors, 'en-US', candidate as typeof facts, actual);
    const bind = (error: unknown, actual: Record<string, unknown> = schema, scope = f.context.scope, anchors = f.context.anchors, lines = ['L1', 'L2'], locale = 'en-US') =>
        bindProgressCitationRepetition(error, actual, scope, anchors, lines, locale);
    const valid = mint(facts); expect(bind(valid)).toEqual(facts);
    expect(bind(valid, schema, f.context.scope, f.context.anchors, ['L2'])).toBeNull();
    expect(bind(valid, schema, f.context.scope, f.context.anchors, ['L1'], 'es-ES')).toBeNull();
    expect(bind(valid, schema, { ...f.context.scope, exclusions: [{ id: 'R3', quote: 'different' }] })).toBeNull();
    expect(bind(valid, schema, f.context.scope, { ...f.context.anchors, R1: 'L2' })).toBeNull();
    for (const candidate of [null, [], {}, { ...facts, extra: 'PRIVATE_' }, { ...facts, requirementId: 'PRIVATE_' }, { ...facts, sourceLineId: 'L0' },
        ...[0, 1025, 1.5].map(batch => ({ ...facts, batch })), ...[1, 9, 2.5].map(citationCount => ({ ...facts, citationCount })),
        ...[0, 3, 1.5].map(distinctCount => ({ ...facts, distinctCount }))]) {
        expect(isProgressCitationRepetitionDiagnostic(candidate)).toBe(false); expect(bind(mint(candidate))).toBeNull();
        expect(() => progressCitationRepairPrompt('', candidate as typeof facts)).toThrow(TypeError);
    }
    expect(bind(progressCitationRepetitionError(f.schema, f.context.scope, f.context.anchors, 'en-US', facts))).toBeNull();
    expect(bind(mint(facts, structuredClone(schema)))).toBeNull();
    expect(bind(mint(facts, freeze({ ...schema, title: 'changed' })))).toBeNull();
    expect(bind(mint(facts, schema, { properties: { callable: () => undefined } }))).toBeNull();
    expect(bind(mint(facts, schema, {}))).toBeNull();
    const unanchored = thrown(() => readProgressAssessmentEvidence(f.output(true), f.manifest, f.batch, 'en-US', {}, false, schema));
    expect(bind(unanchored)).toBeNull();
    expect(bind(undefined)).toBeNull(); expect(bind(1)).toBeNull();
    const closed = freeze(structuredClone(compactProgressAssessmentPlan(f.schema, 'en-US')!.schema));
    expect(bind(mint(facts, closed), closed)).toEqual(facts);
    expect(Object.isFrozen(f.schema)).toBe(false);
});

it('inventory1-C09: correction uses immutable invocation snapshots despite caller mutation', async () => {
    const f = fixture('prose'), original = structuredClone(f.request);
    const query = jest.fn(async (request: FindingsQueryRequest): Promise<Record<string, unknown>> => {
        expect(request.configuration).toEqual(original.configuration);
        expect(request.options).toEqual(original.options);
        if (query.mock.calls.length === 1) {
            f.request.configuration!.model = 'foreign'; f.request.options!.schema = {};
            Object.assign(f.context.scope.requirements[0], { id: 'R99' }); Object.assign(f.context.anchors, { R1: 'L99' });
            f.context.sourceLineIds[0] = 'L99'; f.context.targetLocale = 'es-ES';
        }
        return f.interpret(request, f.output(query.mock.calls.length === 1));
    });
    expect((await queryProgressAssessment({ query }, f.request, f.context, f.project)).progress).toBe(50);
    expect(query).toHaveBeenCalledTimes(2); expect(query.mock.calls[1][0].prompt).toContain('"sourceLineId":"L1"');
    expect(Object.isFrozen(f.request)).toBe(false); expect(Object.isFrozen(query.mock.calls[1][0])).toBe(true);
});

it('inventory1-C10: full correction capacity is reserved before querying and diagnostics never carry source prose or citations', async () => {
    const f = fixture('prose'), log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
    const largest = { requirementId: 'R524289', sourceLineId: 'L524289', batch: 1024, citationCount: 8, distinctCount: 7 };
    expect(Buffer.byteLength(JSON.stringify(largest))).toBeLessThanOrEqual(PROGRESS_CITATION_HINT_MAX_BYTES);
    expect(Buffer.byteLength(progressCitationRepairPrompt('prompt', largest))).toBeLessThanOrEqual(Buffer.byteLength(reservedProgressCitationPrompt('prompt')));
    expect(hasProgressCitationsSchema({})).toBe(false); expect(hasProgressCitationsSchema({ properties: [] })).toBe(false);
    expect(hasProgressCitationsSchema(f.schema)).toBe(true);
    const query = jest.fn(async (request: FindingsQueryRequest) => f.interpret(request, f.output(true)));
    const error = await queryProgressAssessment({ query }, f.request, f.context, f.project).catch(error => error);
    expect(log).toHaveBeenCalledTimes(1); expect(JSON.stringify(log.mock.calls)).not.toMatch(/R1|L1|original obligation|source-/u);
    expect(query.mock.calls[1][0].prompt).not.toContain(' '.repeat(PROGRESS_CITATION_HINT_MAX_BYTES));
    const presentation = buildApplicationErrorPresentation(error);
    expect(presentation.retryable).toBe('No'); expect(presentation.action).toContain('evidence-duplicate');
    const remaining = remainingProgressAssessmentPromptBytes('', f.schema);
    const legacy = structuredClone(f.schema);
    legacy.properties.requirements.items.properties.summary.maxLength = 8;
    expect(remainingProgressAssessmentPromptBytes('', legacy)).toBeGreaterThan(0);
    f.request.prompt = 'x'.repeat(remaining + 1); const never = jest.fn();
    await expect(queryProgressAssessment({ query: never }, f.request, f.context, f.project)).rejects.toMatchObject({ code: 'validation.evidence-too-large' });
    expect(never).not.toHaveBeenCalled();
});

it('inventory1-C14: correction shares global call/time ceilings and retains provider and cancellation failures', async () => {
    for (const mode of ['call', 'time', 'provider', 'cancelled']) {
        const f = fixture('prose'); let time = 0;
        const classified = new ApplicationError(mode === 'cancelled' ? 'workflow.cancelled' : 'provider.unavailable', 'Original classification.');
        const query = jest.fn(async (request: FindingsQueryRequest) => {
            if (mode === 'call' && query.mock.calls.length < 120) return {};
            if ((mode === 'provider' || mode === 'cancelled') && query.mock.calls.length === 2) throw classified;
            const result = f.interpret(request, f.output(true));
            if (mode === 'time') time = PROGRESS_BATCH_PROFILE.milliseconds + 1;
            return result;
        });
        const bounded = boundProgressBatchAgent({ query }, () => time);
        if (mode === 'call') for (let index = 0; index < 119; index++) await bounded.agent.query(f.request);
        const error = await queryProgressAssessment(bounded.agent, f.request, f.context, f.project).catch(error => error);
        if (mode === 'call' || mode === 'time') expect(error).toMatchObject({ recovery: { variables: { reason: mode + '-budget' } } });
        else expect(error).toBe(classified);
        expect(query).toHaveBeenCalledTimes(mode === 'call' ? 120 : mode === 'time' ? 1 : 2);
    }
});
