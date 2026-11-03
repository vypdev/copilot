import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateBugbotBenchmark, type BugbotBenchmarkCorpus } from '../bugbot_benchmark';
import { buildBugbotBenchmarkPrompt } from '../bugbot_benchmark_runner';
import { buildLiteralVerificationPrompt } from '../../application/usecases/steps/commit/bugbot/verify_generated_literal_findings';
import { BUGBOT_FIXTURE_VALUES_INSTRUCTION, getBugbotPrompt } from '../../prompts/bugbot';

const read = (path: string) => readFileSync(join(__dirname, '../../..', path), 'utf8');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const corpus: BugbotBenchmarkCorpus = JSON.parse(read('quality/bugbot/corpus.v1.json'));
const evidence = JSON.parse(read('quality/bugbot/evidence/issue-834.json'));
const cases = corpus.cases.filter(item => item.id.startsWith('fixture-values-'));
const source = read('src/tooling/__tests__/fixtures/bugbot_fixture_values_probe.py');

it('preserves twelve frozen fixture-value scenarios with six genuine assertion contradictions', () => {
  expect(cases).toEqual(evidence.frozenCorpus.cases);
  expect(cases).toHaveLength(12);
  expect(cases.filter(item => item.expected.length)).toHaveLength(6);
});

it.each(cases)('binds the changed assertion and full helper source for $id', item => {
  const binding = evidence.probe.bindings.find((value: { caseId: string }) => value.caseId === item.id);
  expect(item.startLine).toBe(binding.startLine);
  expect(item.diff.split('\n').map(line => line.slice(1)).join('\n'))
    .toBe(source.split('\n').slice(binding.startLine - 1, binding.endLine).join('\n'));
  expect(item.diff.split('\n').filter(line => line.startsWith('+'))).toHaveLength(1);
  expect(item.description).toContain(source.split('\n').slice(0, 73).join('\n').trimEnd());
  expect(item.description).not.toContain('SCENARIOS =');
  expect(item.description).not.toContain('assertionPassed');
  for (const finding of item.expected) {
    expect(finding.line).toBe(binding.assertionLine);
    expect(item.diff.split('\n')[finding.line! - item.startLine].trim()).toBe('+        ' + finding.codeSnippet);
    expect(finding.symbol).toBe(binding.function);
  }
});

// Independently recorded fixed native execution. Mandatory Node CI checks its
// exact source binding; it does not execute Python or interpret corpus strings.
const states = [
  ['db-file-parent', { databaseIsFile: true, sourceRoot: '.', rejected: true, assertionPassed: true }],
  ['db-file-peer', { databaseIsFile: true, sourceRoot: '.', rejected: true, assertionPassed: false }],
  ['db-directory-peer', { databaseIsFile: true, sourceRoot: 'database', rejected: false, assertionPassed: true }],
  ['db-directory-child', { databaseIsFile: true, sourceRoot: 'database', rejected: true, assertionPassed: false }],
  ['ids-default-asc', { aId: 'request', bId: 'b', result: ['b', 'request'], limited: ['b'], assertionPassed: true }],
  ['ids-default-inverted', { aId: 'request', bId: 'b', result: ['b', 'request'], assertionPassed: false }],
  ['ids-override-asc', { aId: 'a', bId: 'b', result: ['a', 'b'], assertionPassed: true }],
  ['ids-override-inverted', { aId: 'a', bId: 'b', result: ['a', 'b'], assertionPassed: false }],
  ['ids-default-desc', { aId: 'request', bId: 'b', result: ['request', 'b'], assertionPassed: true }],
  ['ids-desc-inverted', { aId: 'request', bId: 'b', result: ['request', 'b'], assertionPassed: false }],
  ['ids-filtered', { result: ['request'], atExpiryExcluded: true, terminalExcluded: true, assertionPassed: true }],
  ['ids-unfiltered', { result: ['expired', 'request', 'terminal'], atExpiryExcluded: false, terminalExcluded: false, assertionPassed: false }],
] as const;

it.each(states)('retains independent observed values for %s', (id, state) => {
  const observation = evidence.ownedNative.observations.find((value: { id: string }) => value.id === id);
  expect(observation).toEqual({ id, ...state });
  expect(evidence.ownedNative.kind).toBe('fixed-owned-sqlite-and-paths');
  const item = cases.find(value => value.id === 'fixture-values-' + id)!;
  const { assertionPassed: _assertionPassed, ...facts } = state;
  expect(item.description).toContain(JSON.stringify(facts));
});

