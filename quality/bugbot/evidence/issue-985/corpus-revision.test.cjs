'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '../../../..');
const read = file => fs.readFileSync(path.join(root, file));
const parse = file => JSON.parse(read(file));
const before = parse('quality/bugbot/corpus.v1.json');
const after = parse('quality/bugbot/corpus.v2.json');
const caseId = 'actions-readonly-metadata';
const select = corpus => corpus.cases.find(row => row.id === caseId);
const workflow = row => yaml.load(row.diff.split('\n').map(line => {
    assert(line.startsWith('+')); return line.slice(1);
}).join('\n'));
const complete = value => value && value.jobs && !value.steps
    && value.jobs.metadata && Array.isArray(value.jobs.metadata.steps);

test('retains the independently observed malformed complete-workflow input', () => {
    const original = workflow(select(before));
    assert(Array.isArray(original.steps));
    assert.equal(original.jobs, undefined);
    assert(!complete(original));
    assert.deepEqual(select(before).expected, []);
});

test('supplies one complete read-only metadata job without checkout or PR code', () => {
    const corrected = workflow(select(after));
    assert(complete(corrected));
    assert.deepEqual(corrected, { on: 'pull_request', permissions: { contents: 'read' }, jobs: {
        metadata: { 'runs-on': 'ubuntu-latest', steps: [{ run: "echo '${{ github.event.pull_request.number }}'" }] },
    } });
    assert.deepEqual(select(after).expected, []);
});

test('the fixed authorized metadata command prints only a synthetic numeric PR', () => {
    const command = workflow(select(after)).jobs.metadata.steps[0].run;
    // Execute only this separately reviewed literal, never arbitrary corpus code.
    assert.equal(command, "echo '${{ github.event.pull_request.number }}'");
    const result = spawnSync(process.platform === 'win32' ? 'bash' : '/bin/bash', ['--noprofile', '--norc', '-e', '-c', command.replace('${{ github.event.pull_request.number }}', '11')], {
        encoding: 'utf8', env: { PATH: process.env.PATH, ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}) },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '11\n');
    assert.equal(result.stderr, '');
});

test('moving the corrected steps out of their job restores the structural defect', () => {
    const invalid = workflow(select(after));
    invalid.steps = invalid.jobs.metadata.steps;
    delete invalid.jobs;
    assert(!complete(invalid));
});

test('loads all 174 stable cases and preserves every other case and all labels', async () => {
    const api = require(path.join(root, 'build/api/index.js'));
    const loaded = await api.loadBugbotBenchmark(path.join(root, 'quality/bugbot/corpus.v2.json'));
    assert.equal(loaded.cases.length, 174);
    assert.deepEqual(after.cases.map(row => row.id), before.cases.map(row => row.id));
    for (let index = 0; index < before.cases.length; index++) {
        if (before.cases[index].id === caseId) {
            assert.deepEqual({ ...after.cases[index], diff: before.cases[index].diff }, before.cases[index]);
        } else assert.deepEqual(after.cases[index], before.cases[index]);
    }
});

test('binds deterministic derivation and preserves all frozen historical artifact bytes', () => {
    const history = require('./historical-hashes.json');
    for (const [file, hash] of Object.entries(history.sha256)) {
        assert.equal(createHash('sha256').update(read(file)).digest('hex'), hash, file);
    }
    const derivation = require('./derivation.json');
    assert.equal(derivation.sourceSha256, history.sha256[derivation.source]);
    assert.equal(createHash('sha256').update(read(derivation.target)).digest('hex'), derivation.targetSha256);
    const expected = JSON.parse(JSON.stringify(before));
    assert.equal(select(expected).diff, derivation.before);
    select(expected).diff = derivation.after;
    assert.deepEqual(after, expected);
    assert.equal(derivation.modelCalls, 0);
    assert.equal(derivation.evaluatedPrWriteAttempts, 0);
});
