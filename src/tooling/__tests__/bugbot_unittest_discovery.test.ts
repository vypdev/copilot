import { evaluateBugbotBenchmark } from '../bugbot_benchmark';
import { buildBugbotBenchmarkPrompt } from '../bugbot_benchmark_runner';
import { UNITTEST_DISCOVERY_CASES, observeUnittestDiscovery } from './fixtures/bugbot_unittest_discovery_oracles';

describe('indirect unittest discovery evidence', () => {
  it.each(UNITTEST_DISCOVERY_CASES)('observes only the authored selection for $id', item => {
    const observed = observeUnittestDiscovery(item);
    if (item.id === 'unittest-discovery-runner-unavailable') {
      expect(observed).toEqual({ kind: 'unavailable' });
      return;
    }
    expect(observed.kind).toBe('selection');
    if (observed.kind !== 'selection') throw new Error('Expected a selection observation.');
    expect(observed.runnerCalls).toBe(1);
    expect(observed.effectiveCwd).toBe('/owned-repo');
    const excluded = item.id === 'unittest-discovery-excluded-by-pattern';
    const wrongDirectory = item.id === 'unittest-discovery-wrong-start-directory';
    expect(observed.selectedMethods).toBe(excluded ? 14 : wrongDirectory ? 1 : 19);
    expect(observed.targetMethods).toBe(excluded || wrongDirectory ? 0 : 5);
    expect(observed.initialCwd).toBe(item.id === 'unittest-discovery-nested-working-directory' ? 'backend' : '.');
    expect(observed.selectedModules.includes('.github/scripts/tests/test_manifest_export.py')).toBe(!excluded && !wrongDirectory);
    if (item.expected.length) {
      const finding = item.expected[0];
      expect(item.diff.split('\n')[finding.line! - item.startLine].slice(1)).toBe(finding.codeSnippet);
      expect(item.diff.split('\n')[finding.line! - item.startLine].startsWith('+')).toBe(true);
    }
  });

  it.each(UNITTEST_DISCOVERY_CASES)('penalizes a wrong verdict for $id with unchanged quality gates', item => {
    const corpus = { schemaVersion: 1 as const, cases: [item] };
    const reference = { schemaVersion: 1 as const, predictions: { [item.id]: item.expected.map(finding => ({ ...finding, confidence: 1 })) } };
    expect(evaluateBugbotBenchmark(corpus, reference).violations).toEqual([]);
    const wrong = evaluateBugbotBenchmark(corpus, { schemaVersion: 1, predictions: { [item.id]: item.expected.length ? [] : [{
      title: 'Invented missing direct invocation', file: item.file, line: item.startLine, category: 'correctness', severity: 'medium',
    }] } });
    expect(wrong.violations.length).toBeGreaterThan(0);
    expect(item.expected.length ? wrong.metrics.falseNegatives : wrong.metrics.falsePositives).toBe(1);
  });

  it('rejects an unknown identity before selecting a compiled factory', () => {
    expect(() => observeUnittestDiscovery({ id: '__proto__', diff: UNITTEST_DISCOVERY_CASES[0].diff }))
      .toThrow('Unknown or modified');
  });
  it('rejects modified code-like data without interpreting it', () => {
    expect(() => observeUnittestDiscovery({ ...UNITTEST_DISCOVERY_CASES[0],
      diff: UNITTEST_DISCOVERY_CASES[0].diff + '\n+raise RuntimeError("must-never-execute")' }))
      .toThrow('Unknown or modified');
  });
  it('does not let expected labels influence source-selection observations', () => {
    for (const item of UNITTEST_DISCOVERY_CASES) {
      const contradictory = { ...item, expected: [{ title: 'Private contradictory verdict', line: 999 }] };
      expect(observeUnittestDiscovery(contradictory)).toEqual(observeUnittestDiscovery(item));
    }
  });
  it('keeps expected labels and replacement text out of actual benchmark prompts', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...UNITTEST_DISCOVERY_CASES[0],
      expected: [{ title: 'Private discovery verdict', suggestion: 'private-replacement-marker' }] });
    expect(prompt).not.toContain('Private discovery verdict');
    expect(prompt).not.toContain('private-replacement-marker');
    expect(prompt).not.toContain('"expected"');
  });
  it('delivers the same runner-selection contract to the real benchmark', () => {
    const prompt = buildBugbotBenchmarkPrompt(UNITTEST_DISCOVERY_CASES[0]);
    for (const clause of ['Read effective repository configuration and inherited library/protocol defaults',
      'follow the full delegated call chain', 'Reconcile same-revision execution/call counts',
      'unrelated/skipped tests prove nothing', 'omit unsupported always-fails claims']) expect(prompt).toContain(clause);
  });
});
