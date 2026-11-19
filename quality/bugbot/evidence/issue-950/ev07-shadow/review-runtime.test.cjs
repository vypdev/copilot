'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { prepareDetector } = require('./review.cjs');
const plan = { ...require('./configuration.cjs'), runtime: { codex: 'codex-cli 0.169.1' } };

for (const mode of ['pinned', 'foreign', 'missing']) {
    test(`full-review prepare checks the actual private runtime before dispatch: ${mode}`, t => {
        const runtimeDirectory = mkdtempSync(path.join(tmpdir(), 'ev07-runtime-control-'));
        t.after(() => rmSync(runtimeDirectory, { recursive: true, force: true }));
        const execution = { runtimeDirectory,
            argv: ['exec', '--model', plan.detector.model, '-c', 'model_provider="openai"',
                '-c', 'model_reasoning_effort="xhigh"', '--sandbox', 'read-only'],
            runtimeContract: mode === 'missing' ? undefined : {
                version: mode === 'pinned' ? plan.runtime.codex : 'codex-cli 0.0.0',
            } };
        const request = { prompt: 'controlled request' }, observations = [];
        const planner = { prepare(input) { assert.equal(input, request); return execution; } };
        if (mode === 'pinned') {
            assert.equal(prepareDetector(planner, request, row => observations.push(row), plan), execution);
            assert.equal(observations[0].runtime, plan.runtime.codex);
            assert.equal(existsSync(runtimeDirectory), true);
        } else {
            assert.throws(() => prepareDetector(planner, request, row => observations.push(row), plan), /CLI version/u);
            assert.equal(existsSync(runtimeDirectory), false);
            assert.deepEqual(observations, []);
        }
    });
}
