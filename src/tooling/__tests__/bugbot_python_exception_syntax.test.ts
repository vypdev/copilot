import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateBugbotBenchmark, type BugbotBenchmarkCorpus } from '../bugbot_benchmark';
import { buildBugbotBenchmarkPrompt } from '../bugbot_benchmark_runner';
import { createHash } from 'node:crypto';
import { buildLiteralVerificationPrompt } from '../../application/usecases/steps/commit/bugbot/verify_generated_literal_findings';
import { BUGBOT_PYTHON_SYNTAX_INSTRUCTION } from '../../prompts/bugbot';

const corpus: BugbotBenchmarkCorpus = JSON.parse(readFileSync(join(__dirname, '../../../quality/bugbot/corpus.v1.json'), 'utf8'));
const cases = corpus.cases.filter(item => item.id.startsWith('py-pep758-'));

describe('version-grounded Python exception syntax', () => {
  it('keeps twelve frozen compatibility and contrary-evidence cases', () => {
    expect(cases).toHaveLength(12);
    expect(cases.filter(item => item.expected.length)).toHaveLength(6);
    expect(cases.map(item => item.id)).toContain('py-pep758-unbound-handler');
  });

  it.each(cases)('penalizes an incorrect finding decision for $id', item => {
    const selected = { schemaVersion: 1 as const, cases: [item] };
    const correct = item.expected.map(finding => ({ ...finding, confidence: 1 }));
    expect(evaluateBugbotBenchmark(selected, { schemaVersion: 1, predictions: { [item.id]: correct } }).violations).toEqual([]);
    const wrong = item.expected.length ? [] : [{ title: 'Unsupported universal Python 3 SyntaxError', file: item.file,
      line: 4, category: 'correctness', severity: 'medium', confidence: 1 }];
    const result = evaluateBugbotBenchmark(selected, { schemaVersion: 1, predictions: { [item.id]: wrong } });
    expect(item.expected.length ? result.metrics.falseNegatives : result.metrics.falsePositives).toBe(1);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it.each(cases)('retains exact source, runtime and changed anchors for $id', item => {
    const prompt = buildBugbotBenchmarkPrompt(item);
    expect(prompt).toContain(item.description);
    expect(prompt).toContain(item.diff);
    expect(item.diff.split('\n')[3][0]).toBe('+');
    for (const finding of item.expected) {
      expect(finding.line).toBe(4);
      expect(finding.codeSnippet).toBe(item.diff.split('\n')[3].slice(1));
    }
  });

  it('delivers supported-version and contrary-evidence guidance to the real benchmark', () => {
    const prompt = buildBugbotBenchmarkPrompt(cases[0]);
    for (const clause of ['Python 3.14 / PEP 758', 'without as', 'except*', 'supported older interpreter',
      'Ruff target alone', 'same-head', 'Parsing is not import/runtime proof', 'never invent parser/CI execution']) expect(prompt).toContain(clause);
  });

  it('never exposes private verdicts or replacement labels in agent inputs', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...cases[0], expected: [{ title: 'private-pep758-verdict', suggestion: 'private-pep758-fix' }] });
    expect(prompt).not.toContain('private-pep758-verdict');
    expect(prompt).not.toContain('private-pep758-fix');
    expect(prompt).not.toContain('"expected"');
  });

  it('preserves every earlier corpus input and reference prediction', () => {
    const evidence = JSON.parse(readFileSync(join(__dirname, '../../../quality/bugbot/evidence/issue-831.json'), 'utf8'));
    const references = JSON.parse(readFileSync(join(__dirname, '../../../quality/bugbot/reference-predictions.v1.json'), 'utf8'));
    const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const previous = corpus.cases.slice(0, evidence.priorCorpus.cases);
    expect(previous).toHaveLength(evidence.priorCorpus.cases);
    expect(hash(previous)).toBe(evidence.priorCorpus.decodedCasesSha256);
    expect(hash(Object.fromEntries(Object.entries(references.predictions).filter(([id]) => previous.some(item => item.id === id)))))
      .toBe(evidence.priorCorpus.decodedReferencesSha256);
    expect(cases).toEqual(evidence.frozenCorpus.cases);
  });

  it('retains the language rule as trusted guidance in independent candidate verification', () => {
    const prompt = buildLiteralVerificationPrompt('untrusted-old-review-instruction', [], 'a'.repeat(64), 'en-US');
    expect(prompt).toContain(BUGBOT_PYTHON_SYNTAX_INSTRUCTION);
    expect(prompt.indexOf(BUGBOT_PYTHON_SYNTAX_INSTRUCTION)).toBeLessThan(prompt.indexOf('Reviewed source/context:'));
    expect(prompt).toContain('No new finding IDs, no omitted/duplicate decisions');
    expect(prompt).toContain('no historical finding resolution/dismissal/reopening authority');
  });
});