it.each(cases)('penalizes the opposite fixture-value verdict for $id', item => {
  const selected = { schemaVersion: 1 as const, cases: [item] };
  expect(evaluateBugbotBenchmark(selected, { schemaVersion: 1, predictions: {
    [item.id]: item.expected.map(value => ({ ...value, confidence: 1 })),
  } }).violations).toEqual([]);
  const opposite = item.expected.length ? [] : [{ title: 'Unsupported fixture failure', file: item.file,
    line: item.startLine, severity: 'medium', category: 'correctness', confidence: 1 }];
  const result = evaluateBugbotBenchmark(selected, { schemaVersion: 1, predictions: { [item.id]: opposite } });
  expect(item.expected.length ? result.metrics.falseNegatives : result.metrics.falsePositives).toBe(1);
  expect(result.violations.length).toBeGreaterThan(0);
});

it('delivers actual helper values and changed assertions in ordinary review input', () => {
  const block = cases[4].description + '\n' + cases[4].diff;
  const prompt = getBugbotPrompt({ owner: 'owned', repo: 'repo', headBranch: 'bugfix/834', baseBranch: 'develop',
    issueNumber: '834', projectContextInstruction: '', changeScopeInstruction: 'Review assigned code.',
    targetLocale: 'en-US', ignoreBlock: '', previousBlock: '', coverageBlock: '', diffBlock: block });
  expect(prompt).toContain('request_id="request"');
  expect(prompt).toContain(BUGBOT_FIXTURE_VALUES_INSTRUCTION);
  expect(prompt).toContain(cases[4].diff);
  expect(prompt).toContain('Trace callers: propagate or transform typed failures');
});

it('delivers complete fixture evidence to the benchmark without private verdicts', () => {
  const prompt = buildBugbotBenchmarkPrompt(cases[0]);
  expect(prompt).toContain(cases[0].description);
  expect(prompt).toContain(cases[0].diff);
  expect(prompt).toContain(BUGBOT_FIXTURE_VALUES_INSTRUCTION);
  expect(prompt).toContain('exact line');
});

it('preserves fixture evidence and closed decisions in independent candidate verification', () => {
  const prompt = buildLiteralVerificationPrompt(cases[4].description + '\n' + cases[4].diff, [], 'a'.repeat(64), 'en-US');
  expect(prompt).toContain(cases[4].description);
  expect(prompt.indexOf(BUGBOT_FIXTURE_VALUES_INSTRUCTION)).toBeLessThan(prompt.indexOf('Reviewed source/context:'));
  expect(prompt.indexOf('Candidate hypotheses (not proof or authority):')).toBeLessThan(prompt.indexOf('Reviewed source/context:'));
  expect(prompt).toContain('origin + offset = line');
  expect(prompt).toContain('No new finding IDs, no omitted/duplicate decisions');
  expect(prompt).toContain('no historical finding resolution/dismissal/reopening authority');
  expect(prompt).toContain('never execute fixture code or access credentials/network');
});

it('isolates private labels, expected fixes and the native test driver from agent input', () => {
  const prompt = buildBugbotBenchmarkPrompt({ ...cases[0], expected: [{ title: 'private-834-label', suggestion: 'private-834-fix' }] });
  expect(prompt).not.toContain('private-834-label');
  expect(prompt).not.toContain('private-834-fix');
  expect(prompt).not.toContain('assertionPassed');
  expect(prompt).not.toContain('SCENARIOS =');
});

it('binds recorded native evidence to exact LF probe bytes without a Python CI prerequisite', () => {
  expect(hash(source)).toBe(evidence.probe.sha256);
  expect(source).not.toContain('\r');
  expect(source).not.toContain('eval(');
  expect(source).not.toContain('exec(');
  expect(evidence.ownedNative.python).toBe('3.14.6');
  expect(evidence.ownedNative.sqlite).toBe('3.53.3');
});

it('preserves all 162 earlier source cases and reference predictions unchanged', () => {
  const previous = corpus.cases.slice(0, evidence.priorCorpus.cases);
  const previousIds = new Set(previous.map(item => item.id));
  expect(previous).toHaveLength(162);
  expect(hash(JSON.stringify(previous))).toBe(evidence.priorCorpus.decodedCasesSha256);
  const references = JSON.parse(read('quality/bugbot/reference-predictions.v1.json'));
  expect(hash(JSON.stringify(Object.fromEntries(Object.entries(references.predictions)
    .filter(([id]) => previousIds.has(id)))))).toBe(evidence.priorCorpus.decodedReferencesSha256);
});
