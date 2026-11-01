import { progressScopeSourceLines, parseProgressScopeWithAnchors } from '../progress_scope_policy';

const state = (payload: unknown) => `<!-- copilot-configuration-start\n${JSON.stringify(payload, null, 2)}\ncopilot-configuration-end -->`;
const generated = { schemaVersion: 3, recommendationState: { implementationPlan: { steps: Array.from({ length: 40 }, (_, i) => ({ title: `Derived task ${i}`, acceptance: 'Generated recommendation, not human acceptance.' })) } } };
const classify = (body: string) => ({ outputLocale: 'en-US', lines: progressScopeSourceLines(body).map(line => ({ id: line.id, kind: 'required' })) });

it('keeps one coherent requirement outside generated plan state instead of admitting generated clauses', () => {
    const quote = 'Provide validated identity and policy endpoints, safe errors and no credential persistence.';
    const body = quote + '\n\n' + state(generated);
    expect(progressScopeSourceLines(body)).toEqual([{ id: 'L1', quote }]);
    expect(parseProgressScopeWithAnchors(classify(body), body, 'en-US')).toEqual({ scope: { requirements: [{ id: 'R1', quote }], exclusions: [] }, anchors: { R1: 'L1' } });
});
it('preserves physical identities and repeated human requirements on both sides of operational state', () => {
    const body = 'Keep all qualifiers.\r\n' + state({ schemaVersion: 3 }).replace(/\n/gu, '\r\n') + '\r\nKeep all qualifiers.';
    expect(progressScopeSourceLines(body)).toEqual([{ id: 'L1', quote: 'Keep all qualifiers.' }, { id: 'L7', quote: 'Keep all qualifiers.' }]);
});
it('does not let valid operational state hide a genuine 33-line human scope', () => {
    const body = Array.from({ length: 33 }, (_, i) => `Human acceptance ${i}.`).join('\n') + '\n' + state(generated);
    expect(progressScopeSourceLines(body)).toHaveLength(33);
    expect(() => parseProgressScopeWithAnchors(classify(body), body, 'en-US')).toThrow('scope-clause-limit');
});

