'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, existsSync, rmSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { prepareDetector } = require('./review.cjs');
const plan = { ...require('./configuration.cjs'), runtime: { codex: 'codex-cli 0.169.1' } };

for (const mode of ['pinned', 'foreign', 'missing', 'wrong-executable', 'missing-digest', 'launcher', 'wrong-launcher', 'missing-launcher']) {
    test(`full-review prepare checks the actual private runtime before dispatch: ${mode}`, t => {
        const runtimeDirectory = mkdtempSync(path.join(tmpdir(), 'ev07-runtime-control-'));
        t.after(() => rmSync(runtimeDirectory, { recursive: true, force: true }));
        const executable = path.join(runtimeDirectory, 'executable'), launcher = path.join(runtimeDirectory, 'launcher.js');
        writeFileSync(executable, 'controlled executable artifact');
        writeFileSync(launcher, 'controlled launcher artifact');
        const hash = text => createHash('sha256').update(text).digest('hex');
        const runtime = { ...plan.runtime, codexSha256: hash('controlled executable artifact') };
        if (mode === 'missing-digest') delete runtime.codexSha256;
        if (mode === 'wrong-executable') runtime.codexSha256 = 'a'.repeat(64);
        const usesLauncher = mode.includes('launcher');
        if (usesLauncher && mode !== 'missing-launcher') runtime.launcherSha256 = hash('controlled launcher artifact');
        if (mode === 'wrong-launcher') runtime.launcherSha256 = 'b'.repeat(64);
        const execution = { runtimeDirectory, executable,
            ...(usesLauncher ? { launcherArgv: [launcher], launcherSha256: hash('controlled launcher artifact') } : {}),
            argv: ['exec', '--model', plan.detector.model, '-c', 'model_provider="openai"',
                '-c', 'model_reasoning_effort="xhigh"', '--sandbox', 'read-only'],
            runtimeContract: mode === 'missing' ? undefined : {
                version: mode === 'foreign' ? 'codex-cli 0.0.0' : plan.runtime.codex,
            } };
        const request = { prompt: 'controlled request' }, observations = [];
        const planner = { prepare(input) { assert.equal(input, request); return execution; } };
        const selected = { ...plan, runtime };
        if (['pinned', 'launcher'].includes(mode)) {
            assert.equal(prepareDetector(planner, request, row => observations.push(row), selected), execution);
            assert.equal(observations[0].runtime, plan.runtime.codex);
            assert.equal(observations[0].runtimeProof.executableSha256, runtime.codexSha256);
            assert.equal(existsSync(runtimeDirectory), true);
        } else {
            assert.throws(() => prepareDetector(planner, request, row => observations.push(row), selected), /CLI version|digest/u);
            assert.equal(existsSync(runtimeDirectory), false);
            assert.deepEqual(observations, []);
        }
    });
}
