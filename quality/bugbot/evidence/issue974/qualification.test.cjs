'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
require('./corpus-collector-components.cjs');
require('./corpus-worker-components.cjs');
require('./launcher-components.cjs');
require('./attempt-components.cjs');
require('./attempt-durability-components.cjs');
require('./component-evidence-integrity-components.cjs');
require('./implementation-components.cjs');
require('./full-review-fault-components.cjs');
require('./full-review-lifecycle-components.cjs');
require('./sdk-runtime-admission-components.cjs');
const root = path.resolve(__dirname, '../../../..');
const ev07 = path.join(__dirname, '../issue-950/ev07-shadow');
const sourceProof = require('../issue-950/execution-provenance.cjs');
const implementation = require('../issue-950/ev07-shadow/implementation.cjs');
const { selectedCorpus, requireCorpusSelection } = require('./corpus-selection.cjs');
const { createDurableRecorder, createRecordedCli, createRecordedVerifier, validateCompleteAttempts,
    validateCompleteReviewAttempts } = require('./attempt-ledger.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const plan = () => ({ ...clone(require('../issue-950/ev07-shadow/plan.json')), schemaVersion: 2,
    lifecycle: 'qualification-investigation-v1', corpus: {
        ...clone(require('../issue-950/ev07-shadow/plan.json').corpus), path: 'quality/bugbot/corpus.v2.json', version: 2,
        sha256: '001223aa255e5af7e10bddab2c8deacd7cacf0b5b3690a5a2034d241274cb9d6',
    }, runtime: { codex: 'codex-cli fixture', executableSha256: 'a'.repeat(64) } });

function temporary(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-control-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return directory;
}
function gitAt(directory) {
    return (...args) => execFileSync(sourceProof.trustedGitExecutable(),
        ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-C', directory, ...args], { encoding: 'utf8',
        env: { ...sourceProof.gitEnvironment(), GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
            GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } }).trim();
}
function commitPlan(file) {
    const git = gitAt(path.dirname(file)); git('init', '--quiet', '--template='); git('add', path.basename(file));
    const commit = git('commit-tree', git('write-tree'), '-m', 'Synthetic qualification admission control');
    git('update-ref', 'HEAD', commit);
    return { commit, path: path.basename(file), blob: git('rev-parse', commit + ':' + path.basename(file)), sha256: hash(fs.readFileSync(file)) };
}

function ledgerFixture(t, selected = plan()) {
    const directory = temporary(t), artifacts = path.join(directory, 'attempts'); fs.mkdirSync(artifacts);
    const file = path.join(directory, 'attempts.jsonl'), durable = createDurableRecorder(file), rows = [];
    const record = row => { durable(row); rows.push(row); };
    const c = new AbortController();
    const request = { configuration: selected.detector, capability: 'findings', prompt: 'ordinary delivered prompt',
        outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false }, signal: c.signal, timeoutMs: 20 };
    // Model-free semantic-port fixture. Real benchmark/capability code generates
    // follow-ups; no provider/model result is claimed by these controls.
    const factory = response => (observer, prepared) => ({ async execute(input) {
        const common = { provider: 'codex', capability: 'findings' };
        observer.observe({ ...common, state: 'started', phase: 'plan' });
        const schemaArtifactSha256 = hash(JSON.stringify(input.outputSchema));
        prepared({ flags: { model: selected.detector.model, modelProvider: selected.detector.modelProvider,
            reasoningEffort: selected.detector.effort, sandbox: 'read-only' },
        runtimeProof: { executableSha256: selected.runtime.executableSha256 }, runtimeContract: { version: selected.runtime.codex },
        workspaceMode: 'read-only', output: 'native-and-local-json-schema', qualificationInvestigation: true, schemaArtifactSha256 });
        observer.observe({ ...common, state: 'admitted', phase: 'preflight', workspaceMode: 'read-only',
            version: selected.runtime.codex, outputContract: 'native-and-local-json-schema', artifactHashes: [schemaArtifactSha256] });
        try {
            const value = await response(input);
            observer.observe({ ...common, state: 'completed', phase: 'run', outputBytes: Buffer.byteLength(value) });
            return value;
        } catch (error) {
            observer.observe({ ...common, state: 'failed', phase: 'run', failureCategory: error.category ?? 'process' }); throw error;
        }
    } });
    const make = (caseId, response = () => '{}') => createRecordedCli({ caseId, record, artifactDirectory: artifacts,
        createClient: factory(response) });
    return { directory, artifacts, file, rows, record, request, c, make, factory, selected };
}

test('ev974-C09 explicit v2 selection is coherent and retains all corpus identities and labels', () => {
    const p = plan(), actual = selectedCorpus(p, root), previous = JSON.parse(fs.readFileSync(path.join(root, 'quality/bugbot/corpus.v1.json')));
    assert.equal(actual.selection.version, 2); assert.equal(actual.file, path.join(root, p.corpus.path));
    assert.deepEqual(actual.inventory.cases.map(row => [row.id, row.expected]), previous.cases.map(row => [row.id, row.expected]));
    assert(implementation.selectedQualificationDrivers(p).includes('../../issue974/corpus-selection.cjs'));
    implementation.requireQualificationPolicy(p);
});

test('ev974-C10 omission retains v1/default and every frozen historical artifact byte', () => {
    const original = require('../issue-950/ev07-shadow/plan.json');
    assert.equal(selectedCorpus(original, root).selection.version, 1);
    assert.equal(requireCorpusSelection({ ...original, corpus: { ...original.corpus, path: 'quality/bugbot/corpus.v1.json', version: 1 } }).version, 1);
    assert.deepEqual(implementation.selectedQualificationDrivers(original), implementation.qualificationDrivers);
    for (const [file, digest] of Object.entries(require('../issue-985/historical-hashes.json').sha256)) {
        assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
    }
});

test('ev974-C11 rejects foreign path/hash/count/revision, altered identities and historical redirects before calls', t => {
    for (const delta of [{ path: '../corpus.v2.json' }, { sha256: 'f'.repeat(64) }, { cases: 173 }, { version: 1 },
        { outerAttemptsPerCase: 2 }, { concurrency: 0 }, { concurrency: 7 }]) {
        const p = plan(); Object.assign(p.corpus, delta); assert.throws(() => requireCorpusSelection(p));
    }
    const directory = temporary(t); fs.mkdirSync(path.join(directory, 'quality/bugbot'), { recursive: true });
    const bytes = fs.readFileSync(path.join(root, plan().corpus.path));
    const altered = JSON.parse(bytes); altered.cases[0].id = altered.cases[1].id;
    fs.writeFileSync(path.join(directory, plan().corpus.path), JSON.stringify(altered));
    assert.throws(() => selectedCorpus(plan(), directory), /bytes differ/u);
    for (const delta of [{ path: plan().corpus.path }, { version: 2 }]) {
        const p = clone(require('../issue-950/ev07-shadow/plan.json')); Object.assign(p.corpus, delta);
        assert.throws(() => requireCorpusSelection(p), /cannot redirect/u);
    }
});

test('ev974-C12 v2 cannot weaken gates, cohort, repetition, positives, latency or the exact Luna to Sol profile', () => {
    const mutations = [p => { p.repositoryCohort.repetitions = 2; }, p => { p.repositoryCohort.maximumAddedP95Ms = 90_001; },
        p => { p.repositoryCohort.requireAllExactPositiveControls = false; }, p => { p.repositoryCohort.order.reverse(); },
        p => { p.detector.model = 'other'; }, p => { p.verifier.model = 'gpt-6-sol'; }, p => { p.lifecycle = 'ordinary'; }];
    for (const field of ['baselineMinimumAlerts', 'baselineMinimumPremises', 'minimumStrictlyBetterRepetitions']) {
        mutations.push(p => { p.repositoryCohort[field] = 0; });
    }
    for (const field of Object.keys(plan().corpus.gates)) mutations.push(p => { p.corpus.gates[field] = field === 'maxBrier' ? 0.17 : 0; });
    for (const mutate of mutations) { const p = plan(); mutate(p); assert.throws(() => implementation.requireQualificationPolicy(p)); }
});

