import { progressAssessmentFactLimit } from '../progress_assessment_capacity_policy';
import { ApplicationError } from '../../errors/application_error';
import { parseScopedProgressResponse, scopedProgressResponseSchema, type ProgressScope } from '../progress_scope_policy';
import { assertAgentResponseSchema } from '../../../data/repository/agent_json_schema_validator';
import { buildApplicationErrorPresentation } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';

const scope = (count = 32, quote = 'Required source.') : ProgressScope => ({ requirements: Array.from({ length: count }, (_, i) => ({ id: `R${i + 1}`, quote })), exclusions: [] });
const prefixSize = (s: ProgressScope) => s.requirements.reduce((sum, r) => sum + [...`[${r.id}] ${r.quote} — `].length, Math.max(0, s.requirements.length - 1));
const response = (s: ProgressScope, size: number, missing = false) => ({ outputLocale: 'en-US', progress: missing ? 50 : 100,
    requirements: s.requirements.map(r => ({ id: r.id, status: missing ? 'missing' : 'supported', evidence: 'source-only', summary: 's'.repeat(size), remaining: missing ? 'r'.repeat(size) : null as string | null })) });
function caught(action: () => unknown) { try { action(); } catch (error) { return error; } throw Error('Expected rejection'); }

it.each([1, 2, 10, 32])('budgets every ID, original quote, separator and newline for %s facts', count => {
    const s = scope(count), schema = scopedProgressResponseSchema(s), properties = schema.properties.requirements.items.properties;
    const expected = Math.min(800, Math.floor((8000 - prefixSize(s)) / count));
    expect(properties.summary.maxLength).toBe(expected); expect(properties.remaining.maxLength).toBe(expected);
    expect(properties.id.enum).toEqual(s.requirements.map(r => r.id)); expect(schema.properties.requirements.minItems).toBe(count);
    const result = response(s, expected, true); assertAgentResponseSchema(result, schema);
    const parsed = parseScopedProgressResponse(result, 'en-US', s);
    expect([...parsed.summary].length).toBeLessThanOrEqual(8000); expect([...parsed.remaining].length).toBeLessThanOrEqual(8000);
});
it.each(['en-US', 'es-ES'])('counts supplementary quotes and facts as code points in %s', locale => {
    const s = scope(32, '🧪'.repeat(80)), schema = scopedProgressResponseSchema(s), maximum = schema.properties.requirements.items.properties.summary.maxLength;
    expect(maximum).toBe(Math.floor((8000 - prefixSize(s)) / 32));
    const result = response(s, 1, true); result.outputLocale = locale;
    for (const fact of result.requirements) { fact.summary = '🧪'.repeat(maximum); fact.remaining = '🧪'.repeat(maximum); }
    assertAgentResponseSchema(result, schema); expect(parseScopedProgressResponse(result, locale, s).progress).toBe(50);
});
it('keeps the existing 800-point ceiling for a small scope', () => {
    const s = scope(1); expect(scopedProgressResponseSchema(s).properties.requirements.items.properties.summary.maxLength).toBe(800);
    expect(parseScopedProgressResponse(response(s, 800), 'en-US', s).progress).toBe(100);
});
it('does not budget exclusions as published required facts', () => {
    const s = scope(10), withExclusions = { ...s, exclusions: [{ id: 'X1', quote: 'x'.repeat(1200) }] };
    expect(scopedProgressResponseSchema(withExclusions)).toEqual(scopedProgressResponseSchema(s));
});
it('keeps a harmless empty schema available to legacy callers without division by zero', () => {
    expect(scopedProgressResponseSchema(scope(0)).properties.requirements.items.properties.summary.maxLength).toBe(800);
});
it('does not reject previously valid uneven facts when the full projection fits', () => {
    const s = scope(32), result = response(s, 1); result.requirements[0].summary = 's'.repeat(800);
    expect(parseScopedProgressResponse(result, 'en-US', s).progress).toBe(100);
});
it.each(['summary', 'remaining'] as const)('identifies the first overflowing %s in source order despite response reorder', field => {
    const s = scope(12), result = response(s, field === 'summary' ? 800 : 1, true);
    if (field === 'remaining') for (const fact of result.requirements) fact.remaining = 'r'.repeat(800);
    result.requirements.reverse();
    const error = caught(() => parseScopedProgressResponse(result, 'en-US', s, { R10: 'L1101' }));
    expect(error).toMatchObject({ code: 'agent.failed', recovery: { id: 'progress-result-contract-invalid', variables: {
        phase: 'assessment', reason: 'assessment-text-limit', field: `$.requirements[2].${field}`, requirementId: 'R10', sourceLineId: 'L1101',
    } } });
    expect(JSON.stringify(error)).not.toContain('s'.repeat(800));
});
it.each(['summary', 'remaining'] as const)('accepts exactly 8000 projected %s points and rejects the next point', field => {
    const s = scope(12, 'Quote.'), result = response(s, 1, true);
    let available = 8000 - prefixSize(s);
    for (const fact of result.requirements) { const size = Math.min(800, available - (12 - Number(fact.id.slice(1)))); available -= size; if (field === 'summary') fact.summary = 's'.repeat(size); else fact.remaining = 'r'.repeat(size); }
    expect(available).toBe(0); expect([...parseScopedProgressResponse(result, 'en-US', s)[field]].length).toBe(8000);
    const last = result.requirements[11]; if (field === 'summary') last.summary += 's'; else last.remaining += 'r';
    expect(caught(() => parseScopedProgressResponse(result, 'en-US', s))).toMatchObject({ recovery: { variables: { reason: 'assessment-text-limit', requirementId: 'R12', sourceLineId: 'none' } } });
});
it('skips supported entries in the remaining budget without inventing missing work', () => {
    const s = scope(12), result = response(s, 1, true);
    for (const fact of result.requirements.slice(0, 10)) { fact.status = 'supported'; fact.remaining = null; }
    for (const fact of result.requirements.slice(10)) fact.remaining = 'r'.repeat(800);
    expect(parseScopedProgressResponse(result, 'en-US', s).remaining).not.toContain('[R1]');
});
it('keeps verified requirement identity when no legacy source anchor exists', () => {
    const s = scope(12), error = caught(() => parseScopedProgressResponse(response(s, 800), 'en-US', s));
    expect(error).toMatchObject({ recovery: { variables: { requirementId: 'R10', sourceLineId: 'none' } } });
});
it('does not serialize an unverified source anchor or model text on combined overflow', () => {
    const s = scope(12), error = caught(() => parseScopedProgressResponse(response(s, 800), 'en-US', s, { R10: 'PRIVATE_ANCHOR' }));
    expect(error).toMatchObject({ recovery: { variables: { requirementId: 'R10', sourceLineId: 'none' } } });
    expect(JSON.stringify(error)).not.toContain('PRIVATE_ANCHOR');
});
it('blocks quotes that cannot leave one nonempty fact per requirement before assessment', () => {
    const s = scope(32, 'q'.repeat(1190));
    const error = caught(() => scopedProgressResponseSchema(s, { R7: 'L9' }));
    expect(error).toMatchObject({ code: 'validation.evidence-too-large', retryable: false, recovery: { id: 'progress-assessment-capacity-exceeded', variables: {
        phase: 'assessment', reason: 'assessment-text-limit', field: '$.requirements[6].summary', requirementId: 'R7', sourceLineId: 'L9',
    } } });
});
it.each(['en-US', 'es-ES'])('explains impossible host capacity without recommending an identical retry in %s', locale => {
    const error = caught(() => scopedProgressResponseSchema(scope(32, 'q'.repeat(1190)))) as Parameters<typeof buildApplicationErrorPresentation>[0];
    const view = buildApplicationErrorPresentation(error, resolveStaticApplicationErrorCatalog(locale).message);
    expect(view.action).toContain('8,000'); expect(view.action).toContain('R7'); expect(view.action).toContain('none');
    expect(view.impact).not.toContain('returned'); expect(view.retryable).toBe('No');
});

