'use strict';
// Modeled provenance/scorer/attempt/scope ports; actual private fixture files.
// A synthetic passing envelope here never constitutes corpus qualification.
// Historical/optional metadata variants are below modeled admission ports,
// not current contained-runtime admission for ev974-C26 or an actual campaign.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const os = require('node:os'), vm = require('node:vm'), { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto'), { test } = require('node:test');
const root = path.resolve(__dirname, '../../../..'), ev07 = path.join(root, 'quality/bugbot/evidence/issue-950/ev07-shadow');
const file = path.join(ev07, 'launch-full-review.cjs'), source = fs.readFileSync(file, 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(t, options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-launch-component-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const output = path.join(directory, 'corpus-v3'); fs.mkdirSync(output);
    const inventory = { cases: [{ id: 'fixture-one' }, { id: 'fixture-two' }, { id: 'fixture-three' }] };
    const corpusFile = path.join(directory, 'synthetic-corpus.json'); fs.writeFileSync(corpusFile, JSON.stringify(inventory));
    const plan = { schemaVersion: options.v1 ? 1 : 2, implementation: 'b'.repeat(40),
        corpus: { cases: 3, sha256: hash(fs.readFileSync(corpusFile)), gates: { precision: .9, recall: .85, f1: .87, exactLocation: .8, severity: .8, category: .8, maxBrier: .16 } },
        detector: { model: 'component-model', modelProvider: 'component-provider', effort: 'xhigh' },
        runtime: { executableSha256: 'a'.repeat(64), launcherSha256: 'b'.repeat(64), nativeExecutableSha256: 'c'.repeat(64) },
        inspectedArtifacts: { 'corpus.cjs': hash(fs.readFileSync(path.join(ev07, 'corpus.cjs'))) } };
    if (!options.noContainment && !options.v1) plan.containment = { image: 'sha256:' + 'd'.repeat(64) };
    if (options.legacyExecutable) { plan.runtime.codexSha256 = plan.runtime.executableSha256; delete plan.runtime.executableSha256; }
    if (options.noLauncher) delete plan.runtime.launcherSha256;
    if (options.noNative) delete plan.runtime.nativeExecutableSha256;
    const planFile = path.join(directory, 'plan.json'); fs.writeFileSync(planFile, JSON.stringify(plan));
    const preregistration = { componentOnly: true, sha256: hash(fs.readFileSync(planFile)) };
    const provenance = { implementation: plan.implementation, componentOnly: true };
    const context = mode => ({ ...provenance, mode });
    const flags = { model: plan.detector.model, modelProvider: plan.detector.modelProvider, reasoningEffort: plan.detector.effort, sandbox: 'read-only' };
    const runtimeProof = { executableSha256: plan.runtime.executableSha256 ?? plan.runtime.codexSha256,
        ...(plan.runtime.launcherSha256 ? { launcherSha256: plan.runtime.launcherSha256 } : {}),
        ...(plan.runtime.nativeExecutableSha256 ? { nativeExecutableSha256: plan.runtime.nativeExecutableSha256 } : {}) };
    const score = { violations: [], missingCases: [], componentOnly: true };
    const predictions = { schemaVersion: 1, predictions: Object.fromEntries(inventory.cases.map(row => [row.id, []])) };
    const start = { event: 'start', plan: hash(fs.readFileSync(planFile)), preregistration, runner: plan.inspectedArtifacts['corpus.cjs'],
        implementation: plan.implementation, provenance: context('host'), corpus: plan.corpus.sha256, gitHubMutationPorts: 0,
        configuration: copy(plan.detector), cli: 'component-cli', preflightScope: { namespaceInitStopped: true, exitCode: 0, interrupted: false, preflight: true } };
    const rows = [start];
    if (!options.v1) rows.push(...inventory.cases.map((item, index) => ({ event: 'case-slot', index, id: item.id, status: 'not-started' })));
    for (const [index, item] of inventory.cases.entries()) {
        const identity = { operationId: 'corpus:' + item.id }, scopeId = 'scope-' + index;
        if (plan.containment) rows.push({ event: 'case-dispatch', index, id: item.id },
            { event: 'operation-start', identity, scopeId }, { event: 'operation-stopped', identity, scopeId, namespaceInitStopped: true, exitCode: 0 });
        rows.push({ event: 'case', index, id: item.id, status: 'completed', predictions: [], calls: [copy(flags)], runtimeProofs: [copy(runtimeProof)],
            namespaceInitStopped: true, workspaceUnchanged: true, workerProvenance: context('worker'), scopeId });
    }
    rows.push({ event: 'finish', complete: true, passed: true, githubWriteAttempts: 0, workspaceUnchanged: true });
    const result = { complete: true, completed: 3, passed: true, githubWriteAttempts: 0, workspaceUnchanged: true,
        attemptsComplete: true, containmentComplete: true, score: copy(score) };
    const events = new EventEmitter(), child = new EventEmitter(), launches = [], kills = [];
    events.env = { COPILOT_EV07_PLAN: planFile }; events.execPath = '/component/node';
    child.kill = signal => { kills.push(signal); return true; };
    let scorerCalls = 0, attemptCalls = 0, scopeCalls = 0;
    const deps = {
        'node:fs': { readFileSync(target, encoding) { return fs.readFileSync(target === path.join(root, 'quality/bugbot/corpus.v1.json') ? corpusFile : target, encoding); } },
        '../execution-provenance.cjs': { requireBootstrapAdmission() { if (options.noAdmission) throw new Error('component bootstrap rejection'); },
            spawnQualificationDriver(...args) { launches.push(args); return child; } },
        './configuration.cjs': plan,
        './implementation.cjs': { qualificationProvenance: () => provenance, selectedPlanProvenance: () => preregistration,
            expectedQualificationContext: (_provenance, _plan, mode) => context(mode),
            requirePinnedRuntime(cli) { assert.equal(cli, 'component-cli'); if (options.cliRejected) throw new Error('component runtime rejection'); } },
        '../../issue974/corpus-selection.cjs': { selectedCorpus: () => ({ file: corpusFile }) },
        '../../issue974/attempt-ledger.cjs': { validateCompleteAttempts(ledger, cases, selected, artifacts) {
            attemptCalls++; assert.equal(selected, plan); assert.equal(cases.length, 3); assert.equal(artifacts, path.join(output, 'attempts'));
            if (options.attemptsRejected) throw new Error('component attempt rejection');
        } },
        './load.cjs': {},
        [path.join(root, 'src/application/policies/qualification_operation_scope_policy')]: {
            requireCompleteQualificationOperations(expected, actual, selected) {
                scopeCalls++; assert.equal(expected.length, 3); assert.equal(actual.length, 6); assert.equal(selected.imageSha256, 'd'.repeat(64));
                if (options.scopesRejected) throw new Error('component scope rejection');
            } },
        './corpus.cjs': { containedOperationRecords(ledger) {
            return ledger.filter(row => ['operation-start', 'operation-stopped'].includes(row.event));
        } },
        [path.join(root, 'src/tooling/bugbot_benchmark')]: { evaluateBugbotBenchmark(actual, supplied, gates) {
            scorerCalls++; assert.deepEqual(actual, inventory); assert.deepEqual(supplied, predictions); assert.equal(gates.maxConfidenceBrierScore, .16);
            return score;
        } },
    };
    const module = { exports: {} }, controlledRequire = name => {
        if (Object.hasOwn(deps, name)) return deps[name];
        if (name.startsWith('node:')) return require(name);
        throw new Error('Unplanned launch component dependency: ' + name);
    };
    if (options.direct) controlledRequire.main = module;
    // Use this realm's intrinsic objects so strict JSON/provenance comparisons
    // retain their production prototype semantics; only explicit ports differ.
    const load = () => vm.compileFunction(source, ['require', 'module', '__filename', '__dirname', 'process'], { filename: file })
        (controlledRequire, module, file, ev07, events);
    if (options.direct) return { load };
    load();
    const save = () => {
        fs.writeFileSync(path.join(output, 'predictions.json'), JSON.stringify(predictions));
        fs.writeFileSync(path.join(output, 'corpus-score.json'), JSON.stringify(result));
        fs.writeFileSync(path.join(output, 'corpus.jsonl'), rows.map(JSON.stringify).join('\n') + '\n');
    };
    save();
    return { api: module.exports, directory, plan, rows, result, predictions, save, events, child, launches, kills,
        counters: () => ({ scorerCalls, attemptCalls, scopeCalls }), start };
}

for (const [name, options] of Object.entries({ v2: {}, historical: { v1: true }, 'no containment': { noContainment: true },
    'legacy executable key': { legacyExecutable: true }, 'no launcher': { noLauncher: true }, 'no native executable': { noNative: true } })) {
    test('launcher component: admits coherent ' + name + ' metadata before its injected launch', t => {
        const f = fixture(t, options); let calls = 0;
        const returned = f.api.launchFullReview(f.directory, (executable, args, settings) => {
            calls++; assert.equal(executable, '/component/node'); assert.equal(args[0], path.join(ev07, 'full-review.cjs'));
            assert.equal(args[1], f.directory); assert.equal(settings.stdio, 'inherit'); return 'controlled-child';
        });
        assert.equal(returned, 'controlled-child'); assert.equal(calls, 1); assert.equal(f.counters().scorerCalls, 1);
        assert.equal(f.counters().attemptCalls, options.v1 ? 0 : 1); assert.equal(f.counters().scopeCalls, options.v1 || options.noContainment ? 0 : 1);
    });
}

for (const [name, mutate] of [
    ['attempt completeness', f => { f.result.attemptsComplete = false; }],
    ['containment completeness', f => { f.result.containmentComplete = false; }],
    ['slot inventory', f => { f.rows.find(row => row.event === 'case-slot').id = 'foreign'; }],
    ['dispatch order', f => { f.rows.find(row => row.event === 'case-dispatch').index = 2; }],
    ['preflight stop', f => { f.start.preflightScope.namespaceInitStopped = false; }],
    ['preflight interrupted', f => { f.start.preflightScope.interrupted = true; }],
    ['worker namespace stop', f => { f.rows.find(row => row.event === 'case').namespaceInitStopped = false; }],
    ['worker workspace', f => { f.rows.find(row => row.event === 'case').workspaceUnchanged = false; }],
    ['worker provenance', f => { f.rows.find(row => row.event === 'case').workerProvenance.mode = 'foreign'; }],
    ['worker stopped scope', f => { f.rows.find(row => row.event === 'operation-stopped').identity.operationId = 'foreign'; }],
    ['predictions identity', f => { delete f.predictions.predictions['fixture-two']; }],
    ['case status', f => { f.rows.find(row => row.event === 'case').status = 'interrupted'; }],
    ['call flags', f => { f.rows.find(row => row.event === 'case').calls[0].sandbox = 'danger-full-access'; }],
    ['runtime proof', f => { f.rows.find(row => row.event === 'case').runtimeProofs[0].launcherSha256 = 'f'.repeat(64); }],
    ['empty calls', f => { f.rows.find(row => row.event === 'case').calls = []; }],
    ['independent score', f => { f.result.score.componentOnly = false; }],
]) test('launcher component: refuses changed ' + name + ' with zero launch attempts', t => {
    const f = fixture(t); mutate(f); f.save();
    assert.throws(() => f.api.launchFullReview(f.directory), /provenance/); assert.equal(f.launches.length, 0);
});

for (const [name, options] of Object.entries({ 'attempt admission': { attemptsRejected: true }, 'scope admission': { scopesRejected: true },
    'CLI admission': { cliRejected: true } })) test('launcher component: preserves ' + name + ' rejection before launch', t => {
    const f = fixture(t, options); assert.throws(() => f.api.launchFullReview(f.directory), /provenance/); assert.equal(f.launches.length, 0);
});

test('launcher component: requires a campaign directory and rejects direct entry', t => {
    const f = fixture(t); assert.throws(() => f.api.requirePassingCorpus(), /usage/); assert.equal(f.launches.length, 0);
    assert.throws(() => fixture(t, { direct: true }).load(), /immutable bootstrap/);
});

for (const [code, signal, expected] of [[0, null, 0], [null, 'SIGINT', 130], [null, 'SIGTERM', 143], [null, 'SIGKILL', 1]]) {
    test('launcher component: propagates terminal ' + String(code) + '/' + signal, async t => {
        const f = fixture(t), running = f.api.run(f.directory);
        assert.equal(f.launches.length, 1); assert.equal(f.launches[0][0], 'full-review-runner');
        f.events.emit('SIGINT'); f.events.emit('SIGTERM'); assert.deepEqual(f.kills, ['SIGINT', 'SIGTERM']);
        f.child.emit('close', code, signal); assert.equal(await running, expected);
        assert.equal(f.events.listenerCount('SIGINT'), 0); assert.equal(f.events.listenerCount('SIGTERM'), 0);
    });
}

test('launcher component: rejects spawn error and cleans signal listeners at close', async t => {
    const f = fixture(t), running = f.api.run(f.directory), error = new Error('controlled child spawn error');
    f.child.emit('error', error); f.child.emit('close', null, null); await assert.rejects(running, value => value === error);
    assert.equal(f.events.listenerCount('SIGINT'), 0); assert.equal(f.events.listenerCount('SIGTERM'), 0);
});

test('launcher component: never starts a child without bootstrap admission', async t => {
    const f = fixture(t, { noAdmission: true }); await assert.rejects(f.api.run(f.directory), /bootstrap rejection/); assert.equal(f.launches.length, 0);
});
