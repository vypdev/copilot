'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const api = require(path.join(root, 'build/api/index.js'));
const currentDirectory = path.join(root, 'quality/bugbot/evidence/issue-950/ev07-shadow');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

async function audit() {
    const corpusFile = path.join(root, 'quality/bugbot/corpus.v1.json');
    const corpus = await api.loadBugbotBenchmark(corpusFile);
    const ledgerFile = path.join(currentDirectory, 'campaign-provenance-attempts.jsonl');
    const ledger = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').map(JSON.parse);
    const controls = read(path.join(currentDirectory, 'campaign-provenance-controls.json'));
    const starts = ledger.filter(row => row.event === 'start');
    assert.equal(starts.length, 1);
    assert.equal(starts[0].implementation, controls.implementation);
    assert.equal(digest(fs.readFileSync(ledgerFile)), controls.artifactHashes['corpus-v3/corpus.jsonl']);
    const cases = ledger.filter(row => row.event === 'case');
    assert.equal(cases.length, 174);
    assert.equal(new Set(cases.map(row => row.id)).size, 174);
    assert(cases.every(row => row.status === 'completed'));
    const predictions = { schemaVersion: 1, predictions: Object.fromEntries(cases.map(row => [row.id, row.predictions])) };
    const score = api.evaluateBugbotBenchmark(corpus, predictions);
    assert.deepEqual(score, controls.corpusScore.score);
    const prior = read(path.join(__dirname, 'prior-03f8e6e3-predictions.json'));
    const priorStart = read(path.join(__dirname, 'prior-03f8e6e3-start.json'));
    const priorPlanFile = path.join(__dirname, 'prior-03f8e6e3-plan.json');
    assert.equal(priorStart.implementation, read(priorPlanFile).implementation);
    assert.equal(priorStart.plan, digest(fs.readFileSync(priorPlanFile)));
    const priorScore = api.evaluateBugbotBenchmark(corpus, prior);
    assert.deepEqual(priorScore, read(path.join(__dirname, 'prior-03f8e6e3-score.json')).score);
    const adjudications = read(path.join(__dirname, 'adjudications.json'));
    const rows = [];
    for (const item of corpus.cases) {
        const measured = predictions.predictions[item.id];
        const result = api.evaluateBugbotBenchmark({ ...corpus, cases: [item] }, predictions);
        if (!result.metrics.falsePositives && !result.metrics.falseNegatives) continue;
        const judgment = adjudications.find(entry => entry.case === item.id);
        assert(judgment, 'missing independent audit row: ' + item.id);
        assert(judgment.reason && judgment.evidence.length && judgment.nextAction);
        // Every discrepancy in this frozen campaign is one unmatched prediction,
        // optionally paired with one unmatched expectation. Reject inventory drift.
        assert.equal(result.metrics.matched, 0);
        assert.equal(result.metrics.falsePositives, measured.length);
        assert.equal(result.metrics.falseNegatives, item.expected.length);
        for (const [kind, findings] of [['prediction', measured], ['expected', item.expected]]) {
            findings.forEach((finding, index) => rows.push({ case: item.id, kind, index,
                scorerLabel: kind === 'prediction' ? 'FP' : 'FN', id: finding.id,
                findingSha256: digest(JSON.stringify(finding)), ...judgment }));
        }
    }
    assert.equal(rows.filter(row => row.kind === 'prediction').length, 17);
    assert.equal(rows.filter(row => row.kind === 'expected').length, 11);
    assert.equal(adjudications.length, new Set(rows.map(row => row.case)).size);
    return { schemaVersion: 1, method: 'unchanged public evaluator; independent causal assessments remain separate',
        implementation: starts[0].implementation, priorImplementation: priorStart.implementation,
        corpusSha256: digest(fs.readFileSync(corpusFile)), currentLedgerSha256: digest(fs.readFileSync(ledgerFile)),
        priorPredictionsSha256: digest(fs.readFileSync(path.join(__dirname, 'prior-03f8e6e3-predictions.json'))),
        score, priorScore, rows, modelCalls: 0, evaluatedPrWriteAttempts: 0,
        qualification: 'not-qualified; no score, label, threshold, prompt or campaign was changed' };
}

if (require.main === module) audit().then(result => {
    const output = process.argv[2];
    if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ current: result.score, prior: result.priorScore, rows: result.rows.length,
        modelCalls: 0, evaluatedPrWriteAttempts: 0 }, null, 2));
}).catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { audit };
