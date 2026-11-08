import { compactProgressAssessmentPlan, compactProgressAssessmentPrompt, decodeCompactProgressAssessment,
    reservedCompactProgressAssessmentPrompt, COMPACT_PROGRESS_HINT_MAX_BYTES } from '../progress_compact_assessment_policy';
import { scopedProgressResponseSchema, parseScopedProgressResponse } from '../progress_scope_policy';
import { assertAgentResponseSchema } from '../../../data/repository/agent_json_schema_validator';
import { projectCodexOutputSchema } from '../agent_execution/codex_output_schema_policy';

function fixture(locale = 'en-US') {
    const scope = { requirements: [{ id: 'R11', quote: 'First complete source' }, { id: 'R12', quote: 'Second complete source' }], exclusions: [] };
    const anchors = { R11: 'L11', R12: 'L12' };
    const schema = scopedProgressResponseSchema(scope, anchors), fields = schema.properties.requirements.items.properties;
    const withFields = (replacement: Record<string, unknown>) => ({ ...schema, properties: { ...schema.properties,
        requirements: { ...schema.properties.requirements, items: { ...schema.properties.requirements.items, properties: replacement, required: Object.keys(replacement) } } } });
    const plan = compactProgressAssessmentPlan(schema, locale)!;
    const response = (first: Record<string, unknown> = {}) => ({ outputLocale: locale, progress: 50,
        requirements: scope.requirements.map((r, i) => ({ id: r.id, assessment: 'execution-unverified', ...(i === 0 ? first : {}) })) });
    const decode = (value: unknown = response()) => decodeCompactProgressAssessment(value, plan, scope, anchors);
    return { scope, anchors, schema, fields, withFields, plan, response, decode };
}

it('github-communication-experience-change-C190: keeps the original full acceptance schema and binds a separate finite native shape', () => {
    const f = fixture(), before = structuredClone(f.schema), p = f.plan.schema.properties as typeof f.schema.properties;
    expect(f.plan.sourceSchema).toBe(f.schema); expect(f.schema).toEqual(before);
    const fields = p.requirements.items.properties as unknown as Record<string, unknown>;
    expect(fields).not.toHaveProperty('summary'); expect(fields).not.toHaveProperty('remaining');
    expect(fields.id).toBe(f.fields.id);
    expect(projectCodexOutputSchema(f.plan.schema)).toMatchObject({ properties: { requirements: { items: { properties: {
        assessment: { enum: ['supported', 'partial', 'missing', 'contradictory', 'source-unverified', 'partial-unverified', 'execution-unverified', 'evidence-unavailable', 'evidence-contradictory', 'scope-unclear'] },
    } } } } });
});

it('github-communication-experience-change-C191: host labels satisfy the original nine-point allocation without trimming or generative prose', () => {
    const f = fixture(), schema = f.withFields({ ...f.fields, summary: { ...f.fields.summary, maxLength: 9 }, remaining: { ...f.fields.remaining, maxLength: 9 } });
    const plan = compactProgressAssessmentPlan(schema, 'en-US')!;
    const expected = {
        supported: ['supported', 'source-only', 'In source', null],
        partial: ['missing', 'source-only', 'Partial', 'Implement'],
        missing: ['missing', 'source-only', 'Missing', 'Implement'],
        contradictory: ['missing', 'contradictory', 'Missing', 'Implement'],
        'source-unverified': ['verification-unknown', 'source-only', 'In source', 'Verify'],
        'partial-unverified': ['verification-unknown', 'source-only', 'Partial', 'Verify'],
        'execution-unverified': ['verification-unknown', 'external-unverified', 'Unclear', 'Verify'],
        'evidence-unavailable': ['verification-unknown', 'unavailable', 'Unclear', 'Get proof'],
        'evidence-contradictory': ['verification-unknown', 'contradictory', 'Unclear', 'Clarify'],
        'scope-unclear': ['verification-unknown', 'unavailable', 'Unclear', 'Clarify'],
    };
    for (const [assessment, [status, evidence, summary, remaining]] of Object.entries(expected)) {
        const decoded = decodeCompactProgressAssessment(f.response({ assessment }), plan, f.scope, f.anchors);
        expect(decoded).toMatchObject({ requirements: [{ status, evidence, summary, remaining }, expect.any(Object)] });
        assertAgentResponseSchema(decoded, schema);
        expect(JSON.stringify(decoded)).not.toMatch(/assessment/u);
    }
});

it('github-communication-experience-change-C192: Spanish and regional Spanish render the same complete bounded labels', () => {
    for (const locale of ['es-ES', 'es-MX']) {
        const f = fixture(locale), decoded = f.decode(f.response({ assessment: 'source-unverified' }));
        expect(decoded).toMatchObject({ outputLocale: locale, requirements: [{ summary: 'En código', remaining: 'Verificar' }, { summary: 'Sin datos', remaining: 'Verificar' }] });
        assertAgentResponseSchema(decoded, f.schema);
    }
});