function publicBootstrapFixture(t, moduleFence = false, containment) {
    const directory = temporary(t), project = path.join(directory, 'project'); fs.mkdirSync(project);
    const prefix = 'quality/bugbot/evidence/issue-950/', git = gitAt(project);
    const write = (file, bytes) => { fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true }); fs.writeFileSync(path.join(project, file), bytes); };
    git('init', '--quiet', '--template=');
    write('.gitignore', 'node_modules/\n'); write('src/app.ts', 'export const answer = 42;\n');
    for (const file of ['package.json', 'tsconfig.json']) write(file, '{}\n');
    write('pnpm-lock.yaml', 'lockfileVersion: 9\n');
    write('node_modules/typescript/package.json', JSON.stringify({ name: 'typescript', version: 'fixture', main: 'index.js' }));
    write('node_modules/typescript/index.js', 'module.exports={};\n');
    const marker = path.join(directory, 'module-ran'), probe = path.join(directory, 'probe-ran');
    const p = plan();
    if (containment) p.containment = containmentProfile();
    const drivers = implementation.selectedQualificationDrivers(p);
    for (const file of drivers) write(path.posix.normalize(prefix + 'ev07-shadow/' + file), 'module.exports={};\n');
    for (const file of ['execution-provenance.cjs', 'qualification-bootstrap.cjs']) write(prefix + file, fs.readFileSync(path.join(__dirname, '../issue-950', file)));
    if (containment) for (const name of ['operation-containment.cjs', 'qualification-seccomp.cjs']) {
        write('quality/bugbot/evidence/issue974/' + name, fs.readFileSync(path.join(__dirname, name)));
    }
    write(prefix + 'ev07-shadow/corpus.cjs', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'entered');
        exports.run=()=>{require('node:child_process').execFileSync(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(probe)},'probe');`)}]);};\n`);
    if (moduleFence) {
        for (const file of ['corpus-selection.cjs', 'attempt-ledger.cjs']) {
            write('quality/bugbot/evidence/issue974/' + file, fs.readFileSync(path.join(__dirname, file)));
        }
        write(prefix + 'ev07-shadow/corpus.cjs', `exports.run=(output)=>{
            const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../../../../..');
            const admission=require('../execution-provenance.cjs');admission.requireBootstrapAdmission(root);
            admission.admitQualificationModules(root);
            ${moduleFence === 'unlisted' ? "require('../../issue974/unlisted.cjs');" : ''}
            const selection=require('../../issue974/corpus-selection.cjs').requireCorpusSelection(JSON.parse(fs.readFileSync(process.env.COPILOT_EV07_PLAN)));
            const record=require('../../issue974/attempt-ledger.cjs').createDurableRecorder(output);
            record({version:selection.version,modelCalls:0});};\n`);
        if (moduleFence === 'unlisted') write('quality/bugbot/evidence/issue974/unlisted.cjs',
            `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unlisted module executed');`);
    }
    git('add', '.'); const source = git('commit-tree', git('write-tree'), '-m', 'Trusted synthetic v2 source'); git('update-ref', 'HEAD', source);
    p.implementation = source; p.runtime = sourceProof.runtimeIdentity(project);
    if (containment) {
        p.hostRuntime = p.runtime;
        p.containment.supervisorSha256 = hash(fs.readFileSync(path.join(project, 'quality/bugbot/evidence/issue974/qualification-supervisor.cjs')));
        containment(p);
    }
    p.inspectedArtifacts = Object.fromEntries(drivers.map(file => [file, hash(fs.readFileSync(path.join(project, prefix, 'ev07-shadow', file)))]));
    const planPath = 'quality/bugbot/evidence/issue974/plan.json'; write(planPath, JSON.stringify(p)); git('add', planPath);
    const revision = git('commit-tree', git('write-tree'), '-p', source, '-m', 'Synthetic v2 preregistration'); git('update-ref', 'HEAD', revision);
    const bootstrap = path.join(directory, 'reviewed-bootstrap.cjs'), bootstrapBytes = fs.readFileSync(path.join(project, prefix, 'qualification-bootstrap.cjs'));
    fs.writeFileSync(bootstrap, bootstrapBytes);
    const launch = mode => spawnSync(process.execPath, [bootstrap, project, revision, planPath,
        hash(fs.readFileSync(path.join(project, planPath))), hash(bootstrapBytes), mode ?? 'corpus',
        ...(mode === 'normal-flow' ? ['lab', '1', path.join(directory, 'unused-output')] : [path.join(directory, 'unused-output')])],
    { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
    return { project, directory, marker, probe, bootstrap, prefix, launch, write };
}

test('ev974-C13 actual v2 public bootstrap rejects foreign source/runtime before modules and probes', t => {
    const f = publicBootstrapFixture(t), valid = f.launch(); assert.equal(valid.status, 0, valid.stderr);
    assert(fs.existsSync(f.marker) && fs.existsSync(f.probe)); fs.rmSync(f.marker); fs.rmSync(f.probe);
    const source = path.join(f.project, 'src/app.ts'), before = fs.readFileSync(source);
    fs.appendFileSync(source, 'foreign source');
    const foreign = f.launch(); assert.notEqual(foreign.status, 0); assert.match(foreign.stderr, /source or lockfile/u);
    fs.writeFileSync(source, before); f.write('node_modules/typescript/index.js', 'throw new Error("foreign dependency executed");');
    const runtime = f.launch(); assert.notEqual(runtime.status, 0); assert.match(runtime.stderr, /runtime differs/u);
    assert(!fs.existsSync(f.marker) && !fs.existsSync(f.probe));
});

function containmentProfile() {
    const bytes = 'a'.repeat(64);
    return { schemaVersion: 1, image: 'sha256:' + bytes, imageConfigSha256: bytes,
        hostNodeSha256: hash(fs.readFileSync(process.execPath)), socketPath: '/fixture/engine.sock', supervisorSha256: bytes,
        workerUid: process.getuid(), workerGid: process.getgid(),
        engine: { version: 'synthetic-engine', apiVersion: '1.54', os: 'linux', arch: 'arm64', kernelVersion: 'synthetic-kernel' } };
}

test('ev974-C26 actual public bootstrap refuses runtime plans as scientific entries before application imports', t => {
    const f = publicBootstrapFixture(t, false, p => {
        p.purpose = 'runtime-admission';
        p.runtimeAdmission = { schemaVersion: 1, fixtureSha256: require('./sdk-runtime-admission.cjs').fixtureSha256 };
    });
    for (const mode of ['corpus', 'full-review', 'full-review-runner', 'normal-flow']) {
        const result = f.launch(mode); assert.notEqual(result.status, 0);
        assert.match(result.stderr, /runtime admission cannot authorize measurement/);
        assert(!fs.existsSync(f.marker) && !fs.existsSync(f.probe));
    }
    const ordinary = publicBootstrapFixture(t, false, () => {}), result = ordinary.launch('runtime-admission');
    assert.notEqual(result.status, 0); assert.match(result.stderr, /runtime admission cannot authorize measurement/);
    assert(!fs.existsSync(ordinary.marker) && !fs.existsSync(ordinary.probe));
});

test('ev974-C26 immutable public bootstrap rejects closed profile and CLI byte mismatches before application imports/probes', t => {
    for (const mutate of [p => { p.containment.image = 'node:latest'; }, p => { p.containment.imageConfigSha256 = ''; },
        p => { p.containment.hostNodeSha256 = 'f'.repeat(64); }, p => { p.containment.supervisorSha256 = 'f'.repeat(64); },
        p => { p.containment.engine.kernelVersion = ''; }]) {
        const fixture = publicBootstrapFixture(t, false, mutate), run = fixture.launch();
        assert.notEqual(run.status, 0); assert(!fs.existsSync(fixture.marker) && !fs.existsSync(fixture.probe));
    }
    // Exercise the private core-only byte admission as a model-free component;
    // this VM export is never present in the actual public bootstrap.
    const vm = require('node:vm'), module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(ev07, '../qualification-bootstrap.cjs'), 'utf8')
        + '\nmodule.exports.testCliBytes=admitCliBytes;', { require, module, process, __filename: __filename });
    const directory = temporary(t), executable = path.join(directory, 'cli'), native = path.join(directory, 'native');
    fs.writeFileSync(executable, '#!/bin/sh\nexit 99\n', { mode: 0o700 }); fs.writeFileSync(native, 'native fixture');
    const runtime = { codex: 'fixture', executable, executableSha256: hash(fs.readFileSync(executable)),
        nativeExecutable: native, nativeExecutableSha256: hash(fs.readFileSync(native)), nodeSha256: hash(fs.readFileSync(process.execPath)) };
    module.exports.testCliBytes(runtime);
    for (const mutate of [r => { r.executableSha256 = 'f'.repeat(64); }, r => { r.nativeExecutableSha256 = 'f'.repeat(64); },
        r => { delete r.nativeExecutable; }, r => { r.nodeSha256 = 'f'.repeat(64); }]) {
        const altered = clone(runtime); mutate(altered); assert.throws(() => module.exports.testCliBytes(altered));
    }
});

