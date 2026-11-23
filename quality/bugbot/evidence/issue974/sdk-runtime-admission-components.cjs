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
    for (const delta of [{ containment: null }, { schemaVersion: 1 }, { lifecycle: 'ordinary' }, { runtimeAdmission: null }]) {
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

function controllerFixture(t, options = {}) {
    // Real owned filesystem/Git and durable recorder; explicitly modeled SDK
    // and containment ports. This cannot accredit an actual model or namespace.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-runtime-controller-'));
    const originalCwd = process.cwd(), output = path.join(directory, 'worker-output');
    t.after(() => { process.chdir(originalCwd); fs.rmSync(directory, { recursive: true, force: true }); });
    const files = privatePaths.slice(0, -1).map((_, i) => path.join(directory, 'private-' + i));
    for (const [i, target] of files.entries()) if (!(options.missingAuth && i === 3)) fs.writeFileSync(target, 'DUMMY_PRIVATE_CONTENT');
    const mapped = value => {
        if (typeof value !== 'string') return value;
        if (value.startsWith('/qualification-output/runtime-admission')) return output + value.slice('/qualification-output/runtime-admission'.length);
        const index = privatePaths.indexOf(value); return index < 0 ? value : files[index];
    };
    const controlledFs = new Proxy(fs, { get(target, key) {
        if (key === 'mkdtempSync') return () => fs.mkdtempSync(path.join(directory, 'workspace-'));
        const item = target[key]; return typeof item === 'function' ? (...args) => item(...args.map(mapped)) : item;
    } });
    const selected = { ...admitted(), runtime: { codex: 'codex-cli modeled', executableSha256: 'a'.repeat(64) } };
    const cancel = new AbortController(), operation = options.host ? undefined : {
        identity: { purpose: 'runtime-admission', operationId: 'runtime:admission' }, signal: cancel.signal,
        preflight: false, slot: {},
    };
    const durable = require('./attempt-ledger.cjs');
    const proof = require('../issue-950/execution-provenance.cjs');
    let attempts = 0, preparations = 0, scopes = 0, runtimeDirectory;
    class ModeledClient {
        constructor(planner, observer) { this.planner = planner; this.observer = observer; }
        async execute(request) {
            const common = { provider: 'codex', capability: 'findings' };
            this.observer.observe({ ...common, state: 'started', phase: 'plan' });
            const execution = this.planner.prepare(request);
            this.observer.observe({ ...common, state: 'admitted', phase: 'preflight', version: selected.runtime.codex,
                workspaceMode: execution.workspaceMode, outputContract: execution.output,
                artifactHashes: execution.artifacts.map(item => item.sha256) });
            attempts++;
            try {
                if (options.modelFailure) throw Object.assign(new Error('Modeled unavailable provider'), { category: 'process' });
                if (options.mutateGit) fs.appendFileSync(path.join(process.cwd(), '.git/config'), '\n# unexpected write\n');
                const result = { nonce: options.guessedNonce ? 'guess' : fs.readFileSync('workspace-canary.txt', 'utf8'),
                    denials: privatePaths.map(path => ({ path, denied: true })) };
                const response = JSON.stringify(result);
                this.observer.observe({ ...common, state: 'completed', phase: 'run', outputBytes: Buffer.byteLength(response) });
                return response;
            } finally { fs.rmSync(execution.runtimeDirectory, { recursive: true, force: true }); }
        }
    }
    const nativeRequire = Module.createRequire(file), owner = { exports: {} };
    const controlledRequire = name => {
        if (name === 'node:fs') return controlledFs;
        if (name === '../issue-950/execution-provenance.cjs') return {
            requireBootstrapAdmission() {}, bootstrapOperation: () => operation,
            trustedGitExecutable: proof.trustedGitExecutable, gitEnvironment: proof.gitEnvironment,
        };
        if (name === '../issue-950/ev07-shadow/configuration.cjs') return selected;
        if (name === '../issue-950/ev07-shadow/implementation.cjs') return {
            qualificationProvenance: () => ({ modeledUnitOnly: true }),
            preparePinnedExecution(_planner, request) {
                preparations++; runtimeDirectory = fs.mkdtempSync(path.join(directory, 'runtime-'));
                return { runtimeDirectory, argv: ['--model', 'gpt-6-luna', '-c', 'model_provider="openai"', '-c',
                    'model_reasoning_effort="xhigh"', '--sandbox', 'read-only'], runtimeContract: { version: selected.runtime.codex },
                workspaceMode: 'read-only', output: 'native-and-local-json-schema', qualificationInvestigation: true,
                artifacts: options.noSchema ? [] : [{ purpose: 'output-schema', sha256: require('node:crypto').createHash('sha256').update(JSON.stringify(request.outputSchema)).digest('hex') }] };
            },
            requirePinnedExecution() {
                if (options.pinFailure) throw new Error('Modeled pinned CLI refusal');
                return { executableSha256: selected.runtime.executableSha256 };
            },
        };
        if (name.endsWith('/agent_capability_composition_root')) return { createFindingsQueryPort: ({ cli }) => ({
            async query(request) {
                const response = await cli.execute({ ...request, capability: 'findings', outputSchema: request.options.schema });
                return options.objectResponse ? JSON.parse(response) : response;
            },
        }) };
        if (name.endsWith('/agent_execution_planner')) return { AgentExecutionPlanner: class {} };
        if (name.endsWith('/agent_cli_client')) return { AgentCliClient: ModeledClient };
        if (name === './attempt-ledger.cjs') return {
            createDurableRecorder: target => durable.createDurableRecorder(mapped(target)),
            createRecordedCli: request => durable.createRecordedCli({ ...request, artifactDirectory: mapped(request.artifactDirectory) }),
            validateCompleteAttempts: (rows, cases, plan, artifacts) => durable.validateCompleteAttempts(rows, cases, plan, mapped(artifacts)),
        };
        if (name === './operation-containment.cjs') return { async runContainedOperation(request) {
            scopes++;
            const inner = path.join(request.outputDirectory, 'runtime-admission'); fs.mkdirSync(inner, { recursive: true });
            fs.writeFileSync(path.join(inner, 'runtime-admission.jsonl'), options.innerLedger ?? '{"event":"runtime-control-pass"}\n');
            return options.terminal ?? { exitCode: 0, interrupted: false, namespaceInitStopped: true };
        } };
        return nativeRequire(name);
    };
    // Use the same JavaScript realm as the semantic ports, as CommonJS does.
    // A foreign VM realm makes strict object equality reject before the tested
    // lifecycle; that harness negative cannot establish a controller failure.
    vm.compileFunction(source, ['require', 'module', '__dirname', '__filename', 'process', 'Buffer'], { filename: file })(
        controlledRequire, owner, __dirname, file, process, Buffer);
    return { directory, output, run: () => owner.exports.run(options.host ? path.join(directory, 'host-output') : '/qualification-output/runtime-admission'),
        get attempts() { return attempts; }, get preparations() { return preparations; }, get scopes() { return scopes; }, get runtimeDirectory() { return runtimeDirectory; },
        rows() { return fs.readFileSync(path.join(output, 'runtime-admission.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)); } };
}

test('ev974-C26 runtime worker preserves complete recorded lifecycle for modeled string and object SDK results', async t => {
    for (const objectResponse of [false, true]) {
        const f = controllerFixture(t, { objectResponse }); await f.run();
        assert.equal(f.attempts, 1); assert.equal(f.preparations, 1);
        const rows = f.rows(); assert.equal(rows.filter(row => row.event === 'runtime-attempt-start').length, 1);
        assert.equal(rows.at(-1).event, 'runtime-control-pass'); assert.equal(rows.at(-1).qualificationCalls, 0);
        assert(!fs.existsSync(f.runtimeDirectory));
    }
});
test('ev974-C26 missing positive auth-file contrast refuses runtime control before modeled SDK preparation', async t => {
    const f = controllerFixture(t, { missingAuth: true }); await assert.rejects(f.run());
    assert.equal(f.attempts, 0); assert.equal(f.preparations, 0);
    assert(!f.rows().some(row => row.event === 'runtime-attempt-start'));
});
test('ev974-C26 pinned or missing-schema preparation refusal occurs before modeled execution with private runtime cleanup', async t => {
    for (const option of [{ pinFailure: true }, { noSchema: true }]) {
        const f = controllerFixture(t, option); await assert.rejects(f.run());
        assert.equal(f.attempts, 0); assert(!fs.existsSync(f.runtimeDirectory));
        assert.equal(f.rows().at(-1).event, 'runtime-attempt-finish'); assert.equal(f.rows().at(-1).status, 'failed');
    }
});
test('ev974-C26 unavailable modeled SDK and fabricated nonce retain distinct failed evidence without retry', async t => {
    for (const option of [{ modelFailure: true }, { guessedNonce: true }]) {
        const before = process.cwd(), f = controllerFixture(t, option); await assert.rejects(f.run());
        assert.equal(f.attempts, 1); assert.equal(process.cwd(), before);
        assert(!f.rows().some(row => row.event === 'runtime-control-pass'));
    }
});
test('ev974-C26 mutation of real Git metadata cannot become a successful modeled runtime control', async t => {
    const f = controllerFixture(t, { mutateGit: true }); await assert.rejects(f.run(), /complete runtime fixture/);
    assert.equal(f.attempts, 1); assert(!f.rows().some(row => row.event === 'runtime-control-pass'));
});
test('ev974-C26 outer runtime control requires completed stopped scope plus exactly one complete inner pass', async t => {
    const f = controllerFixture(t, { host: true }); await f.run(); assert.equal(f.scopes, 1);
    const rows = fs.readFileSync(path.join(f.directory, 'host-output/runtime-admission.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.at(-1).event, 'runtime-control-finish'); assert.equal(rows.at(-1).scientificCases, 0);
});
test('ev974-C26 outer runtime control refuses interrupted failed unconfirmed or malformed modeled evidence', async t => {
    for (const option of [{ terminal: { exitCode: 1 } }, { terminal: { exitCode: 0, interrupted: true } },
        { terminal: { exitCode: 0, interrupted: false, namespaceInitStopped: false } },
        { innerLedger: '{"event":"runtime-control-pass"}' }, { innerLedger: '{bad}\n' },
        { innerLedger: '{"event":"runtime-control-start"}\n' },
        { innerLedger: '{"event":"runtime-control-pass"}\n{"event":"runtime-control-pass"}\n' }]) {
        const f = controllerFixture(t, { host: true, ...option }); await assert.rejects(f.run()); assert.equal(f.scopes, 1);
    }
});