it('github-communication-experience-change-C193: unsupported host label locales use one English catalog while wire locale metadata stays exact', () => {
    const f = fixture('fr-FR');
    expect(f.decode()).toMatchObject({ outputLocale: 'fr-FR', requirements: [{ summary: 'Unclear', remaining: 'Verify' }, { summary: 'Unclear', remaining: 'Verify' }] });
});

it('github-communication-experience-change-C194: supported source outcomes retain null remaining and the original completion invariant', () => {
    const f = fixture(), response = f.response(); response.progress = 100;
    response.requirements = response.requirements.map(r => ({ ...r, assessment: 'supported' }));
    const decoded = f.decode(response);
    expect(parseScopedProgressResponse(decoded, 'en-US', f.scope, f.anchors)).toMatchObject({ progress: 100, remaining: '' });
});

it('github-communication-experience-change-C195: missing outcomes remain missing with an implementation action', () => {
    const f = fixture();
    for (const assessment of ['partial', 'missing', 'contradictory']) {
        const decoded = f.decode(f.response({ assessment }));
        expect(decoded).toMatchObject({ requirements: [{ status: 'missing', remaining: 'Implement' }, expect.any(Object)] });
        expect(parseScopedProgressResponse(decoded, 'en-US', f.scope, f.anchors).progress).toBe(50);
    }
});

it('github-communication-experience-change-C196: foreign state codes fail closed without leaking the returned value', () => {
    const f = fixture();
    for (const changes of [{ assessment: 'PRIVATE_@all' }, { assessment: 42 }]) {
        let failure: unknown; try { f.decode(f.response(changes)); } catch (e) { failure = e; }
        expect(failure).toMatchObject({ code: 'agent.failed' }); expect(JSON.stringify(failure)).not.toContain('PRIVATE_');
    }
});

it('github-communication-experience-change-C197: redundant status/evidence/prose cannot override the single coherent assessment', () => {
    const f = fixture();
    for (const changes of [{ status: 'supported' }, { evidence: 'source-only' }, { summary: 'PRIVATE_RAW' }, { remaining: null }]) {
        expect(() => f.decode(f.response(changes))).toThrow();
    }
});

it('github-communication-experience-change-C198: uncertain original scope requires clarification and cannot become supported', () => {
    const f = fixture(); Object.assign(f.scope.requirements[0], { uncertain: true });
    expect(() => f.decode()).toThrow();
    expect(f.decode(f.response({ assessment: 'scope-unclear' }))).toMatchObject({ requirements: [{ status: 'verification-unknown', remaining: 'Clarify' }, expect.any(Object)] });
    expect(() => f.decode(f.response({ assessment: 'supported' }))).toThrow();
});

it('github-communication-experience-change-C199: original IDs bind independently of returned array order', () => {
    const f = fixture(), value = f.response(); value.requirements.reverse();
    expect(f.decode(value)).toMatchObject({ requirements: [{ id: 'R12' }, { id: 'R11' }] });
    expect(parseScopedProgressResponse(f.decode(value), 'en-US', f.scope, f.anchors).summary.indexOf('[R11]')).toBeLessThan(
        parseScopedProgressResponse(f.decode(value), 'en-US', f.scope, f.anchors).summary.indexOf('[R12]'));
});

it('github-communication-experience-change-C200: foreign, duplicate and omitted requirement identities reject the whole batch', () => {
    const f = fixture();
    for (const id of ['R99', 'R12']) expect(() => f.decode(f.response({ id }))).toThrow();
    expect(() => f.decode({ ...f.response(), requirements: [] })).toThrow();
    expect(() => f.decode({ ...f.response(), requirements: null })).toThrow();
});

it('github-communication-experience-change-C201: prose smuggling and unknown response fields cannot enter the closed projection', () => {
    const f = fixture();
    for (const value of [f.response({ summary: 'PRIVATE prose' }), { ...f.response(), approval: true },
        { ...f.response(), requirements: [null, f.response().requirements[1]] }]) expect(() => f.decode(value)).toThrow();
});

it('github-communication-experience-change-C202: wrong locale metadata is rejected before facts render', () => {
    const f = fixture(); expect(() => f.decode({ ...f.response(), outputLocale: 'es-ES' })).toThrow();
});

it('github-communication-experience-change-C203: unsupported tiny, malformed and widened bounds retain the original protocol', () => {
    const f = fixture();
    for (const maximum of [8, 0, -1, 1.5, Number.POSITIVE_INFINITY, 801]) expect(compactProgressAssessmentPlan(f.withFields({ ...f.fields, summary: { ...f.fields.summary, maxLength: maximum } }), 'en-US')).toBeUndefined();
    expect(compactProgressAssessmentPlan(f.withFields({ ...f.fields, remaining: { ...f.fields.remaining, minLength: 2 } }), 'en-US')).toBeUndefined();
});

