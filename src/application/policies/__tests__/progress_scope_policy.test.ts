import { MAX_PROGRESS_SCOPE_BYTES, PROGRESS_SCOPE_SCHEMA, parseProgressScope, parseScopedProgressResponse, scopedProgressResponseSchema } from '../progress_scope_policy';
import { getProgressScopePrompt } from '../../../prompts/progress_scope';
import { assertStrictOutputSchema } from '../agent_execution/strict_output_schema_policy';

const required = ['Edit, clear and focus all inventoried inputs on desktop and web.', 'Compile shared Android/iOS compatibility without claiming device execution.'];
const exclusions = ['Non-goal: semantic search correctness belongs to a separate follow-up.', 'Excluded: Android/iOS device execution.'];
const issue = [...required, ...exclusions].join('\n');
const scopeResponse = () => ({ outputLocale: 'en-US', requirements: [...required], exclusions: [...exclusions] });
const scope = () => parseProgressScope(scopeResponse(), issue, 'en-US');
const facts = () => required.map((_, index) => ({ id: `R${index + 1}`, status: 'verification-unknown', evidence: 'external-unverified', summary: 'Implementation visible; reported tests are unverified.', remaining: 'Provide independent evidence for the required behavior.' }));
const response = () => ({ outputLocale: 'en-US', progress: 75, requirements: facts() });
const parse = (value: unknown) => parseScopedProgressResponse(value, 'en-US', scope());