test('ev974-C27 closed containment refuses ambient grants, mutable images, arbitrary mounts/flags and unsafe namespace configuration', async t => {
    await require('./engine-transport-components.cjs').exerciseEngineTransportFaults();
    const { requireProfile, fixedConfiguration, createOperationContainment, requireFixedMountConfiguration } = require('./operation-containment.cjs');
    const profile = containmentProfile(), directory = fs.realpathSync(temporary(t));
    const input = path.join(directory, 'input'), output = path.join(directory, 'output');
    fs.mkdirSync(input, { mode: 0o700 }); fs.mkdirSync(output, { mode: 0o700 });
    const identity = { ownerId: 'b'.repeat(64), operationId: 'control:C27', planSha256: 'c'.repeat(64),
        implementation: 'd'.repeat(40), imageSha256: profile.image.slice(7), purpose: 'native-control' };
    const config = fixedConfiguration(profile, identity, input, output, ['PATH=/usr/local/bin:/usr/bin:/bin']);
    assert.equal(config.HostConfig.Privileged, false); assert.equal(config.HostConfig.PidMode, '');
    assert.equal(config.HostConfig.Mounts.length, 2); assert.equal(config.Tty, false);
    assert.equal(config.OpenStdin, true); assert.equal(config.StdinOnce, true); assert.equal(config.HostConfig.AutoRemove, true);
    for (const delta of [{ image: 'node:latest' }, { flags: ['--privileged'] }, { hostPid: true }, { socketMount: '/var/run/docker.sock' },
        { mounts: ['/'] }, { environment: { QUALIFIED: 'true' } }, { workerUid: 0 }, { workerGid: 0 }]) {
        assert.throws(() => requireProfile({ ...profile, ...delta }));
    }
    for (const environment of [['GH_TOKEN=private-fixture'], ['NODE_OPTIONS=--require /foreign'], ['PATH=/a', 'PATH=/b'], {}]) {
        assert.throws(() => fixedConfiguration(profile, identity, input, output, environment));
    }
    // Retained actual Engine inspection: output ReadOnly=false is omitted,
    // while effective RW explicitly proves the two different access modes.
    const observed = JSON.parse(fs.readFileSync(path.join(__dirname, '../issue-974/controls/native-engine-mount-normalization.json')));
    const mounts = observed.configuredMounts, effective = observed.effectiveMounts, wanted = observed.requestedMounts;
    requireFixedMountConfiguration(mounts, effective, wanted);
    const explicitFalse = clone(mounts); explicitFalse[1].ReadOnly = false;
    requireFixedMountConfiguration(explicitFalse, [...effective].reverse(), wanted);
    for (const change of [rows => { delete rows[0].ReadOnly; }, rows => { rows[0].ReadOnly = false; },
        rows => { rows[1].ReadOnly = null; }, rows => { rows[1].ReadOnly = 'false'; },
        rows => { rows[0].Source = '/foreign'; }, rows => { rows[1].BindOptions.NonRecursive = false; },
        rows => { rows[0].unknown = true; }, rows => rows.push(rows[0]), rows => { rows[0] = null; },
        rows => { rows[0] = []; }]) {
        const altered = clone(mounts); change(altered);
        assert.throws(() => requireFixedMountConfiguration(altered, effective, wanted));
    }
    for (const change of [rows => { rows[0].RW = true; }, rows => { rows[1].RW = false; },
        rows => { rows[0].Source = '/foreign'; }, rows => { rows[0].Destination = '/foreign'; },
        rows => { rows[0].Destination = rows[1].Destination; }, rows => { rows[0].Mode = 'ro'; },
        rows => { rows[0].Propagation = 'rshared'; }, rows => { delete rows[0].RW; },
        rows => { rows[0].unknown = true; }, rows => rows.push(rows[0]), rows => { rows[0] = null; },
        rows => { rows[0] = []; }]) {
        const altered = clone(effective); change(altered);
        assert.throws(() => requireFixedMountConfiguration(mounts, altered, wanted));
    }
    assert.throws(() => requireFixedMountConfiguration({}, effective, wanted));
    assert.throws(() => requireFixedMountConfiguration(mounts, {}, wanted));
    for (const ambient of ['true', '1', JSON.stringify({ namespaceInitStopped: true })]) {
        const saved = process.env.COPILOT_QUALIFICATION_SCOPE;
        process.env.COPILOT_QUALIFICATION_SCOPE = ambient;
        try { await assert.rejects(createOperationContainment({ root, identity, inputDirectory: input, outputDirectory: output,
            record() { throw new Error('must not reach an Engine effect'); } }), /bootstrap/iu); }
        finally { if (saved === undefined) delete process.env.COPILOT_QUALIFICATION_SCOPE; else process.env.COPILOT_QUALIFICATION_SCOPE = saved; }
    }
    // Actual Git transport, not an Engine/model fixture: the image has X and
    // must be able to fetch the reviewed later Y by its exact SHA from a delta.
    const source = path.join(directory, 'bundle-source'), target = path.join(directory, 'bundle-target');
    fs.mkdirSync(source); fs.mkdirSync(target);
    const git = gitAt(source), received = gitAt(target);
    git('init', '--quiet', '--template='); fs.writeFileSync(path.join(source, 'sdk.txt'), 'fixed SDK input\n'); git('add', '.');
    const x = git('commit-tree', git('write-tree'), '-m', 'Model-free implementation X'); git('update-ref', 'HEAD', x);
    const baseline = path.join(input, 'implementation.bundle'); git('bundle', 'create', baseline, 'HEAD');
    received('init', '--quiet', '--template='); received('fetch', '--quiet', '--no-tags', '--no-write-fetch-head', baseline, x);
    fs.writeFileSync(path.join(source, 'plan.json'), '{"modelCalls":0}\n'); git('add', 'plan.json');
    const y = git('commit-tree', git('write-tree'), '-p', x, '-m', 'Model-free later plan Y'); git('update-ref', 'HEAD', y);
    assert.throws(() => received('cat-file', '-e', y));
    const bundle = path.join(input, 'plan.bundle');
    assert.equal(sourceProof.materializePlanBundle(source, x, y, bundle), hash(fs.readFileSync(bundle)));
    assert.equal(git('bundle', 'list-heads', bundle), y + ' HEAD');
    received('fetch', '--quiet', '--no-tags', '--no-write-fetch-head', bundle, y);
    assert.equal(received('show', y + ':plan.json'), '{"modelCalls":0}');
    const rejected = path.join(input, 'must-not-create.bundle');
    assert.throws(() => sourceProof.materializePlanBundle(source, x, 'f'.repeat(40), rejected), /HEAD changed/u);
    assert(!fs.existsSync(rejected));
    assert.throws(() => sourceProof.materializePlanBundle(source, x, y, bundle), /already exists/u);
});

