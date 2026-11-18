'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { launchFullReview } = require('./launch-full-review.cjs');
const historicalScore = require('./corpus-score.json');

function fixture(t, encoded) {
    const directory = mkdtempSync(path.join(tmpdir(), 'ev07-dispatch-fixture-'));
    t.after(() => rmSync(directory, { force: true, recursive: true }));
    mkdirSync(path.join(directory, 'corpus-v3'));
    if (encoded !== undefined) writeFileSync(path.join(directory, 'corpus-v3', 'corpus-score.json'), encoded);
    return directory;
}

for (const [name, data] of [
    ['missing', undefined],
    ['malformed', '{'],
    ['incomplete', JSON.stringify({ ...historicalScore, complete: false })],
    ['too few cases', JSON.stringify({ ...historicalScore, completed: 173 })],
    ['failed', JSON.stringify({ ...historicalScore, passed: false })],
    ['attempted writes', JSON.stringify({ ...historicalScore, githubWriteAttempts: 1 })],
    ['changed workspace', JSON.stringify({ ...historicalScore, workspaceUnchanged: false })],
    ['contradictory score', JSON.stringify({ ...historicalScore, score: { violations: ['location'], missingCases: [] } })],
]) {
    test(`blocks a ${name} corpus gate at dispatch`, t => {
        const launch = () => assert.fail('no provider work may start');
        const directory = fixture(t, data);
        assert.throws(() => launchFullReview(directory, launch), /independent corpus/);
        const direct = spawnSync(process.execPath, [path.join(__dirname, 'full-review.cjs'), directory], { encoding: 'utf8' });
        assert.equal(direct.status, 1);
        assert.match(direct.stderr, /independent corpus/u);
        assert.equal(existsSync(path.join(directory, 'full-review')), false);
    });
}

test('admits the completed 174-case score and invokes only the pinned runner', t => {
    const directory = fixture(t, JSON.stringify(historicalScore));
    const receipt = {};
    const launch = (executable, args, options) => {
        assert.equal(executable, process.execPath);
        assert.deepEqual(args, [path.join(__dirname, 'full-review.cjs'), directory]);
        assert.deepEqual(options, { stdio: 'inherit' });
        return receipt;
    };
    assert.equal(launchFullReview(directory, launch), receipt);
});
