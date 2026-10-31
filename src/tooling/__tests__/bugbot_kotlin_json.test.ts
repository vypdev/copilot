import { evaluateBugbotBenchmark } from '../bugbot_benchmark';
import { buildBugbotBenchmarkPrompt } from '../bugbot_benchmark_runner';
import { KOTLIN_JSON_CASES, observeKotlinJson } from './fixtures/bugbot_kotlin_json_oracles';

const outcomes: Record<string, object> = {
  'implicit-nullable-omission': { status: 'accepted', name: 'Owned', nullable: null },
  'explicit-nullable-omission': { status: 'rejected', field: 'nullable' },
  'implicit-missing-nonnullable': { status: 'rejected', field: 'name' },
  'implicit-nullable-default': { status: 'accepted', name: 'Owned', nullable: 'fallback' },
  'explicit-nullable-default': { status: 'accepted', name: 'Owned', nullable: 'fallback' },
  'inherited-implicit-policy': { status: 'accepted', name: 'Owned', nullable: null },
  'different-instance-policy': { status: 'rejected', field: 'nullable' },
};
describe('Kotlin Json instance policy evidence', () => {
  it.each(KOTLIN_JSON_CASES)('observes the authored effective policy for $id', item => {
    const observed = observeKotlinJson(item);
    if (item.id === 'kotlin-json-unavailable-policy') {
      expect(observed).toEqual({ kind: 'unavailable' });
      return;
    }
    expect(observed.kind).toBe('decode');
    if (observed.kind !== 'decode') throw new Error('Expected an authored decode observation.');
    expect(observed.result).toEqual(outcomes[item.id.slice('kotlin-json-'.length)]);
    expect(observed.instance).toBe(item.id.endsWith('different-instance-policy') ? 'serverJson' : 'probeJson');
    expect(observed.explicitNulls).toBe(['kotlin-json-explicit-nullable-omission',
      'kotlin-json-explicit-nullable-default', 'kotlin-json-different-instance-policy'].includes(item.id));
    for (const finding of item.expected) {
      expect(item.diff.split('\n')[finding.line! - item.startLine]).toBe('+' + finding.codeSnippet);
    }
  });
  it.each(KOTLIN_JSON_CASES)('penalizes the opposite verdict for $id under unchanged floors', item => {
    const corpus = { schemaVersion: 1 as const, cases: [item] };
    const reference = { schemaVersion: 1 as const,
      predictions: { [item.id]: item.expected.map(finding => ({ ...finding, confidence: 1 })) } };
    expect(evaluateBugbotBenchmark(corpus, reference).violations).toEqual([]);
    const wrong = evaluateBugbotBenchmark(corpus, { schemaVersion: 1, predictions: { [item.id]: item.expected.length ? [] : [{
      title: 'Invented missing required nullable field', file: item.file, line: item.startLine, severity: 'medium', category: 'correctness',
    }] } });
    expect(wrong.violations.length).toBeGreaterThan(0);
    expect(item.expected.length ? wrong.metrics.falseNegatives : wrong.metrics.falsePositives).toBe(1);
  });
  it('rejects unknown identities before factory selection', () => {
    expect(() => observeKotlinJson({ id: '__proto__', diff: KOTLIN_JSON_CASES[0].diff })).toThrow('Unknown or modified');
  });
  it('rejects altered code-like source without executing it', () => {
    expect(() => observeKotlinJson({ ...KOTLIN_JSON_CASES[0], diff: KOTLIN_JSON_CASES[0].diff + '\n+error("must-not-execute")' }))
      .toThrow('Unknown or modified');
  });
  it('does not use expected verdicts to derive observations', () => {
    for (const item of KOTLIN_JSON_CASES) {
      const contradictory = { ...item, expected: [{ title: 'private contradictory label', line: 999 }] };
      expect(observeKotlinJson(contradictory)).toEqual(observeKotlinJson(item));
    }
  });
  it('keeps private verdicts and replacement text out of benchmark input', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...KOTLIN_JSON_CASES[0], expected: [{
      title: 'private-json-verdict', suggestion: 'private-json-replacement',
    }] });
    expect(prompt).not.toContain('private-json-verdict');
    expect(prompt).not.toContain('private-json-replacement');
    expect(prompt).not.toContain('"expected"');
  });
  it('delivers the active serializer contract through the real benchmark', () => {
    const prompt = buildBugbotBenchmarkPrompt(KOTLIN_JSON_CASES[0]);
    for (const clause of ['actual Json instance', 'explicitNulls=false', 'absent nullable', 'non-nullable', 'Defaults apply first with either flag', 'Json(base) inherits flags', 'If input is accepted return findings: []']) {
      expect(prompt).toContain(clause);
    }
    expect(prompt).toContain(KOTLIN_JSON_CASES[0].diff);
  });
});
