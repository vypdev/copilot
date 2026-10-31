import { evaluateBugbotBenchmark } from '../bugbot_benchmark';
import { buildBugbotBenchmarkPrompt } from '../bugbot_benchmark_runner';
import { KTOR_ROUTING_CASES, observeKtorRouting } from './fixtures/bugbot_ktor_routing_oracles';

describe('versioned routing root selection evidence', () => {
  it.each(KTOR_ROUTING_CASES)('observes the authored identity control for $id', item => {
    const observed = observeKtorRouting(item);
    if (item.id === 'ktor-routing-unavailable-implementation') {
      expect(observed).toEqual({ kind: 'unavailable' });
      return;
    }
    const child = item.id === 'ktor-routing-child-subtree';
    const other = item.id === 'ktor-routing-different-application';
    expect(observed).toEqual({ kind: 'selection', receiver: other ? 'otherApp' : 'app',
      selected: other ? 'other-root' : child ? 'installed-child' : 'installed-root', preservesRoot: !child && !other });
    for (const finding of item.expected) expect(item.diff.split('\n')[finding.line! - item.startLine]).toBe('+' + finding.codeSnippet);
  });
  it.each(KTOR_ROUTING_CASES)('penalizes the opposite verdict for $id under unchanged quality floors', item => {
    const corpus = { schemaVersion: 1 as const, cases: [item] };
    const reference = { schemaVersion: 1 as const, predictions: { [item.id]: item.expected.map(finding => ({ ...finding, confidence: 1 })) } };
    expect(evaluateBugbotBenchmark(corpus, reference).violations).toEqual([]);
    const wrong = evaluateBugbotBenchmark(corpus, { schemaVersion: 1, predictions: { [item.id]: item.expected.length ? [] : [{
      title: 'Invented detached Application.routing root', file: item.file, line: item.startLine, severity: 'medium', category: 'correctness',
    }] } });
    expect(wrong.violations.length).toBeGreaterThan(0);
    expect(item.expected.length ? wrong.metrics.falseNegatives : wrong.metrics.falsePositives).toBe(1);
  });
  it('rejects an unknown identity before selecting an authored control', () => {
    expect(() => observeKtorRouting({ id: '__proto__', diff: KTOR_ROUTING_CASES[0].diff })).toThrow('Unknown or modified');
  });
  it('rejects altered Kotlin-like data without executing it', () => {
    expect(() => observeKtorRouting({ ...KTOR_ROUTING_CASES[0], diff: KTOR_ROUTING_CASES[0].diff + '\n+error("must-not-execute")' }))
      .toThrow('Unknown or modified');
  });
  it('does not derive identity observations from expected verdicts', () => {
    for (const item of KTOR_ROUTING_CASES) {
      const contradictory = { ...item, expected: [{ title: 'Private contradictory verdict' }] };
      expect(observeKtorRouting(contradictory)).toEqual(observeKtorRouting(item));
    }
  });
  it('keeps expected verdicts and replacement text out of model prompts', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...KTOR_ROUTING_CASES[0], expected: [{ title: 'Private routing verdict', suggestion: 'private-routing-replacement' }] });
    expect(prompt).not.toContain('Private routing verdict');
    expect(prompt).not.toContain('private-routing-replacement');
    expect(prompt).not.toContain('"expected"');
  });
  it('delivers the versioned public API and existing grounding through the real benchmark', () => {
    const prompt = buildBugbotBenchmarkPrompt(KTOR_ROUTING_CASES[0]);
    for (const clause of ['Verify the exact framework API and reviewed version', 'similarly named APIs differ',
      'version-matched official documentation or source', 'Reconcile same-revision execution/call counts',
      'omit unsupported always-fails claims', 'pluginOrNull(RoutingRoot)?.apply(configuration)']) expect(prompt).toContain(clause);
    expect(prompt).toContain(KTOR_ROUTING_CASES[0].diff);
  });
});
