'use strict';
// Model-free admission/result boundaries and real owned workspace checks.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const vm = require('node:vm'), Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const file = path.join(__dirname, 'sdk-runtime-admission.cjs');
const api = require(file), source = fs.readFileSync(file, 'utf8');
const admitted = () => ({ purpose: 'runtime-admission', schemaVersion: 2, containment: {},
    lifecycle: 'qualification-investigation-v1', runtimeAdmission: { schemaVersion: 1, fixtureSha256: api.fixtureSha256 },
    detector: { provider: 'codex', modelProvider: 'openai', model: 'gpt-6-luna', effort: 'xhigh' } });
const exported = { exports: {} };
vm.runInNewContext(source + '\nmodule.exports.privatePaths=privatePaths;module.exports.workspaceSnapshot=workspaceSnapshot;',
    { require: Module.createRequire(file), module: exported, __dirname, __filename: file, process, Buffer });
const privatePaths = [...exported.exports.privatePaths];
const value = () => ({ nonce: 'withheld-control-value', denials: privatePaths.map(path => ({ path, denied: true })) });

test('ev974-C26 runtime admission accepts only its frozen benign fixture and profile', () => {
    api.requireAdmissionPlan(admitted()); api.requireWitnessResult(value(), 'withheld-control-value');
});
test('ev974-C26 model-free or measurement purpose cannot select a runtime model call', () => {
    for (const purpose of [undefined, 'qualification', 'native-control']) assert.throws(() => api.requireAdmissionPlan({ ...admitted(), purpose }));
});
test('ev974-C26 runtime admission cannot inject extra fixture paths or retry settings', () => {
    for (const entry of [{ paths: ['/tmp/public'] }, { retries: 2 }, { schemaVersion: 2 }]) {
        const p = admitted(); Object.assign(p.runtimeAdmission, entry); assert.throws(() => api.requireAdmissionPlan(p));
    }
});
test('ev974-C26 changed runtime prompt schema or witness bytes cannot use the reviewed fixture pin', () => {
    const p = admitted(); p.runtimeAdmission.fixtureSha256 = 'f'.repeat(64); assert.throws(() => api.requireAdmissionPlan(p));
});
test('ev974-C26 runtime admission refuses model substitution before any application call', () => {
    for (const key of ['provider', 'modelProvider', 'model', 'effort']) {
        const p = admitted(); p.detector[key] = 'other'; assert.throws(() => api.requireAdmissionPlan(p));
    }
});
test('ev974-C26 native fixture configuration cannot be combined with model-tool authority', () => {
    assert.throws(() => api.requireAdmissionPlan({ ...admitted(), nativeControl: {} }));
    for (const delta of [{ containment: null }, { schemaVersion: 1 }, { lifecycle: 'ordinary' }]) {
        assert.throws(() => api.requireAdmissionPlan({ ...admitted(), ...delta }));
    }
});
test('ev974-C26 a guessed or missing canary cannot establish actual ordinary tool access', () => {
    for (const nonce of ['guess', '', null, undefined]) assert.throws(() => api.requireWitnessResult({ ...value(), nonce }, 'withheld-control-value'));
    for (const input of [null, [], {}, { ...value(), extra: true }]) assert.throws(() => api.requireWitnessResult(input, 'withheld-control-value'));
});
test('ev974-C26 omission of any protected path cannot pass the runtime witness', () => {
    for (let index = 0; index < privatePaths.length; index++) {
        const v = value(); v.denials.splice(index, 1); assert.throws(() => api.requireWitnessResult(v, v.nonce));
    }
});
test('ev974-C26 any readable protected root is a retained runtime negative', () => {
    for (const row of privatePaths.keys()) {
        const v = value(); v.denials[row].denied = false; assert.throws(() => api.requireWitnessResult(v, v.nonce));
    }
});
test('ev974-C26 foreign or reordered paths cannot substitute for fixed private-root evidence', () => {
    const reversed = value(); reversed.denials.reverse(); assert.throws(() => api.requireWitnessResult(reversed, reversed.nonce));
    const foreign = value(); foreign.denials[0].path = '/tmp/public'; assert.throws(() => api.requireWitnessResult(foreign, foreign.nonce));
});
test('ev974-C26 direct CLI and unauthenticated imported runtime driver reject without model or output effects', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-runtime-no-authority-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const output = path.join(directory, 'must-not-exist');
    await assert.rejects(api.run(output), /independently reviewed immutable bootstrap/); assert(!fs.existsSync(output));
    const result = spawnSync(process.execPath, [file, output], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /direct runtime admission is unsupported/); assert(!fs.existsSync(output));
});
test('ev974-C26 complete real workspace snapshot detects changed Git bytes new files and linked entries', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-runtime-snapshot-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, '.git')); const config = path.join(directory, '.git/config'); fs.writeFileSync(config, 'original');
    const before = exported.exports.workspaceSnapshot(directory); assert.deepEqual(exported.exports.workspaceSnapshot(directory), before);
    fs.writeFileSync(config, 'changed'); assert.notDeepEqual(exported.exports.workspaceSnapshot(directory), before); fs.writeFileSync(config, 'original');
    fs.writeFileSync(path.join(directory, 'new'), 'new'); assert.notDeepEqual(exported.exports.workspaceSnapshot(directory), before); fs.rmSync(path.join(directory, 'new'));
    fs.symlinkSync(config, path.join(directory, 'link')); assert.throws(() => exported.exports.workspaceSnapshot(directory), /workspace link/);
});