test('ev974-C28 private live capability binds only the exact immutable plan/signal/owner/operation', async () => {
    require('../issue-950/ev07-shadow/load.cjs');
    const scope = require(path.join(root, 'src/infrastructure/agents/qualification_operation_scope'));
    const identity = { ownerId: 'a'.repeat(64), operationId: 'control:C28', planSha256: 'b'.repeat(64),
        implementation: 'c'.repeat(40), imageSha256: 'd'.repeat(64), purpose: 'native-control' };
    const c = new AbortController(), scopeId = 'e'.repeat(64), plan = Object.freeze({});
    let confirm, stopped = false;
    const ended = new Promise(resolve => { confirm = resolve; });
    const port = { identity, scopeId, signal: c.signal, stopped: ended,
        requestStop() { stopped = true; confirm({ identity, scopeId, namespaceInitStopped: true }); } };
    assert.throws(() => scope.requireQualificationOperationScope(c.signal));
    await scope.withQualificationOperationScope(port, async () => {
        scope.bindQualificationOperationPlan(plan, c.signal);
        assert.equal(scope.hasQualificationOperationPlan(plan, c.signal), true);
        assert.equal(scope.hasQualificationOperationPlan({ ...plan }, c.signal), false);
        assert.equal(scope.hasQualificationOperationPlan(plan, new AbortController().signal), false);
        assert.throws(() => scope.bindQualificationOperationPlan(plan, c.signal));
        assert.throws(() => scope.qualificationOperationTermination(new AbortController().signal));
        assert(Object.isFrozen(plan));
    });
    assert.equal(stopped, true); assert.equal(scope.hasQualificationOperationPlan(plan, c.signal), false);
    const policy = require(path.join(root, 'src/application/policies/qualification_operation_scope_policy'));
    for (const delta of [{ ownerId: 'f'.repeat(64) }, { operationId: 'foreign' }, { planSha256: 'f'.repeat(64) }]) {
        assert.throws(() => policy.requireQualificationOperationStopped(identity, scopeId,
            { identity: { ...identity, ...delta }, scopeId, namespaceInitStopped: true }));
    }
    const supervisor = require('./supervisor-components.cjs').runSupervisorComponents();
    assert.equal(supervisor.cases, 49); assert.equal(supervisor.failed, 0);
});

test('ev974-C29 durable planned174/42 inventories reject orphan, missing and incomplete owned-scope prefixes', () => {
    require('../issue-950/ev07-shadow/load.cjs');
    const { requireCompleteQualificationOperations } = require(path.join(root, 'src/application/policies/qualification_operation_scope_policy'));
    const selected = plan(), tuple = { planSha256: 'a'.repeat(64), implementation: 'b'.repeat(40), imageSha256: 'c'.repeat(64) };
    const inventory = selectedCorpus(selected, root).inventory.cases.map(row => ({ operationId: 'corpus:' + row.id, purpose: 'corpus-case' }));
    const paired = Array.from({ length: 3 }, (_, index) => selected.repositoryCohort.order.map(id =>
        ({ operationId: 'review:' + id + ':r' + (index + 1), purpose: 'paired-review' }))).flat();
    for (const slots of [inventory, paired]) {
        const rows = slots.flatMap((slot, index) => {
            const identity = { ...tuple, ...slot, ownerId: (index + 1).toString(16).padStart(64, '0') };
            const scopeId = (index + 1000).toString(16).padStart(64, '0');
            return [{ event: 'start', identity, scopeId }, { event: 'stopped', identity, scopeId, outcome: 'completed', namespaceInitStopped: true }];
        });
        requireCompleteQualificationOperations(slots, rows, tuple);
        for (const mutate of [r => r.pop(), r => r.shift(), r => r.push(r[0]),
            r => { r[1].namespaceInitStopped = false; }, r => { r[1].outcome = 'interrupted'; },
            r => { r[1].identity.operationId = 'orphan'; }]) {
            const incomplete = clone(rows); mutate(incomplete); assert.throws(() => requireCompleteQualificationOperations(slots, incomplete, tuple));
        }
    }
    assert.equal(inventory.length, 174); assert.equal(paired.length, 42);
});

