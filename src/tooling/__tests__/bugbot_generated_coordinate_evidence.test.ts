import { join } from 'node:path';
import { evaluateBugbotBenchmark, loadBugbotBenchmark } from '../bugbot_benchmark';
import { GENERATED_COORDINATE_CASES, observeGeneratedCoordinates } from './fixtures/bugbot_generated_coordinate_oracles';
import { projectPythonLiteralWitnesses } from '../../application/policies/bugbot_python_literal_witness_policy';

const path = join(__dirname, '../../..', 'quality/bugbot/corpus.v1.json');
const modes = [
  ['literal', 6, 7, false], ['leading-newline', 7, 8, false], ['escaped', 6, 7, false],
  ['dedent', 6, 7, false], ['wrong-literal', 6, 7, true], ['wrong-leading-newline', 7, 8, true],
] as const;

it.each(modes)('penalizes an incorrect generated-coordinate verdict for %s', async (mode, _positive, _negative, defect) => {
  const corpus = await loadBugbotBenchmark(path);
  const item = corpus.cases.find(candidate => candidate.id === 'generated-source-' + mode)!;
  expect(item).toEqual(GENERATED_COORDINATE_CASES.find(candidate => candidate.id === item.id));
  expect(item.expected).toHaveLength(defect ? 1 : 0);
  const result = evaluateBugbotBenchmark({ schemaVersion: 1, cases: [item] }, {
    schemaVersion: 1, predictions: { [item.id]: defect ? [] : [{
      title: 'Unsupported generated-line failure', file: item.file, line: item.startLine, confidence: 0.99,
    }] },
  });
  expect(defect ? result.metrics.falseNegatives : result.metrics.falsePositives).toBe(1);
  expect(result.violations).toEqual(expect.arrayContaining([expect.stringContaining(defect ? 'recall' : 'precision')]));
});

it.each(modes)('maps authored written bytes independently of model output for %s', async (mode, positive, negative, defect) => {
  const item = GENERATED_COORDINATE_CASES.find(candidate => candidate.id === 'generated-source-' + mode)!;
  const observed = observeGeneratedCoordinates(item);
  expect(observed).toEqual({ kind: 'source-mapping', bytes: expect.any(Buffer), positiveLine: positive,
    negativeLine: negative, selectedLine: defect ? positive : negative,
    selectedText: defect ? 'if (checked > 0) return 1' : 'return -1', authoredInput: 4,
    selectedRole: defect ? 'executed-positive' : 'unexecuted-negative',
    counterAssertionConsistentWithAuthoredCall: !defect });
  expect(observed.bytes[0] === 10).toBe(mode.includes('leading-newline'));
  expect(observed.bytes.toString('utf8').split('\n')[negative - 1].trim()).toBe('return -1');
  const witness = projectPythonLiteralWitnesses(item.diff).witnesses[0];
  expect(witness.lines[positive - 1].trim()).toBe('if (checked > 0) return 1');
  expect(witness.lines[negative - 1].trim()).toBe('return -1');
  expect(witness.lines.join('\n') + '\n').toBe(observed.bytes.toString('utf8'));
  if (defect) {
    const finding = item.expected[0];
    expect(item.diff.split('\n')[finding.line! - item.startLine].slice(1).trim()).toBe(finding.codeSnippet);
  }
});

it('rejects modified executable-looking coordinate corpus text before source observation', () => {
  expect(() => observeGeneratedCoordinates({ id: 'generated-source-literal',
    diff: 'throw new Error("inert corpus text must never execute")' }))
    .toThrow('Unknown or modified generated-source fixture.');
});

it('rejects an unknown or prototype-like generated-coordinate identity', () => {
  expect(() => observeGeneratedCoordinates({ id: '__proto__', diff: '' }))
    .toThrow('Unknown or modified generated-source fixture.');
});


it.each(['generated-literal-independent-shell', 'generated-literal-independent-contract'])('keeps the independent actionable defect control %s in literal-bearing source', async id => {
  const corpus = await loadBugbotBenchmark(path);
  const item = corpus.cases.find(candidate => candidate.id === id)!;
  expect(projectPythonLiteralWitnesses(item.diff).witnesses).toHaveLength(1);
  expect(item.expected).toHaveLength(1);
  expect(item.diff.split('\n')[item.expected[0].line! - 1].slice(1).trim())
    .toBe(item.expected[0].codeSnippet);
  const result = evaluateBugbotBenchmark({ schemaVersion: 1, cases: [item] }, { schemaVersion: 1, predictions: { [id]: [] } });
  expect(result.metrics.falseNegatives).toBe(1);
});
