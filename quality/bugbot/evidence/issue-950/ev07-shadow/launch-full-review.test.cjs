'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { launchFullReview } = require('./launch-full-review.cjs');
const historicalScore = require('./corpus-score.json');
const { requirePinnedImplementation } = require('./implementation.cjs');

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

test('attests the Git implementation before dispatch and rejects changed tracked or untracked sources', t => {
    const repository = fixture(t);
    const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet', '--template=');
    mkdirSync(path.join(repository, 'src'));
    const file = path.join(repository, 'src', 'review.ts');
    writeFileSync(file, 'export const review = true;\n');
    writeFileSync(path.join(repository, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    git('add', 'src', 'pnpm-lock.yaml');
    git('-c', 'user.name=Test', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Frozen implementation');
    const pin = git('rev-parse', 'HEAD');

    assert.equal(requirePinnedImplementation(repository, pin), pin);
    writeFileSync(file, 'export const review = false;\n');
    assert.throws(() => requirePinnedImplementation(repository, pin), /does not match/u);
    git('add', 'src');
    writeFileSync(file, 'export const review = true;\n');
    assert.throws(() => requirePinnedImplementation(repository, pin), /staged application source/u);
    git('restore', '--staged', 'src');
    writeFileSync(path.join(repository, 'src', 'review.js'), 'extra source');
    assert.throws(() => requirePinnedImplementation(repository, pin), /untracked application source/u);
});
