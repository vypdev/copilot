'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { audit } = require('./audit.cjs');
const root = path.resolve(__dirname, '../../../..');
const api = require(path.join(root, 'build/api/index.js'));

test('reproduces all frozen current scores and gives every 17 FP and 11 FN an independent row', async () => {
    const result = await audit();
    assert.equal(result.score.metrics.matched, 69);
    assert.equal(result.score.violations.length, 3);
    assert.equal(result.rows.length, 28);
    assert.equal(result.rows.filter(row => row.classification === 'taxonomy-mismatch').length, 22);
    assert.equal(result.modelCalls, 0);
    assert.equal(result.evaluatedPrWriteAttempts, 0);
});

test('reproduces the exact prior 03f8e6e3 predictions under the identical original rubric', async () => {
    const result = await audit();
    assert.equal(result.priorScore.metrics.matched, 73);
    assert.equal(result.priorScore.metrics.falsePositives, 10);
    assert.equal(result.priorScore.metrics.falseNegatives, 7);
    assert.deepEqual(result.priorScore.violations, ['precision 0.880 is below 0.900']);
});

test('a diagnostic category change cannot retrospectively pass or rewrite the frozen campaign', async () => {
    const before = await audit();
    const corpus = await api.loadBugbotBenchmark(path.join(root, 'quality/bugbot/corpus.v1.json'));
    const item = corpus.cases.find(row => row.id === 'request-transform-write');
    const ledger = fs.readFileSync(path.join(__dirname, '../issue-950/ev07-shadow/campaign-provenance-attempts.jsonl'), 'utf8')
        .trim().split('\n').map(JSON.parse);
    const finding = ledger.find(row => row.id === item.id).predictions[0];
    const score = prediction => api.evaluateBugbotBenchmark({ ...corpus, cases: [item] },
        { schemaVersion: 1, predictions: { [item.id]: [prediction] } });
    assert.equal(score(finding).metrics.matched, 0);
    assert.equal(score({ ...finding, category: item.expected[0].category }).metrics.matched, 1);
    const after = await audit();
    assert.deepEqual(after, before);
    assert.equal(after.qualification.startsWith('not-qualified'), true);
});