it.each(['summary', 'remaining'] as const)('rejects one point beyond the generated %s schema before semantic publication', field => {
    const s = scope(32), schema = scopedProgressResponseSchema(s), result = response(s, 1, true);
    const limit = schema.properties.requirements.items.properties.summary.maxLength;
    if (field === 'summary') result.requirements[0].summary = 'x'.repeat(limit + 1); else result.requirements[0].remaining = 'x'.repeat(limit + 1);
    expect(() => assertAgentResponseSchema(result, schema)).toThrow();
});
it('supports exactly one code point of prose for every requirement at the capacity boundary', () => {
    const s = scope(32, 'q'.repeat(230));
    const last = s.requirements[31]; (last as { quote: string }).quote += 'q'.repeat(8000 - 32 - prefixSize(s));
    expect(scopedProgressResponseSchema(s).properties.requirements.items.properties.summary.maxLength).toBe(1);
    expect([...parseScopedProgressResponse(response(s, 1, true), 'en-US', s).summary].length).toBe(8000);
});
it('blocks the next citation point when every requirement already has the minimum prose reservation', () => {
    const s = scope(32, 'q'.repeat(230));
    const last = s.requirements[31]; (last as { quote: string }).quote += 'q'.repeat(8001 - 32 - prefixSize(s));
    expect(caught(() => scopedProgressResponseSchema(s))).toMatchObject({ retryable: false, recovery: { variables: { requirementId: 'R32', field: '$.requirements[31].summary' } } });
});

it('reports unavailable identities for a malformed legacy requirement rather than copying its value', () => {
    const error = caught(() => progressAssessmentFactLimit([{ id: 'PRIVATE_ID', quote: 'q'.repeat(8000) }], { PRIVATE_ID: 'L2' }));
    expect(error).toMatchObject({ recovery: { variables: { requirementId: 'none', sourceLineId: 'none' } } });
    expect(JSON.stringify(error)).not.toContain('PRIVATE_ID');
});
it('preserves the requirement but refuses a non-host line anchor on capacity failure', () => {
    const error = caught(() => progressAssessmentFactLimit(scope(32, 'q'.repeat(1190)).requirements, { R7: 'PRIVATE_ANCHOR' }));
    expect(error).toMatchObject({ recovery: { variables: { requirementId: 'R7', sourceLineId: 'none' } } });
});
it.each([
    { phase: 'assessment', reason: 'assessment-text-limit', field: '$.PRIVATE_VALUE', requirementId: 'none', sourceLineId: 'none' },
    { phase: 'scope', reason: 'scope-budget', field: '$.lines', requirementId: 'none', sourceLineId: 'none' },
    { phase: 'assessment', reason: 'requirements-incomplete', field: '$.requirements', requirementId: 'none', sourceLineId: 'none' },
])('refuses invalid capacity recovery facts without broadening their closed contract %#', variables => {
    expect(() => new ApplicationError('validation.evidence-too-large', 'Owned capacity diagnostic.', { recovery: { id: 'progress-assessment-capacity-exceeded', variables: variables as never } })).toThrow(TypeError);
});
it('keeps a standalone legacy capacity failure useful when no source map was captured', () => {
    const error = caught(() => progressAssessmentFactLimit(scope(32, 'q'.repeat(1190)).requirements));
    expect(error).toMatchObject({ retryable: false, recovery: { variables: { requirementId: 'R7', sourceLineId: 'none' } } });
});