test('ev974-C31 collector failure aborts every owned sibling and waits for stopped scopes before returning failure', async t => {
    const vm = require('node:vm'), directory = temporary(t), selected = plan(); selected.containment = containmentProfile();
    const source = fs.readFileSync(path.join(ev07, 'full-review.cjs'), 'utf8'), module = { exports: {} };
    const pendingStops = []; let started = 0, aborts = 0, returned = false;
    const fakeContainment = { async runContainedOperation(request) {
        fs.mkdirSync(request.outputDirectory, { mode: 0o700 }); started++;
        if (started === 1) {
            await request.record({ event: 'scope-stopped', namespaceInitStopped: true });
            // A real copy error after stop, rather than a fake child exit.
            fs.mkdirSync(path.join(request.outputDirectory, 'review.jsonl'));
            return { exitCode: 0, interrupted: false, namespaceInitStopped: true };
        }
        return new Promise(resolve => {
            request.signal.addEventListener('abort', () => { aborts++; }, { once: true });
            pendingStops.push(async () => {
                await request.record({ event: 'scope-stopped', namespaceInitStopped: true });
                resolve({ exitCode: 143, interrupted: true, namespaceInitStopped: true });
            });
        });
    } };
    const controlledRequire = name => {
        if (name === '../execution-provenance.cjs') return { requireBootstrapAdmission() {}, spawnQualificationDriver() { throw new Error('group/child fallback forbidden'); } };
        if (name === './launch-full-review.cjs') return { requirePassingCorpus: campaign => campaign };
        if (name === './implementation.cjs') return { qualificationProvenance: () => ({ implementation: selected.implementation }), selectedPlanProvenance: () => ({ sha256: 'a'.repeat(64) }) };
        if (name === './configuration.cjs') return selected;
        if (name === '../../issue974/attempt-ledger.cjs') return require('./attempt-ledger.cjs');
        if (name === '../../issue974/operation-containment.cjs') return fakeContainment;
        return require(name);
    };
    vm.runInNewContext(source, { require: controlledRequire, module, __dirname: ev07, process, AbortController });
    const running = module.exports.run(directory).then(code => { returned = true; return code; });
    await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
    assert.equal(started, 3); assert.equal(aborts, 2); assert.equal(returned, false);
    for (const stop of pendingStops) await stop();
    assert.equal(await running, 1); assert.equal(started, 3);
    const ledger = fs.readFileSync(path.join(directory, 'full-review/slots.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(ledger.filter(row => row.event === 'slot-planned').length, 42);
    assert.equal(ledger.filter(row => row.event === 'not-started').length, 39);
    assert.equal(ledger.filter(row => row.event === 'collector-failure').length, 1);
    assert.equal(ledger.at(-1).failed, true);
});

test('ev974-C14 actual v2 bootstrap rejects changed drivers/bootstrap and unsupported admission endpoints', t => {
    const f = publicBootstrapFixture(t), file = path.join(f.project, f.prefix, '../issue974/attempt-ledger.cjs');
    const before = fs.readFileSync(file); fs.appendFileSync(file, 'foreign bytes');
    const driver = f.launch(); assert.notEqual(driver.status, 0); assert.match(driver.stderr, /working driver differs/u);
    fs.writeFileSync(file, before);
    const alternative = f.launch('worker'); assert.notEqual(alternative.status, 0); assert.match(alternative.stderr, /unsupported qualification entrypoint/u);
    const normal = f.launch('normal-flow'); assert.notEqual(normal.status, 0); assert.match(normal.stderr, /no normal-flow admission route/u);
    fs.appendFileSync(f.bootstrap, '\n');
    const bootstrap = f.launch(); assert.notEqual(bootstrap.status, 0); assert.match(bootstrap.stderr, /reviewed bootstrap differs/u);
    assert(!fs.existsSync(f.marker) && !fs.existsSync(f.probe));
});

test('ev974-C15 ordinary benchmark generates distinct literal follow-up attempts with durable delivered bytes', async t => {
    require('../issue-950/ev07-shadow/load.cjs');
    const { runBugbotBenchmarkAgent } = require(path.join(root, 'src/tooling/bugbot_benchmark_runner'));
    const { createFindingsQueryPort } = require(path.join(root, 'src/infrastructure/composition/agent_capability_composition_root'));
    const f = ledgerFixture(t), candidate = { id: 'counter', title: 'Contradiction', description: 'Independent source proof.',
        file: 'fixture.py', line: 3, endLine: null, severity: 'low', confidence: 1, category: 'correctness',
        suggestion: null, symbol: null, suggestedCode: null, codeSnippet: 'assert rows[2]["ci"] == 0', evidence: 'Concrete source.' };
    const cli = f.make('literal', input => JSON.stringify(input.outputSchema.properties.verification_id
        ? { outputLocale: 'en-US', verification_id: input.outputSchema.properties.verification_id.enum[0], findings: [], rejected_ids: ['counter'] }
        : { outputLocale: 'en-US', findings: [candidate], resolved_findings: [] }));
    const agent = createFindingsQueryPort({ cli });
    const result = await runBugbotBenchmarkAgent({ schemaVersion: 1, cases: [{ id: 'literal', file: 'fixture.py', language: 'python',
        startLine: 1, description: 'Changed assertion.', diff: ' source = """a\n b"""\n+assert rows[2]["ci"] == 0', expected: [] }] },
    { query: input => agent.query({ ...input, signal: f.c.signal }) }, f.selected.detector);
    assert.deepEqual(result.predictions.literal, []); assert.equal(cli.attemptIds.length, 2);
    assert.equal(validateCompleteAttempts(f.rows, [{ id: 'literal', attemptIds: cli.attemptIds }], f.selected, f.artifacts).calls, 2);
    const starts = f.rows.filter(row => row.event === 'attempt-start'); assert.notEqual(starts[0].promptSha256, starts[1].promptSha256);
    assert.notEqual(starts[0].schemaSha256, starts[1].schemaSha256);
});

test('ev974-C16 failed ordinary preparation is retained without a spawned session or reported identity', async t => {
    require('../issue-950/ev07-shadow/load.cjs');
    const { AgentCliClient } = require(path.join(root, 'src/data/repository/agent_cli_client'));
    const f = ledgerFixture(t), failure = new Error('private preparation error, never public');
    const cli = createRecordedCli({ caseId: 'preflight', record: f.record, artifactDirectory: f.artifacts,
        createClient: observer => new AgentCliClient({ prepare() { throw failure; } }, observer) });
    await assert.rejects(cli.execute(f.request), error => error === failure);
    assert.deepEqual(f.rows.filter(row => row.event === 'attempt-observation').map(row => row.fact.state), ['started', 'failed']);
    assert.equal(f.rows.filter(row => row.event === 'attempt-prepared').length, 0);
    assert.equal(f.rows.at(-1).status, 'failed'); assert.deepEqual(f.rows.at(-1).providerReported, { model: null, usage: null });
    assert(!fs.readFileSync(f.file, 'utf8').includes(failure.message));
});

test('ev974-C17 provider and follow-up failures remain terminal with no unregistered retry', async t => {
    const f = ledgerFixture(t); let calls = 0;
    const cli = f.make('failure', () => { calls++; const error = new Error('private provider stderr'); error.category = 'process'; throw error; });
    await assert.rejects(cli.execute(f.request)); assert.equal(calls, 1);
    assert.equal(f.rows.at(-1).status, 'failed'); assert.equal(cli.attemptIds.length, 1);
    assert.throws(() => validateCompleteAttempts(f.rows, [{ id: 'failure', attemptIds: cli.attemptIds }], f.selected, f.artifacts));
    assert(!fs.readFileSync(f.file, 'utf8').includes('private provider stderr'));
});

test('ev974-C18 interruption keeps the durable start, interrupted call and all unstarted outer slots', async t => {
    const f = ledgerFixture(t);
    for (let index = 0; index < 174; index++) f.record({ event: 'case-slot', index, id: 'slot-' + index, status: 'not-started' });
    const cli = f.make('slot-0', () => new Promise((resolve, reject) => {
        f.c.signal.addEventListener('abort', () => { const error = new Error('canceled'); error.category = 'cancelled'; reject(error); }, { once: true });
    }));
    const pending = cli.execute(f.request);
    assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8').trim().split('\n').at(-4)).event, 'attempt-start');
    f.c.abort(); await assert.rejects(pending);
    assert.equal(f.rows.at(-1).status, 'interrupted'); assert.equal(f.rows.filter(row => row.event === 'case-slot').length, 174);
    assert.throws(() => validateCompleteAttempts(f.rows, [{ id: 'slot-0', attemptIds: cli.attemptIds }], f.selected, f.artifacts));
});

test('ev974-C19 unknown or high usage is telemetry and configured flags never become a reported identity', async t => {
    const f = ledgerFixture(t), cli = f.make('telemetry'); await cli.execute(f.request);
    const outer = [{ id: 'telemetry', attemptIds: cli.attemptIds }];
    for (const usage of [null, { totalTokens: 1e12 }, { totalTokens: 0 }]) {
        const rows = clone(f.rows); for (const row of rows.filter(row => row.providerReported)) row.providerReported.usage = usage;
        assert.equal(validateCompleteAttempts(rows, outer, f.selected, f.artifacts).complete, true);
        assert(rows.filter(row => row.providerReported).every(row => row.providerReported.model === null));
    }
});

test('ev974-C20 ordinary v2 prompt generation excludes expected oracles and binds actual delivered prompt/schema bytes', async t => {
    require('../issue-950/ev07-shadow/load.cjs');
    const { buildBugbotBenchmarkPrompt } = require(path.join(root, 'src/tooling/bugbot_benchmark_runner'));
    const f = ledgerFixture(t), selected = selectedCorpus(plan(), root).inventory.cases[0];
    const prompt = buildBugbotBenchmarkPrompt({ ...selected, expected: [{ title: 'PRIVATE_ORACLE_974', suggestion: 'PRIVATE_REPAIR_974' }] });
    assert(!prompt.includes('PRIVATE_ORACLE_974') && !prompt.includes('PRIVATE_REPAIR_974'));
    const cli = f.make('prompt'); await cli.execute({ ...f.request, prompt });
    const start = f.rows.find(row => row.event === 'attempt-start');
    const delivered = JSON.parse(fs.readFileSync(path.join(f.artifacts, start.requestFile)));
    assert.equal(delivered.prompt, prompt); assert.equal(start.promptSha256, hash(prompt));
    assert.equal(start.schemaSha256, hash(JSON.stringify(delivered.outputSchema)));
});

// These controls deliberately inspect committed source, just like the retained
// original dispatch controls. Run the complete suite after the source commit.
function passingCorpus(t) {
    require('../issue-950/ev07-shadow/load.cjs');
    const { evaluateBugbotBenchmark } = require(path.join(root, 'src/tooling/bugbot_benchmark'));
    const selected = plan(); selected.implementation = gitAt(root)('rev-parse', 'HEAD');
    selected.runtime = { ...sourceProof.runtimeIdentity(root), codex: 'codex-cli fixture', executableSha256: 'a'.repeat(64) };
    selected.inspectedArtifacts = Object.fromEntries(implementation.selectedQualificationDrivers(selected).map(file => [file, hash(fs.readFileSync(path.join(ev07, file)))]));
    const f = ledgerFixture(t, selected), corpus = selectedCorpus(selected, root).inventory;
    const planFile = path.join(f.directory, 'plan.json'); fs.writeFileSync(planFile, JSON.stringify(selected)); const preregistration = commitPlan(planFile);
    const provenance = { ...sourceProof.attestSource(root, selected.implementation), drivers: selected.inspectedArtifacts,
        runtime: sourceProof.runtimeIdentity(root) };
    const rows = f.rows;
    rows.push({ event: 'start', cli: selected.runtime.codex, configuration: selected.detector, plan: preregistration.sha256,
        preregistration, provenance, runner: selected.inspectedArtifacts['corpus.cjs'], implementation: selected.implementation,
        corpus: selected.corpus.sha256, gitHubMutationPorts: 0 },
    ...corpus.cases.map((item, index) => ({ event: 'case-slot', index, id: item.id, status: 'not-started' })));
    const predictions = { schemaVersion: 1, predictions: Object.fromEntries(corpus.cases.map(item => [item.id,
        item.expected.map(finding => ({ ...finding, confidence: 1 }))])) };
    // Explicitly synthetic gold predictions exercise admission only; these are
    // never submitted as measured corpus or profile qualification evidence.
    return { ...f, corpus, rows, predictions, selected, planFile, evaluateBugbotBenchmark };
}
async function completeSyntheticCorpus(f) {
    for (const [index, item] of f.corpus.cases.entries()) {
        const cli = f.make(item.id); const before = f.rows.length; await cli.execute(f.request);
        // f.rows includes the start/slots prepared above; make() appends the
        // concrete model-free attempt chains and retained private artifacts.
        const flags = { model: f.selected.detector.model, modelProvider: f.selected.detector.modelProvider,
            reasoningEffort: f.selected.detector.effort, sandbox: 'read-only' };
        assert(f.rows.length > before);
        f.rows.push({ event: 'case', index, id: item.id, status: 'completed', predictions: f.predictions.predictions[item.id],
            attemptIds: cli.attemptIds, calls: [flags], runtimeProofs: [{ executableSha256: f.selected.runtime.executableSha256 }] });
    }
    const score = { complete: true, completed: 174, passed: true, attemptsComplete: true, githubWriteAttempts: 0,
        workspaceUnchanged: true, score: f.evaluateBugbotBenchmark(f.corpus, f.predictions) };
    f.rows.push({ event: 'finish', complete: true, passed: true, githubWriteAttempts: 0, workspaceUnchanged: true });
    const destination = path.join(f.directory, 'corpus-v3'); fs.mkdirSync(destination);
    fs.renameSync(f.artifacts, path.join(destination, 'attempts'));
    fs.writeFileSync(path.join(destination, 'corpus-score.json'), JSON.stringify(score));
    fs.writeFileSync(path.join(destination, 'predictions.json'), JSON.stringify(f.predictions));
    fs.writeFileSync(path.join(destination, 'corpus.jsonl'), f.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    const launch = () => spawnSync(process.execPath, ['-e', 'require(process.argv[1]).launchFullReview(process.argv[2],()=>process.stdout.write("admitted"))',
        path.join(ev07, 'launch-full-review.cjs'), f.directory], { encoding: 'utf8', env: { ...process.env, COPILOT_EV07_PLAN: f.planFile } });
    return { score, launch, destination };
}

test('ev974-C21 failed and incomplete v2 corpus launch zero full-review children and retain the first failure', t => {
    const directory = temporary(t), corpus = path.join(directory, 'corpus-v3'); fs.mkdirSync(corpus);
    for (const state of [{ complete: false, passed: false }, { complete: true, passed: false }]) {
        fs.writeFileSync(path.join(corpus, 'corpus-score.json'), JSON.stringify({ ...state, firstFailure: 'case-0/preflight', completed: 173 }));
        let calls = 0;
        assert.throws(() => require('../issue-950/ev07-shadow/launch-full-review.cjs').launchFullReview(directory, () => { calls++; }));
        assert.equal(calls, 0); assert.equal(JSON.parse(fs.readFileSync(path.join(corpus, 'corpus-score.json'))).firstFailure, 'case-0/preflight');
    }
});

test('ev974-C22 passing-looking foreign tuple cannot admit the fixed42 phase', async t => {
    const f = passingCorpus(t), prepared = await completeSyntheticCorpus(f);
    for (const mutate of [rows => { rows[0].implementation = 'f'.repeat(40); },
        rows => { rows[0].provenance.runtime.node = 'foreign'; },
        rows => { rows[0].provenance.drivers['review.cjs'] = 'f'.repeat(64); },
        rows => { rows[0].configuration.model = 'foreign'; }, rows => { rows[0].corpus = 'f'.repeat(64); }]) {
        const rows = clone(f.rows); mutate(rows);
        fs.writeFileSync(path.join(prepared.destination, 'corpus.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
        const result = prepared.launch(); assert.notEqual(result.status, 0); assert.match(result.stderr, /provenance/u); assert.equal(result.stdout, '');
    }
});

test('ev974-C23 missing duplicate or unterminated attempts cannot admit completed-looking case IDs', async t => {
    const f = ledgerFixture(t), cli = f.make('complete'); await cli.execute(f.request);
    const outer = [{ id: 'complete', attemptIds: cli.attemptIds }];
    const start = f.rows.find(row => row.event === 'attempt-start');
    for (const rows of [f.rows.filter(row => row.event !== 'attempt-start'), [...f.rows, start], f.rows.filter(row => row.event !== 'attempt-finish'),
        [...f.rows, { event: 'attempt-observation', attemptId: 'orphan', fact: {} }]]) {
        assert.throws(() => validateCompleteAttempts(rows, outer, f.selected, f.artifacts));
    }
    const finish = f.rows.at(-1); fs.appendFileSync(path.join(f.artifacts, finish.responseFile), 'changed');
    assert.throws(() => validateCompleteAttempts(f.rows, outer, f.selected, f.artifacts), /artifact changed/u);
});

test('ev974-C24 complete authenticated synthetic v2 evidence is rescored and admits only the unchanged fixed42 protocol', async t => {
    const f = passingCorpus(t), prepared = await completeSyntheticCorpus(f);
    assert.deepEqual(prepared.score.score.violations, []);
    const result = prepared.launch(); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, 'admitted');
    assert.equal(f.selected.repositoryCohort.order.length * f.selected.repositoryCohort.repetitions, 42);
    const score = JSON.parse(fs.readFileSync(path.join(prepared.destination, 'corpus-score.json'))); score.score.metrics.precision = 0;
    fs.writeFileSync(path.join(prepared.destination, 'corpus-score.json'), JSON.stringify(score));
    assert.notEqual(prepared.launch().status, 0, 'a passing summary cannot bypass independent rescoring');
    assert(!fs.existsSync(path.join(f.directory, 'full-review')), 'control must not execute real full reviews');
});

test('ev974-C25 authenticated v2 public bootstrap admits its exact helper modules after the loader fence, rejecting unlisted and shadow modules', t => {
    const valid = publicBootstrapFixture(t, true), result = valid.launch();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(valid.directory, 'unused-output'))), { version: 2, modelCalls: 0 });
    assert(!fs.existsSync(valid.probe), 'module admission control must not probe a provider');
    const foreign = publicBootstrapFixture(t, 'unlisted'), rejected = foreign.launch();
    assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /outside the admitted qualification closure/u);
    assert(!fs.existsSync(foreign.marker), 'unregistered module must not execute');
    const shadow = publicBootstrapFixture(t, true);
    shadow.write('quality/bugbot/evidence/issue974/node_modules/typescript/index.js',
        `require('node:fs').writeFileSync(${JSON.stringify(shadow.marker)},'shadow module executed');`);
    const blocked = shadow.launch(); assert.notEqual(blocked.status, 0); assert.match(blocked.stderr, /dependency shadow/u);
    assert(!fs.existsSync(shadow.marker) && !fs.existsSync(shadow.probe));
});

