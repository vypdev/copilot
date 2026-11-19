'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, existsSync, rmSync, writeFileSync, mkdirSync, readFileSync } = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { prepareDetector } = require('./review.cjs');
const { requirePinnedCliProbe } = require('./implementation.cjs');
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

for (const mode of ['direct', 'changed-direct', 'launcher', 'changed-launcher']) {
    test('CLI version probe admits bytes before executing ' + mode, t => {
        const directory = mkdtempSync(path.join(tmpdir(), 'ev07-probe-proof-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const marker = path.join(directory, 'executed'), file = path.join(directory, 'codex');
        const usesLauncher = mode.includes('launcher');
        const program = usesLauncher
            ? 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "version");console.log("codex-cli fixture");\n'
            : '#!/bin/sh\nprintf version > "' + marker + '"\nprintf "codex-cli fixture\\n"\n';
        writeFileSync(file, program, { mode: 0o700 });
        const hashFile = filename => createHash('sha256').update(require('node:fs').readFileSync(filename)).digest('hex');
        const runtime = { codex: 'codex-cli fixture', executable: usesLauncher ? process.execPath : file,
            codexSha256: hashFile(usesLauncher ? process.execPath : file),
            ...(usesLauncher && { launcher: file, launcherSha256: hashFile(file) }) };
        if (mode.startsWith('changed')) writeFileSync(file, program + '\n');
        if (mode.startsWith('changed')) {
            assert.throws(() => requirePinnedCliProbe(runtime), /digest/u);
            assert.equal(existsSync(marker), false);
        } else {
            assert.equal(requirePinnedCliProbe(runtime).version, runtime.codex);
            assert.equal(existsSync(marker), true);
        }
    });
}

test('the old PATH version probe executes a shim, while the pinned probe invokes only the admitted CLI', t => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ev07-path-probe-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const bin = path.join(directory, 'bin'), shimMarker = path.join(directory, 'shim-ran'), admitted = path.join(directory, 'admitted');
    mkdirSync(bin);
    writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\ntouch "' + shimMarker + '"\nprintf "codex-cli fixture\\n"\n', { mode: 0o700 });
    writeFileSync(admitted, '#!/bin/sh\nprintf "codex-cli fixture\\n"\n', { mode: 0o700 });
    const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH };
    assert.equal(execFileSync('codex', ['--version'], { env, encoding: 'utf8' }).trim(), 'codex-cli fixture');
    assert.equal(existsSync(shimMarker), true);
    rmSync(shimMarker);
    const runtime = { codex: 'codex-cli fixture', executable: admitted,
        codexSha256: createHash('sha256').update(readFileSync(admitted)).digest('hex') };
    const result = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).requirePinnedCliProbe(JSON.parse(process.argv[2]))',
        path.resolve(__dirname, 'implementation.cjs'), JSON.stringify(runtime)], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(shimMarker), false);
});
