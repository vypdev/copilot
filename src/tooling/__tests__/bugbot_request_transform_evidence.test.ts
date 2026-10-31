import { join } from 'node:path';
import { evaluateBugbotBenchmark, loadBugbotBenchmark } from '../bugbot_benchmark';
import { observeRequestTransform } from './fixtures/bugbot_request_transform_oracles';

const corpusPath = join(__dirname, '../../..', 'quality/bugbot/corpus.v1.json');
const cases = [
  ['coil', false], ['middleware', false], ['unknown', false], ['write', true],
  ['bypass', true], ['overwrite', true], ['mock', true], ['utf8', true],
] as const;

it.each(cases)('penalizes the incorrect request-transform verdict for %s', async (mode, defect) => {
  const corpus = await loadBugbotBenchmark(corpusPath);
  const item = corpus.cases.find(candidate => candidate.id === 'request-transform-' + mode)!;
  expect(item.expected).toHaveLength(defect ? 1 : 0);
  const result = evaluateBugbotBenchmark({ schemaVersion: 1, cases: [item] }, {
    schemaVersion: 1, predictions: { [item.id]: defect ? [] : [{
      title: 'Unsupported missing request header', file: item.file, line: item.startLine, confidence: 0.99,
    }] },
  });
  expect(defect ? result.metrics.falseNegatives : result.metrics.falsePositives).toBe(1);
  expect(result.violations).toEqual(expect.arrayContaining([
    expect.stringContaining(defect ? 'recall' : 'precision'),
  ]));
});

it.each(cases)('observes the authored pipeline independently of the model verdict for %s', async mode => {
  const corpus = await loadBugbotBenchmark(corpusPath);
  const item = corpus.cases.find(candidate => candidate.id === 'request-transform-' + mode)!;
  const result = observeRequestTransform(item);
  if (mode === 'unknown') {
    expect(result).toEqual({ kind: 'unavailable' });
    return;
  }
  const header = mode === 'write' || mode === 'overwrite' ? 'no-cache'
    : mode === 'bypass' || mode === 'mock' ? undefined : 'no-cache, no-store';
  expect(result).toEqual({ kind: 'observed', headers: [header, header, header],
    mockHeaders: mode === 'mock' ? Array(3).fill('no-cache, no-store') : [header, header, header],
    producerCalls: mode === 'bypass' || mode === 'mock' ? 0 : 3,
    productionHeaderPasses: mode === 'coil' || mode === 'middleware' || mode === 'utf8',
    testHeaderPasses: mode === 'coil' || mode === 'middleware' || mode === 'mock' || mode === 'utf8',
    validUtf8: mode !== 'utf8' });
  if (item.expected.length) {
    const finding = item.expected[0];
    expect(item.diff.split('\n')[finding.line! - item.startLine].slice(1).trim()).toBe(finding.codeSnippet);
  }
});

it('rejects modified executable-looking request-transform text before oracle dispatch', () => {
  expect(() => observeRequestTransform({ id: 'request-transform-middleware',
    diff: 'throw new Error("corpus text must never execute")' }))
    .toThrow('Unknown or modified request-transform fixture.');
});

it('rejects an unknown or prototype-like request-transform identity', () => {
  expect(() => observeRequestTransform({ id: '__proto__', diff: '' }))
    .toThrow('Unknown or modified request-transform fixture.');
});
