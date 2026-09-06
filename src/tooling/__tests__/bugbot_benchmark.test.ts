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
});