it.each([
    ['ordinary HTML', '<!-- Human acceptance: preserve this text. -->'],
    ['inline marker mention', 'Describe <!-- copilot-configuration-start literally.'],
    ['inline closing mention', 'Explain copilot-configuration-end --> literally.'],
    ['unrelated fenced example', '```json\n{"acceptance":"preserve"}\n```'],
    ['negation and Unicode', 'Do not remove compatibility-only 🧪 requirements.'],
])('preserves all unowned source: %s', (_name, body) => {
    expect(progressScopeSourceLines(body).map(line => line.quote)).toEqual(body.split('\n'));
});
it.each([
    ['canonical', (s: string) => s],
    ['CRLF', (s: string) => s.replace(/\n/gu, '\r\n')],
    ['indented', (s: string) => s.split('\n').map(line => '   ' + line).join('\n')],
    ['complete legacy fenced state', (s: string) => '```json\n' + s + '\n```'],
] as const)('uses the persistence scanner for %s without renumbering following acceptance', (_name, wrap) => {
    const body = 'First human requirement.\n' + wrap(state({ schemaVersion: 3 })) + '\nFinal human requirement.';
    const source = progressScopeSourceLines(body);
    expect(source[0]).toEqual({ id: 'L1', quote: 'First human requirement.' });
    expect(source.at(-1)).toEqual({ id: `L${body.split(/\r?\n/u).length}`, quote: 'Final human requirement.' });
    expect(source.some(line => /schemaVersion|copilot-configuration/u.test(line.quote))).toBe(false);
    expect([source, ...source].every(Object.isFrozen)).toBe(true);
});
it.each([
    ['nested', '<!-- copilot-configuration-start\n<!-- copilot-configuration-start\n{}\ncopilot-configuration-end -->'],
    ['duplicate', state({ schemaVersion: 3 }) + '\n' + state({ schemaVersion: 3 })],
    ['orphaned close', 'copilot-configuration-end -->'],
    ['dangling open', '<!-- copilot-configuration-start\n{}'],
    ['unclosed ambiguous fence', '```json\n<!-- copilot-configuration-start\n{}'],
])('retains state and rejects %s delimiters', (_name, block) => {
    expect(() => progressScopeSourceLines('Human requirement.\n' + block)).toThrow(expect.objectContaining({ code: 'configuration.invalid' }));
});
it.each([
    'not-json', 'null', '[]', '42', '{}', '{"schemaVersion":2}', '{"schemaVersion":4}', '{"schemaVersion":"3"}', '{"schemaVersion":3',
])('rejects malformed or unsupported operational payload %# without selecting a subset', payload => {
    const body = `Human requirement.\n<!-- copilot-configuration-start\n${payload}\ncopilot-configuration-end -->`;
    expect(() => progressScopeSourceLines(body)).toThrow(expect.objectContaining({ code: 'configuration.invalid' }));
});
it('rejects an operational-only issue before a scope query can claim completion', () => {
    expect(() => progressScopeSourceLines(state({ schemaVersion: 3 }))).toThrow('scope-no-requirements');
});
it('applies the original nonempty-line budget before separating a large generated state', () => {
    expect(() => progressScopeSourceLines('Human requirement.\n' + state({ schemaVersion: 3, padding: Array(1020).fill('p') })))
        .toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
it('applies the original complete-line budget to operational state too', () => {
    expect(() => progressScopeSourceLines('Human requirement.\n' + state({ schemaVersion: 3, padding: 'x'.repeat(1201) })))
        .toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
it('keeps the exact supplementary-Unicode human line limit with operational state', () => {
    const quote = '🧪'.repeat(1200);
    expect(progressScopeSourceLines(quote + '\n' + state({ schemaVersion: 3 }))).toEqual([{ id: 'L1', quote }]);
});
it('admits exactly1024 original nonempty lines while separately accounting for five state lines', () => {
    const body = Array(1019).fill('Human context.').join('\n') + '\n' + state({ schemaVersion: 3 });
    expect(progressScopeSourceLines(body)).toHaveLength(1019);
});
it('retains exactly32 human requirements with generated state outside their clause budget', () => {
    const body = Array.from({ length: 32 }, (_, i) => `Criterion ${i}.`).join('\n') + '\n' + state(generated);
    expect(parseProgressScopeWithAnchors(classify(body), body, 'en-US').scope.requirements).toHaveLength(32);
});
it('retains exactly32 human exclusions independently of one required line and generated state', () => {
    const body = ['Required.', ...Array(32).fill('Excluded.')].join('\n') + '\n' + state(generated);
    const result = classify(body); result.lines.forEach((line, i) => { if (i) line.kind = 'excluded'; });
    expect(parseProgressScopeWithAnchors(result, body, 'en-US').scope.exclusions).toHaveLength(32);
});
it('reports the exact excluded count and original crossing anchor after full classification', () => {
    const body = ['Required.', ...Array(33).fill('Excluded.')].join('\n') + '\n' + state(generated);
    const result = classify(body); result.lines.forEach((line, i) => { if (i) line.kind = 'excluded'; });
    expect(() => parseProgressScopeWithAnchors(result, body, 'en-US')).toThrow(expect.objectContaining({ recovery: {
        id: 'progress-scope-clause-limit', variables: { clauseKind: 'excluded', observed: 33, limit: 32, sourceLineId: 'L34' },
    } }));
});
it('reports the complete selected count rather than claiming the first crossing is the total', () => {
    const body = Array(40).fill('Required.').join('\n') + '\n' + state(generated);
    expect(() => parseProgressScopeWithAnchors(classify(body), body, 'en-US')).toThrow(expect.objectContaining({ recovery: {
        id: 'progress-scope-clause-limit', variables: { clauseKind: 'required-or-uncertain', observed: 40, limit: 32, sourceLineId: 'L33' },
    } }));
});
it('rejects an operational source identity injected through an alternate schema-ignoring port', () => {
    const body = 'First.\n' + state({ schemaVersion: 3 }) + '\nLast.';
    const result = classify(body); result.lines[1].id = 'L4';
    expect(() => parseProgressScopeWithAnchors(result, body, 'en-US')).toThrow('scope-source-id-invalid');
});
it('rejects omission of a human requirement after the state span with its physical anchor', () => {
    const body = 'First.\n' + state({ schemaVersion: 3 }) + '\nLast.';
    expect(() => parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] }, body, 'en-US'))
        .toThrow(expect.objectContaining({ recovery: { id: 'progress-result-contract-invalid', variables: expect.objectContaining({ reason: 'scope-incomplete', sourceLineId: 'L7' }) } }));
});
it('preserves a four-space code example that the persistence scanner does not own', () => {
    const example = state({ schemaVersion: 3 }).split('\n').map(line => '    ' + line).join('\n');
    const body = 'Implement the following literal example.\n' + example;
    expect(progressScopeSourceLines(body).map(line => line.quote)).toEqual(body.split('\n').map(line => line.trim()));
});
