import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { evaluateBugbotBenchmark, loadBugbotBenchmark, loadBugbotPredictions } from '../bugbot_benchmark';

describe('versioned Bugbot benchmark', () => {
  const root = join(__dirname, '..', '..', '..');

  it('loads the multilingual ground-truth corpus and passes its reference contract', async () => {
    const corpus = await loadBugbotBenchmark(join(root, 'quality/bugbot/corpus.v1.json'));
    const predictions = await loadBugbotPredictions(join(root, 'quality/bugbot/reference-predictions.v1.json'));
    const result = evaluateBugbotBenchmark(corpus, predictions);

    expect(corpus.cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(corpus.cases.map((item) => item.language)).size).toBeGreaterThanOrEqual(10);
    expect(corpus.cases.filter((item) => item.expected.length === 0).length).toBeGreaterThanOrEqual(8);
    expect(corpus.cases.filter((item) => item.expected.length > 0).length).toBeGreaterThanOrEqual(8);
    expect(result.violations).toEqual([]);
    expect(result.metrics).toEqual(expect.objectContaining({ precision: 1, recall: 1, f1: 1 }));
  });

  it('fails the gate for missing cases and noisy predictions', async () => {
    const corpus = await loadBugbotBenchmark(join(root, 'quality/bugbot/corpus.v1.json'));
    const result = evaluateBugbotBenchmark(corpus, {
      schemaVersion: 1,
      predictions: { 'docs-only': [{ title: 'Style concern', confidence: 0.95 }] },
    });
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.missingCases.length).toBe(corpus.cases.length - 1);
  });

  it('rejects malformed prediction findings at the file boundary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugbot-benchmark-'));
    const path = join(directory, 'predictions.json');
    try {
      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        predictions: { malformed: [{ title: 42 }] },
      }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('Invalid Bugbot finding');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects malformed corpora, duplicate cases, and unsafe numeric findings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugbot-benchmark-'));
    const path = join(directory, 'input.json');
    const validCase = {
      id: 'case-1',
      language: 'typescript',
      category: 'correctness',
      description: 'Detect the defect',
      file: 'src/example.ts',
      startLine: 1,
      diff: '+ defect',
      expected: [],
    };
    try {
      await writeFile(path, JSON.stringify({ schemaVersion: 2, cases: [] }));
      await expect(loadBugbotBenchmark(path)).rejects.toThrow('Invalid Bugbot benchmark corpus');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, cases: [] }));
      await expect(loadBugbotBenchmark(path)).rejects.toThrow('between 1 and 200 cases');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, cases: [validCase, validCase] }));
      await expect(loadBugbotBenchmark(path)).rejects.toThrow('ids must be unique');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, cases: [{ ...validCase, startLine: 0 }] }));
      await expect(loadBugbotBenchmark(path)).rejects.toThrow('Invalid Bugbot benchmark case');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, predictions: [] }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('Invalid Bugbot benchmark predictions');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, predictions: { case: 'invalid' } }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('predictions for case');

      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        predictions: { case: [{ title: 'Finding', line: 0 }] },
      }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('Invalid line');

      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        predictions: { case: [{ title: 'Finding', confidence: Number.NaN }] },
      }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('Invalid confidence');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