it('github-communication-experience-change-C204: extra original prose constraints cannot be bypassed by using code facts', () => {
    const f = fixture();
    for (const constraint of [{ enum: ['Literal'] }, { pattern: '^Literal$' }, { format: 'email' }]) expect(compactProgressAssessmentPlan(f.withFields({ ...f.fields, summary: { ...f.fields.summary, ...constraint } }), 'en-US')).toBeUndefined();
});

it('github-communication-experience-change-C205: incompatible and incomplete schema shapes do not acquire a compact wire plan', () => {
    const f = fixture();
    for (const schema of [{}, { properties: {} }, f.withFields({ ...f.fields, summary: null }),
        f.withFields({ ...f.fields, summary: { ...f.fields.summary, type: 'number' } }),
        f.withFields({ ...f.fields, remaining: { ...f.fields.remaining, type: 'string' } }),
        f.withFields({ ...f.fields, remaining: { ...f.fields.remaining, type: ['string', 'number'] } }),
        f.withFields({ summary: f.fields.summary, remaining: f.fields.remaining }),
        f.withFields({ ...f.fields, status: { type: 'string', enum: ['supported'] } }),
        f.withFields({ ...f.fields, evidence: { ...f.fields.evidence, pattern: '^source-only$' } }),
        f.withFields({ ...f.fields, extra: { type: 'string' } }),
        { ...f.schema, properties: { ...f.schema.properties, requirements: { ...f.schema.properties.requirements, items: { ...f.schema.properties.requirements.items, additionalProperties: true } } } }]) expect(compactProgressAssessmentPlan(schema, 'en-US')).toBeUndefined();
});

it('github-communication-experience-change-C206: complete receipt metadata and citation dictionaries survive native schema projection', () => {
    const f = fixture(), fields = { ...f.fields, citations: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', enum: ['unit-owned'] } } };
    const shape = f.withFields(fields), schema = { ...shape, properties: { ...shape.properties, headSha: { type: 'string', enum: ['a'.repeat(40)] } }, required: [...shape.required, 'headSha'] };
    const plan = compactProgressAssessmentPlan(schema, 'en-US')!;
    expect((plan.schema.properties as Record<string, unknown>).headSha).toBe(schema.properties.headSha);
    const codedFields = (((plan.schema.properties as Record<string, unknown>).requirements as Record<string, unknown>).items as Record<string, unknown>).properties as Record<string, unknown>;
    expect(codedFields.citations).toBe(fields.citations);
});

it('github-communication-experience-change-C207: decoder changes only the code representation and preserves pinned metadata/citations for host validation', () => {
    const f = fixture(), shape = f.withFields({ ...f.fields, citations: { type: 'array', items: { type: 'string', enum: ['owned'] } } });
    const plan = compactProgressAssessmentPlan(shape, 'en-US')!;
    const value = { ...f.response(), requirements: f.response().requirements.map(r => ({ ...r, citations: ['owned'] })) };
    expect(decodeCompactProgressAssessment(value, plan, f.scope, f.anchors)).toMatchObject({ requirements: [{ id: 'R11', citations: ['owned'] }, { id: 'R12', citations: ['owned'] }] });
});

it('github-communication-experience-change-C208: closed replacement prompts preserve complete source and reject arbitrary recovery data', () => {
    const facts = { requirementId: 'R11', sourceLineId: 'L11', field: '$.requirements[0].summary', maximum: 32, observed: 33 };
    const source = 'Complete original immutable comparison and every requirement.';
    const prompt = compactProgressAssessmentPrompt(source, facts);
    expect(prompt).toContain(source); expect(prompt).toContain(JSON.stringify(facts)); expect(prompt).toContain('no prose fields');
    expect(() => compactProgressAssessmentPrompt(source, { ...facts, private: 'PRIVATE_RAW' } as typeof facts)).toThrow(TypeError);
});

it('github-communication-experience-change-C209: original and worst closed hints are finite, reserved padding never becomes a model request', () => {
    const source = 'Entire pinned source.', facts = { reportedProgress: 70, requirementCount: 32, supportedCount: 32, missingCount: 0, unknownCount: 0 };
    const actual = compactProgressAssessmentPrompt(source, facts), reserve = reservedCompactProgressAssessmentPrompt(source);
    expect(Buffer.byteLength(JSON.stringify(facts))).toBeLessThanOrEqual(COMPACT_PROGRESS_HINT_MAX_BYTES);
    expect(Buffer.byteLength(actual)).toBeLessThanOrEqual(Buffer.byteLength(reserve));
    expect(actual).not.toContain(' '.repeat(COMPACT_PROGRESS_HINT_MAX_BYTES));
    expect(compactProgressAssessmentPrompt(source)).toContain(source);
});
