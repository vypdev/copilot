import { join } from 'node:path';
import { evaluateBugbotBenchmark, loadBugbotBenchmark } from '../bugbot_benchmark';
import { INITIAL_SESSION_CASES, observeInitialSessionSource } from './fixtures/bugbot_initial_session_oracles';

const path = join(__dirname, '../../..', 'quality/bugbot/corpus.v1.json');
const modes = [
  ['signed-bootstrap', 'signed.setup.ts', 0, 3, 3, true],
  ['storage-alias', 'alias.setup.ts', 0, 3, 3, true],
  ['opaque-bootstrap', 'opaque.setup.ts', 1, 1, 1, false],
  ['expired-refresh', 'signed.setup.ts', 1, 3, 1, false],
  ['prefix-gap', 'signed.setup.ts', 0, 3, 3, false],
  ['setup-unavailable', undefined, undefined, undefined, undefined, undefined],
] as const;

it.each(modes)('observes the owned configuration-selected source for %s', (mode, setup, tokenEndpointCalls, initialSegments, selectedSegments, assertionPassed) => {
  const item = INITIAL_SESSION_CASES.find(value => value.id === 'session-source-' + mode)!;
  const result = observeInitialSessionSource(item);
  expect(result).toEqual(mode === 'setup-unavailable' ? { kind: 'unavailable' }
    : { kind: 'observed', setup, tokenEndpointCalls, initialSegments, selectedSegments, assertionPassed });
});

it.each(modes)('keeps the fixed corpus verdict and penalizes its reversal for %s', async mode => {
  const corpus = await loadBugbotBenchmark(path);
  const item = corpus.cases.find(value => value.id === 'session-source-' + mode)!;
  expect(item).toEqual(INITIAL_SESSION_CASES.find(value => value.id === item.id));
  const defect = item.expected.length > 0;
  const result = evaluateBugbotBenchmark({ schemaVersion: 1, cases: [item] }, { schemaVersion: 1, predictions: {
    [item.id]: defect ? [] : [{ title: 'Unsupported initial token attribution', file: item.file, line: item.startLine, confidence: 0.99 }],
  } });
  expect(defect ? result.metrics.falseNegatives : result.metrics.falsePositives).toBe(1);
  if (defect) expect(item.diff.split('\n')[item.expected[0].line! - 1].slice(1)).toBe(item.expected[0].codeSnippet);
});

it('rejects altered executable-looking source before any fixture execution', () => {
  const item = INITIAL_SESSION_CASES[0];
  expect(() => observeInitialSessionSource({ id: item.id, diff: 'process.env; throw new Error("untrusted must never execute")' }))
    .toThrow('Unknown or modified');
});

it('rejects a prototype-like unowned fixture identity', () => {
  expect(() => observeInitialSessionSource({ id: '__proto__', diff: '' })).toThrow('Unknown or modified');
});

it('derives observations from owned source independently of expected verdicts', () => {
  const item = INITIAL_SESSION_CASES.find(value => value.id === 'session-source-opaque-bootstrap')!;
  const changedVerdict = { ...item, expected: [] };
  expect(observeInitialSessionSource(changedVerdict)).toEqual(expect.objectContaining({ assertionPassed: false, selectedSegments: 1 }));
  expect(Object.isFrozen(item)).toBe(true);
});

it('retains only source/shape facts rather than token values, signatures or keys', () => {
  const observations = INITIAL_SESSION_CASES.map(item => observeInitialSessionSource(item));
  const text = JSON.stringify(observations);
  expect(text).not.toContain('owned-synthetic-fixture-key');
  expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]+\./u);
  expect(observations[0]).not.toHaveProperty('access_token');
});