test('ev974-C30 fixed174/fixed42 retain actual verifier follow-ups and zero candidates start zero verifiers', async t => {
    const selected = plan(), f = ledgerFixture(t, selected), caseId = 'U1:r1';
    const detector = f.make(caseId); await detector.execute(f.request);
    const verifierDirectory = path.join(f.directory, 'verifiers'); fs.mkdirSync(verifierDirectory);
    const flags = { model: selected.verifier.model, modelProvider: selected.verifier.modelProvider,
        reasoningEffort: selected.verifier.effort, sandbox: 'read-only' };
    const turns = []; let called = 0;
    const transport = createRecordedVerifier({ caseId, record: f.record, artifactDirectory: verifierDirectory,
        admitRuntime: () => ({ executableSha256: selected.runtime.executableSha256 }),
        async transport(request) {
            // This is a model-free semantic transport fixture, not a provider
            // result or a native SDK acceptance observation.
            assert.equal(f.rows.at(-1).event, 'verifier-attempt-start');
            assert(fs.existsSync(path.join(verifierDirectory, f.rows.at(-1).requestFile)));
            request.onRuntimeAdmission({ executable: '/fixture', prefixArgs: [] }); request.onInvocation(flags);
            const fact = { failure: called++ === 0 ? 'provider-context-window' : null,
                resolvedModel: selected.verifier.model, invocation: flags,
                promptSha256: hash(request.prompt), schemaSha256: hash(JSON.stringify(request.schema)),
                ...(called === 2 && { usage: { totalTokens: 1e12 } }) };
            turns.push(fact);
            return { response: { action: 'fixture' }, fact };
        } });
    const request = { candidateId: 'actual-candidate', configuration: selected.verifier, prompt: 'delivered first turn',
        schema: { type: 'object' }, signal: f.c.signal };
    await transport(request); await transport({ ...request, prompt: 'actual application follow-up' });
    const result = { event: 'result', success: true, checkoutUnchanged: true,
        payload: { dryRun: true, findings: [], bugbotShadowVerification: {
            publicationSimulation: { status: 'complete', individual: {}, overflow: 0 },
            candidates: [{ id: request.candidateId, status: 'technical-failure',
                investigation: { turns: turns.map(({ failure, reportedModel, usage }) => ({ failure, reportedModel, usage })) } }] } } };
    const records = [...f.rows, result];
    const validate = (rows = records) => validateCompleteReviewAttempts({ records: rows, caseId, selected,
        detectorDirectory: f.artifacts, verifierDirectory });
    assert.deepEqual(validate(), { complete: true, detectorCalls: 1, verifierCalls: 2, candidates: 1 });
    assert.equal(called, 2); assert(f.rows.filter(row => row.providerReported).every(row => row.providerReported.model === null));
    for (const mutate of [rows => rows.pop(), rows => rows.splice(rows.findIndex(row => row.event === 'verifier-attempt-finish'), 1),
        rows => rows.push({ event: 'verifier-attempt-finish', attemptId: 'orphan' }),
        rows => { rows.find(row => row.event === 'verifier-attempt-prepared').runtimeProof.executableSha256 = 'f'.repeat(64); },
        rows => { rows.find(row => row.event === 'verifier-attempt-invocation').flags.model = 'foreign'; },
        rows => { rows.at(-1).payload.bugbotShadowVerification.candidates[0].investigation.turns.pop(); }]) {
        const rows = clone(records); mutate(rows); assert.throws(() => validate(rows));
    }
    const zero = clone(result); zero.payload.bugbotShadowVerification.candidates = [];
    const noVerifierCalls = [...f.rows.filter(row => !/^verifier-attempt-/u.test(row.event)), zero];
    assert.equal(validate(noVerifierCalls).verifierCalls, 0); assert.equal(called, 2);
    assert.throws(() => validate([...f.rows, zero]), /without an actual candidate/u);
    for (const mutate of [p => { p.corpus.cases--; }, p => { p.corpus.outerAttemptsPerCase++; },
        p => { p.repositoryCohort.repetitions--; }, p => { p.repositoryCohort.order.pop(); }]) {
        const p = plan(); mutate(p); assert.throws(() => implementation.requireQualificationPolicy(p));
    }
    // A real collector failure keeps the durable attempted prefix; it cannot
    // be replaced by a later completed-looking response.
    const negative = ledgerFixture(t), failedDirectory = path.join(negative.directory, 'verifier'); fs.mkdirSync(failedDirectory);
    const failed = createRecordedVerifier({ caseId, record: negative.record, artifactDirectory: failedDirectory,
        admitRuntime() { throw new Error('frozen physical bytes differ'); },
        async transport(input) { input.onRuntimeAdmission({}); throw new Error('must not reach a provider'); } });
    await assert.rejects(failed(request), /physical bytes/u);
    assert.deepEqual(negative.rows.map(row => row.event), ['verifier-attempt-start', 'verifier-attempt-finish']);
    assert.equal(negative.rows.at(-1).status, 'failed');

    // Exercise the real Python scorer with explicitly synthetic namespace
    // evidence. Only one slot is complete, so this can never qualify fixed42.
    const bytes = 'a'.repeat(64), scopeId = 'e'.repeat(64);
    selected.containment = { schemaVersion: 1, image: 'sha256:' + bytes };
    selected.hostRuntime = { nodeSha256: bytes, gitSha256: bytes, typescriptSha256: bytes, dependencyTreeSha256: bytes,
        dependencyEntries: 1, os: 'darwin', arch: 'arm64', kernel: 'synthetic-host-kernel', node: 'synthetic-node',
        gitExecutable: '/synthetic-host/git', git: 'synthetic-git', typescript: 'synthetic-typescript' };
    Object.assign(selected.runtime, selected.hostRuntime, { os: 'linux', kernel: 'synthetic-worker-kernel', gitExecutable: '/usr/bin/git' });
    selected.inspectedArtifacts = Object.fromEntries(implementation.selectedQualificationDrivers(selected).map(file => [file, bytes]));
    const planFile = path.join(f.directory, 'plan.json'); fs.writeFileSync(planFile, JSON.stringify(selected));
    const preregistration = commitPlan(planFile);
    const host = { implementation: selected.implementation, drivers: selected.inspectedArtifacts,
        runtime: selected.hostRuntime, containment: selected.containment, workerRuntime: selected.runtime, executionContext: 'host',
        tree: 'b'.repeat(40), sourceSha256: bytes, dependencyLockSha256: bytes, compilerConfigurationSha256: bytes,
        bootstrap: { bootstrapSha256: selected.inspectedArtifacts['../qualification-bootstrap.cjs'],
            planCommit: preregistration.commit, planPath: preregistration.path, planSha256: preregistration.sha256 } };
    const subject = JSON.parse(fs.readFileSync(path.join(ev07, '../v4/manifest.json'))).subjects.find(row => row.id === 'U1');
    const start = { event: 'start', implementation: selected.implementation, plan: preregistration.sha256, preregistration };
    const first = { ...start, subject, repetition: 1, provenance: { ...host, executionContext: 'worker',
        runtime: Object.fromEntries(Object.keys(host.runtime).map(key => [key, selected.runtime[key]])) } };
    const reviewFile = path.join(f.directory, 'U1-1.jsonl');
    const scoredResult = clone(result); scoredResult.payload.bugbotShadowVerification.publicationSimulation.status = 'incomplete';
    fs.writeFileSync(reviewFile, [first, ...f.rows, scoredResult].map(row => JSON.stringify(row)).join('\n') + '\n');
    fs.cpSync(f.artifacts, reviewFile + '.attempts', { recursive: true });
    fs.cpSync(verifierDirectory, reviewFile + '.verifier-attempts', { recursive: true });
    const identity = { ownerId: 'b'.repeat(64), operationId: 'review:U1:r1', planSha256: preregistration.sha256,
        implementation: selected.implementation, imageSha256: bytes, purpose: 'paired-review' };
    const scope = ['scope-create-start', 'scope-created', 'operation-start', 'scope-start', 'scope-stopped',
        'operation-stopped', 'scope-remove-start', 'scope-removed'].map(event => ({ event, identity,
        ...(event !== 'scope-create-start' && { scopeId }),
        ...(['scope-stopped', 'operation-stopped'].includes(event) && { namespaceInitStopped: true }),
        ...(event === 'operation-stopped' && { exitCode: 0, interrupted: false }) }));
    const planned = Array.from({ length: 3 }, (_, index) => selected.repositoryCohort.order.map(id =>
        ({ event: 'slot-planned', id, repetition: index + 1, status: 'not-started' }))).flat();
    const saveScope = rows => {
        fs.writeFileSync(reviewFile + '.scopes.jsonl', rows.map(row => JSON.stringify(row)).join('\n') + '\n');
        const scheduled = [{ ...start, provenance: host }, ...planned, { event: 'slot-start', id: 'U1', repetition: 1 },
            ...rows.map(row => ({ ...row, slot: { id: 'U1', repetition: 1 } })),
            { event: 'slot-finish', id: 'U1', repetition: 1, exit: { code: 0, signal: null, namespaceInitStopped: true } }];
        fs.writeFileSync(path.join(f.directory, 'slots.jsonl'), scheduled.map(row => JSON.stringify(row)).join('\n') + '\n');
    };
    const score = () => {
        const run = spawnSync('python3', [path.join(ev07, 'score-review.py'), f.directory], {
            encoding: 'utf8', env: { ...process.env, COPILOT_EV07_PLAN: planFile } });
        assert.equal(run.status, 0, run.stderr); return JSON.parse(run.stdout);
    };
    saveScope(scope);
    const valid = score(); assert.equal(valid.passed, false); assert.equal(valid.rows.length, 42);
    assert.equal(valid.rows[0].status, 'incomplete'); assert.equal(valid.rows[0].actualCalls.verifierCalls, 2);
    assert.equal(valid.rows[0].containment.complete, true); assert.equal(valid.checks.complete, false);
    for (const mutate of [rows => rows.splice(4, 1), rows => { rows[4].namespaceInitStopped = false; },
        rows => { rows[5].identity.imageSha256 = 'f'.repeat(64); }, rows => rows.push(rows[1])]) {
        const rows = clone(scope); mutate(rows); saveScope(rows);
        const invalid = score(); assert.equal(invalid.passed, false); assert.equal(invalid.rows[0].status, 'invalid');
    }
    saveScope(scope);
    const originalHostRuntime = host.runtime;
    host.runtime = {}; first.provenance.runtime = {};
    fs.writeFileSync(reviewFile, [first, ...f.rows, scoredResult].map(row => JSON.stringify(row)).join('\n') + '\n');
    saveScope(scope);
    const missingObservedRuntime = score();
    assert.equal(missingObservedRuntime.rows[0].status, 'invalid', 'copied empty host/worker projections cannot replace actual runtime observations');
    host.runtime = originalHostRuntime;
});

