'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../../../..');
const ev07 = path.join(__dirname, '../issue-950/ev07-shadow');
const sourceProof = require('../issue-950/execution-provenance.cjs');
const implementation = require('../issue-950/ev07-shadow/implementation.cjs');
const { selectedCorpus, requireCorpusSelection } = require('./corpus-selection.cjs');
const { createDurableRecorder, createRecordedCli, validateCompleteAttempts } = require('./attempt-ledger.cjs');
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
    return (...args) => execFileSync(sourceProof.trustedGitExecutable(), ['-C', directory, ...args], { encoding: 'utf8',
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

function publicBootstrapFixture(t, moduleFence = false) {
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
    const p = plan(), drivers = implementation.selectedQualificationDrivers(p);
    for (const file of drivers) write(path.posix.normalize(prefix + 'ev07-shadow/' + file), 'module.exports={};\n');
    for (const file of ['execution-provenance.cjs', 'qualification-bootstrap.cjs']) write(prefix + file, fs.readFileSync(path.join(__dirname, '../issue-950', file)));
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