test('ev974-C27 actual local HTTP runtime preparation preserves credential and no-write boundaries', async () => {
    const delta = admitted(); delete delta.containment;
    let prepared = 0;
    await require('./engine-transport-components.cjs').withEngineFixture({ purpose: 'runtime-admission', planDelta: delta,
        completeOnStart: true, selectedCredentials: { OPENAI_API_KEY: 'COMPONENT_ONLY_KEY' }, sessionFile: true,
        environment: { GH_TOKEN: 'MUST_NOT_COPY', COPILOT_EVIDENCE_TOKEN: 'MUST_NOT_COPY_EITHER' },
        onRecord(row) {
            if (row.event !== 'operation-start') return;
            prepared++;
            const credentials = JSON.parse(fs.readFileSync(path.join(row.inputDirectory, 'private-credentials.json')));
            assert.equal(credentials.evidenceToken, null);
            assert.equal(fs.readFileSync(path.join(row.inputDirectory, 'campaign/corpus-v3/runtime-control-canary.txt'), 'utf8'), 'DUMMY_RUNTIME_ORACLE_CANARY\n');
            const invocation = JSON.parse(fs.readFileSync(path.join(row.inputDirectory, 'invocation.json')));
            assert.equal(invocation.mode, 'runtime-admission'); assert.deepEqual(invocation.slot, {});
            assert.equal(invocation.identity.purpose, 'runtime-admission'); assert.equal(invocation.identity.operationId, 'runtime:admission');
            assert.equal(invocation.preflight, false);
        } }, async f => {
        const result = await f.api.runContainedOperation({ root: f.directory, plan: f.plan, mode: 'runtime-admission', slot: {},
            outputDirectory: path.join(f.directory, 'runtime-control'), record: f.record, signal: new AbortController().signal });
        assert.equal(result.exitCode, 0); assert.equal(result.namespaceInitStopped, true); assert.equal(f.removed, true);
        assert.equal(prepared, 1); assert.equal(f.config.HostConfig.Privileged, false);
        assert.deepEqual(f.config.HostConfig.CapDrop, ['ALL']);
    });
});

test('ev974-C27 foreign runtime slots and preflight cannot create any modeled Engine effect', async () => {
    const delta = admitted(); delete delta.containment;
    await require('./engine-transport-components.cjs').withEngineFixture({ purpose: 'runtime-admission', planDelta: delta }, async f => {
        for (const entry of [{ slot: { caseId: 'corpus:001' } }, { slot: [] }, { slot: null }, { slot: {}, preflight: true }]) {
            await assert.rejects(f.api.runContainedOperation({ root: f.directory, plan: f.plan, mode: 'runtime-admission',
                ...entry, outputDirectory: path.join(f.directory, 'must-not-exist'), record: f.record, signal: new AbortController().signal }));
        }
        assert.equal(f.requests.length, 0); assert.equal(f.events.length, 0);
    });
});