test('ev974-C31 corpus collector failure aborts siblings and awaits their confirmed stops', async t => {
    // Component control only: synthetic cases and modeled containment, no CLI,
    // Docker, provider, corpus campaign or qualification admission is executed.
    require('../issue-950/ev07-shadow/load.cjs');
    const vm = require('node:vm'), { EventEmitter } = require('node:events');
    const directory = temporary(t), destination = path.join(directory, 'result');
    const selected = plan(); selected.containment = containmentProfile(); selected.corpus.concurrency = 3;
    const source = fs.readFileSync(path.join(ev07, 'corpus.cjs'), 'utf8'), module = { exports: {} };
    const events = new EventEmitter(), pendingStops = [];
    const provenance = { implementation: selected.implementation, runtime: { fixture: 'host' } };
    const worker = { ...provenance, runtime: { fixture: 'worker' } };
    let started = 0, aborts = 0, returned = false;
    const fakeContainment = { async runContainedOperation(request) {
        fs.mkdirSync(request.outputDirectory, { mode: 0o700 });
        if (request.preflight) {
            const inner = path.join(request.outputDirectory, 'corpus-v3'); fs.mkdirSync(inner);
            fs.writeFileSync(path.join(inner, 'corpus.jsonl'), [
                { event: 'start', provenance: worker }, { event: 'planner-preflight' }, { event: 'finish' },
            ].map(row => JSON.stringify(row)).join('\n') + '\n');
            return { exitCode: 0, interrupted: false, namespaceInitStopped: true };
        }
        started++;
        if (started === 1) {
            request.record({ event: 'scope-stopped', namespaceInitStopped: true });
            const inner = path.join(request.outputDirectory, 'corpus-v3'); fs.mkdirSync(inner);
            // A real filesystem collector error after this modeled scope stops.
            fs.mkdirSync(path.join(inner, 'corpus.jsonl'));
            return { exitCode: 0, interrupted: false, namespaceInitStopped: true };
        }
        return new Promise(resolve => {
            request.signal.addEventListener('abort', () => { aborts++; }, { once: true });
            let stopped = false;
            pendingStops.push(() => {
                if (stopped) return;
                stopped = true;
                request.record({ event: 'scope-stopped', namespaceInitStopped: true });
                resolve({ exitCode: 143, interrupted: true, namespaceInitStopped: true });
            });
        });
    } };
    const controlledRequire = name => {
        if (name === '../execution-provenance.cjs') return {
            requireBootstrapAdmission() {}, bootstrapOperation() {}, admitQualificationModules() {},
        };
        if (name === './configuration.cjs') return selected;
        if (name === './implementation.cjs') return {
            qualificationProvenance: () => provenance,
            selectedPlanProvenance: () => ({ sha256: 'a'.repeat(64) }),
            expectedQualificationContext: () => worker,
        };
        if (name === './load.cjs') return {};
        if (name === '../../issue974/corpus-selection.cjs') return { selectedCorpus: () => ({ file: '/synthetic/corpus' }) };
        if (name === '../../../../../src/tooling/bugbot_benchmark') return {
            loadBugbotBenchmark: async () => ({ cases: Array.from({ length: 174 }, (_, index) => ({ id: 'synthetic-' + index })) }),
            evaluateBugbotBenchmark: () => ({ violations: ['model-free component fixture, not a measured campaign'] }),
        };
        if (name === '../../issue974/attempt-ledger.cjs') return require('./attempt-ledger.cjs');
        if (name === '../../issue974/operation-containment.cjs') return fakeContainment;
        if (name === '../../../../../src/application/policies/qualification_operation_scope_policy') {
            return require(path.join(root, 'src/application/policies/qualification_operation_scope_policy'));
        }
        if (name.startsWith('node:')) return require(name);
        throw new Error('Unplanned component dependency: ' + name);
    };
    vm.runInNewContext(source, { require: controlledRequire, module, __dirname: ev07,
        __filename: path.join(ev07, 'corpus.cjs'), process: events, AbortController, JSON });
    const running = module.exports.run(destination).then(value => { returned = true; return { value }; },
        error => { returned = true; return { error }; });
    try {
        await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
        if (started === 0 && returned) assert.equal((await running).error, undefined, 'component preflight must reach dispatch');
        assert.equal(started, 3); assert.equal(pendingStops.length, 2);
        assert.equal(aborts, 2, 'collector failure must abort both pending sibling scopes');
        assert.equal(returned, false, 'the collector must await confirmed sibling stops');
        for (const stop of pendingStops) stop();
        const result = await running;
        assert.equal(result.error, undefined); assert.equal(result.value.status, 'failed');
        assert.equal(started, 3, 'a collector failure must not dispatch later synthetic slots');
        const rows = fs.readFileSync(path.join(destination, 'corpus.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
        assert.equal(rows.filter(row => row.event === 'case-slot').length, 174);
        assert.equal(rows.filter(row => row.event === 'collector-failure').length, 1);
        assert.equal(rows.filter(row => row.event === 'case' && row.status === 'missing-terminal').length, 1);
        assert.equal(rows.filter(row => row.event === 'case' && row.status === 'interrupted').length, 2);
        assert.equal(rows.filter(row => row.event === 'case' && row.status === 'not-started').length, 171);
        assert.equal(rows.at(-1).passed, false); assert.equal(rows.at(-1).complete, false);
        assert.equal(events.listenerCount('SIGINT'), 0); assert.equal(events.listenerCount('SIGTERM'), 0);
    } finally {
        for (const stop of pendingStops) stop();
        await running;
        await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
    }
});

require('./review-driver-components.cjs');
require('./component-coverage-gate-components.cjs');

require('./stop-record-components.cjs');

require('./startup-stop-components.cjs');
require('./late-cancellation-components.cjs');
require('./native-bootstrap-components.cjs');
require('./owner-loss-components.cjs');
require('./managed-requirements-components.cjs');
require('./worker-scratch-components.cjs');
require('./seccomp-components.cjs').registerBootstrapControls(t => publicBootstrapFixture(t, false, () => {}));