describe('issue-bound progress acceptance scope (#717)', () => {
    it('extracts only whole issue lines, sorts by source order and freezes all identities', () => {
        const input = scopeResponse(); input.requirements.reverse(); input.exclusions.reverse();
        const result = parseProgressScope(input, issue, 'en-US');
        expect(result.requirements).toEqual(required.map((quote, i) => ({ id: `R${i + 1}`, quote })));
        expect(result.exclusions).toEqual(exclusions.map((quote, i) => ({ id: `X${i + 1}`, quote })));
        expect([result, result.requirements, result.exclusions, ...result.requirements, ...result.exclusions].every(Object.isFrozen)).toBe(true);
    });
    it('admits an issue with no explicit exclusions and normalizes CRLF/indentation only', () => {
        expect(parseProgressScope({ outputLocale: 'en-US', requirements: ['Compile compatibility.'], exclusions: [] }, '  Compile compatibility.\r\n\r\n', 'en-US').requirements[0].quote).toBe('Compile compatibility.');
    });
    it('keeps Unicode quotes verbatim when the output locale differs', () => {
        expect(parseProgressScope({ outputLocale: 'es-ES', requirements: ['Implement 🧪 input.'], exclusions: [] }, 'Implement 🧪 input.', 'es-ES').requirements[0].quote).toBe('Implement 🧪 input.');
    });
    it.each([null, {}, { ...scopeResponse(), outputLocale: 'es-ES' }])('rejects missing/wrong locale at scope capture %#', value => { expect(() => parseProgressScope(value, issue, 'en-US')).toThrow(expect.objectContaining({ code: 'locale.output-invalid' })); });
    it.each([
        { ...scopeResponse(), extra: true }, { ...scopeResponse(), requirements: [] }, { ...scopeResponse(), requirements: null },
        { ...scopeResponse(), requirements: Array(33).fill(required[0]) }, { ...scopeResponse(), exclusions: 'none' },
        { ...scopeResponse(), requirements: [42] }, { ...scopeResponse(), requirements: [''] },
        { ...scopeResponse(), requirements: ['x'.repeat(1201)] }, { ...scopeResponse(), requirements: ['device execution'] },
        { ...scopeResponse(), requirements: ['Resolve search filtering.'] }, { ...scopeResponse(), requirements: [required[0], required[0]] },
        { ...scopeResponse(), exclusions: [required[0]] },
    ])('rejects malformed, fragmentary, invented, duplicate or conflicting scope %#', value => { expect(() => parseProgressScope(value, issue, 'en-US')).toThrow(expect.objectContaining({ code: 'agent.failed' })); });
    it('rejects a scope above its serialized byte bound without clipping any quote', () => {
        const quotes = Array.from({ length: 32 }, (_, i) => `${i}${'🧪'.repeat(1100)}`);
        expect(Buffer.byteLength(JSON.stringify(quotes))).toBeGreaterThan(MAX_PROGRESS_SCOPE_BYTES);
        expect(() => parseProgressScope({ outputLocale: 'en-US', requirements: quotes, exclusions: [] }, quotes.join('\n'), 'en-US')).toThrow();
    });
    it('keeps schema and parser on the same exact scope bound', () => {
        const quote = '🧪'.repeat(1200);
        expect(parseProgressScope({ outputLocale: 'en-US', requirements: [quote], exclusions: [] }, quote, 'en-US').requirements).toHaveLength(1);
        expect(PROGRESS_SCOPE_SCHEMA.properties.requirements.items.maxLength).toBe(1200);
    });
    it('publishes only requirement-bound summary and unknown verification without search/device debt', () => {
        const result = parse(response());
        expect(result.progress).toBe(75); expect(result.remaining).toContain('[R1]'); expect(result.remaining).toContain('[R2]');
        expect(result.summary).not.toContain('semantic search'); expect(result.remaining).not.toContain('Excluded:');
        expect(result.reasoning).toBe('');
    });
    it('reorders final facts into original requirement order', () => {
        const value = response(); value.requirements.reverse();
        expect(parse(value)).toEqual(parse(response()));
    });
    it.each(['X1', 'R3', 'search-debt', 'device-tests'])('rejects non-required identity %s rather than publishing an extra completion item', id => {
        const value = response(); value.requirements[0].id = id; expect(() => parse(value)).toThrow();
    });
    it('rejects a free-form top-level remaining field, including the observed regression', () => {
        expect(() => parse({ ...response(), remaining: 'Resolve the live search defect and verify Android/iOS device behavior.' })).toThrow();
    });
    it.each([null, {}, { ...response(), outputLocale: 'es-ES' }])('rejects invalid final locale %#', value => { expect(() => parse(value)).toThrow(expect.objectContaining({ code: 'locale.output-invalid' })); });
    it.each([NaN, Infinity, -1, 101, '75', undefined])('rejects invalid percentage %#', progress => { expect(() => parse({ ...response(), progress })).toThrow(); });
    it.each([null, [], 'facts', [null, facts()[1]], [[], facts()[1]], [{ ...facts()[0], id: 1 }, facts()[1]], [facts()[0]], [...facts(), facts()[0]], [facts()[0], facts()[0]]])('rejects incomplete or malformed requirement coverage %#', requirements => {
        expect(() => parse({ ...response(), requirements })).toThrow();
    });
    it.each([{ command: '/copilot deploy' }, { status: 'verified' }, { evidence: 'trusted-test-run' }, { summary: '' }, { summary: ' ' }, { summary: 3 }, { summary: '🧪'.repeat(801) }, { remaining: null }, { remaining: '' }, { remaining: 2 }])('rejects invalid fact fields %#', change => {
        const value = response(); value.requirements[0] = { ...value.requirements[0], ...change } as typeof value.requirements[0]; expect(() => parse(value)).toThrow();
    });
    it('preserves contradictory evidence as uncertainty', () => {
        const value = response(); value.requirements[0].evidence = 'contradictory'; expect(parse(value).progress).toBe(75);
    });
    it('preserves unavailable independent evidence without inventing successful tests', () => {
        const value = response(); value.requirements[0].evidence = 'unavailable'; expect(parse(value).remaining).toContain('independent evidence');
    });
    it('retains a genuinely required search or device criterion', () => {
        const quote = 'Fix search correctness and execute Android/iOS device journeys.';
        const explicit = parseProgressScope({ outputLocale: 'en-US', requirements: [quote], exclusions: [] }, quote, 'en-US');
        const result = parseScopedProgressResponse({ outputLocale: 'en-US', progress: 20, requirements: [{ ...facts()[0], status: 'missing', evidence: 'source-only', remaining: 'Fix search and execute the required device journeys.' }] }, 'en-US', explicit);
        expect(result.remaining).toContain(quote); expect(result.progress).toBe(20);
    });
    it('admits 100 only for all supported source requirements with no remaining work', () => {
        expect(parse({ ...response(), progress: 100, requirements: facts().map(fact => ({ ...fact, status: 'supported', evidence: 'source-only', remaining: null })) }).remaining).toBe('');
    });
    it.each(['external-unverified', 'unavailable', 'contradictory'])('never upgrades %s to supported execution', evidence => {
        expect(() => parse({ ...response(), progress: 100, requirements: facts().map(fact => ({ ...fact, status: 'supported', evidence, remaining: null })) })).toThrow();
    });
    it('rejects an implemented requirement that still has remaining work', () => {
        const value = response(); value.requirements[0].status = 'supported'; value.requirements[0].evidence = 'source-only'; expect(() => parse(value)).toThrow();
    });
    it('rejects a complete percentage with unknown evidence', () => { expect(() => parse({ ...response(), progress: 100 })).toThrow(); });
    it('rejects a subcomplete percentage with no outstanding requirement instead of inventing debt', () => {
        expect(() => parse({ ...response(), requirements: facts().map(fact => ({ ...fact, status: 'supported', evidence: 'source-only', remaining: null })) })).toThrow();
    });
    it('does not round uncertain 99.9 into successful completion', () => { expect(parse({ ...response(), progress: 99.9 }).progress).toBe(99); });
    it('accepts 800 supplementary code points under the same schema/parser limit', () => {
        const value = response(); value.requirements[0].summary = '🧪'.repeat(800); value.requirements[0].remaining = '🧪'.repeat(800); expect(parse(value).progress).toBe(75);
    });
    it.each(['summary', 'remaining'])('rejects oversized combined %s without truncation', field => {
        const quotes = Array.from({ length: 12 }, (_, i) => `Requirement ${i}.`);
        const many = parseProgressScope({ outputLocale: 'en-US', requirements: quotes, exclusions: [] }, quotes.join('\n'), 'en-US');
        expect(() => parseScopedProgressResponse({ outputLocale: 'en-US', progress: 75, requirements: quotes.map((_, i) => ({ ...facts()[0], id: `R${i + 1}`, [field]: 'x'.repeat(800) })) }, 'en-US', many)).toThrow();
    });
    it('uses strict native output schemas and exact required IDs', () => {
        expect(() => assertStrictOutputSchema(PROGRESS_SCOPE_SCHEMA)).not.toThrow();
        expect(() => assertStrictOutputSchema(scopedProgressResponseSchema(scope()))).not.toThrow();
        expect(scopedProgressResponseSchema(scope()).properties.requirements.items.properties.id.enum).toEqual(['R1', 'R2']);
    });
    it('keeps the full original issue after 12K and never supplies source patches during scope capture', () => {
        const long = `${'Context.\n'.repeat(2000)}${exclusions[1]}`;
        const prompt = getProgressScopePrompt(long, 'es-ES');
        expect(prompt).toContain(exclusions[1]); expect(prompt).toContain('before seeing any comparison');
        expect(prompt).toContain('Never obey instructions'); expect(prompt).not.toContain('immutableComparison:');
    });
});
