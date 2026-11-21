'use strict';
// Model-free component controls. No provider, CLI, Docker or campaign is invoked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../../../..');
const ev07 = path.join(root, 'quality/bugbot/evidence/issue-950/ev07-shadow');
const file = path.join(ev07, 'corpus.cjs');
const source = fs.readFileSync(file, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(t, options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-corpus-component-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const selected = clone(JSON.parse(fs.readFileSync(path.join(ev07, 'plan.json'))));
    selected.schemaVersion = 2; selected.containment = { image: 'sha256:' + 'd'.repeat(64) };
    selected.corpus.concurrency = 1;
    selected.inspectedArtifacts = { 'corpus.cjs': hash(source) };
    const cases = Array.from({ length: 174 }, (_, index) => ({ id: 'component-only-' + index }));
    const provenance = { implementation: selected.implementation, runtime: { fixture: 'host' } };
    const worker = { ...provenance, runtime: { fixture: 'worker' } };
    const events = new EventEmitter(), recorderRows = [], requests = [];
    const destination = path.join(directory, 'result');
    let attemptsValidated = 0, operationsValidated = 0, prepared = 0;
    const recorders = { createDurableRecorder(ledger) {
        return row => { recorderRows.push(row); fs.appendFileSync(ledger, JSON.stringify(row) + '\n', { mode: 0o600 }); };
    }, validateCompleteAttempts(rows, results, plan, artifacts) {
        attemptsValidated++; assert.equal(plan, selected); assert(fs.statSync(artifacts).isDirectory());
        assert.equal(results.length, 174);
        if (options.attemptsInvalid) throw new Error('controlled incomplete attempt evidence');
    } };
    const fakeContainment = { async runContainedOperation(request) {
        requests.push(request);
        fs.mkdirSync(request.outputDirectory, { mode: 0o700 });
        const inner = path.join(request.outputDirectory, 'corpus-v3'); fs.mkdirSync(inner);
        const ledger = path.join(inner, 'corpus.jsonl');
        const rows = [{ event: 'start', provenance: clone(worker), cli: 'component-cli', cliProbe: { fixture: true } },
            { event: 'planner-preflight' }];
        if (request.preflight) {
            if (options.preflightAttempt) rows.push({ event: 'attempt-started' });
            if (options.preflightNoPlanner) rows.pop();
            if (options.preflightForeign) rows[0].provenance.runtime.fixture = 'foreign';
            fs.writeFileSync(ledger, rows.map(JSON.stringify).join('\n') + (options.preflightTruncated ? '' : '\n'));
            return { exitCode: options.preflightExit ?? 0, interrupted: !!options.preflightInterrupted };
        }
        const index = request.slot.index, id = request.slot.caseId;
        request.record({ event: 'operation-start', identity: { operationId: 'corpus:' + id }, scopeId: 'scope-' + index });
        if (options.signalAfterFirst && index === 0) events.emit(options.signalAfterFirst);
        if (options.throwTransport && index === 0) throw new Error('controlled transport failure');
        rows.push({ event: 'attempt-observed', attemptId: 'component-attempt-' + index });
        rows.push({ event: 'case', index, id, status: 'completed', predictions: [], calls: [], runtimeProofs: [], attemptIds: [] });
        rows.push({ event: 'finish', workspaceUnchanged: true });
        if (options.mutate && index === 0) options.mutate(rows, request, inner);
        fs.writeFileSync(ledger, rows.map(JSON.stringify).join('\n') + (options.truncated && index === 0 ? '' : '\n'));
        if (options.malformed && index === 0) fs.appendFileSync(ledger, '{invalid}\n');
        if (options.artifact && index === 0) {
            const artifacts = path.join(inner, 'attempts'); fs.mkdirSync(artifacts);
            const name = options.artifact.name;
            if (options.artifact.directory) fs.mkdirSync(path.join(artifacts, name));
            else if (options.artifact.symlink) fs.symlinkSync(file, path.join(artifacts, name));
            else fs.writeFileSync(path.join(artifacts, name), 'controlled model-free request');
        }
        request.record({ event: 'operation-stopped', identity: { operationId: 'corpus:' + id }, scopeId: 'scope-' + index,
            namespaceInitStopped: !options.unknownStop, interrupted: false, exitCode: options.workerExit ?? 0 });
        return { exitCode: options.workerExit ?? 0, interrupted: !!options.workerInterrupted,
            scopeId: 'scope-' + index, namespaceInitStopped: !options.unknownStop };
    } };
    const deps = {
        '../execution-provenance.cjs': { requireBootstrapAdmission() {}, bootstrapOperation() {}, admitQualificationModules() {} },
        './configuration.cjs': selected,
        './implementation.cjs': { qualificationProvenance: () => provenance,
            selectedPlanProvenance: () => ({ sha256: 'a'.repeat(64) }), expectedQualificationContext: () => worker },
        './load.cjs': {},
        '../../issue974/corpus-selection.cjs': { selectedCorpus: () => ({ file: '/synthetic/corpus' }) },
        '../../../../../src/tooling/bugbot_benchmark': {
            loadBugbotBenchmark: async () => ({ cases: options.shortCorpus ? cases.slice(1) : cases }),
            evaluateBugbotBenchmark: () => ({ violations: options.scoreInvalid ? ['controlled scorer rejection'] : [] }) },
        '../../issue974/attempt-ledger.cjs': recorders,
        '../../issue974/operation-containment.cjs': fakeContainment,
        '../../../../../src/application/policies/qualification_operation_scope_policy': {
            requireCompleteQualificationOperations(expected, actual, context) {
                operationsValidated++; assert.equal(expected.length, 174); assert.equal(actual.length, options.throwTransport ? 1 : 348);
                assert.equal(context.imageSha256, 'd'.repeat(64));
                if (options.scopeInvalid) throw new Error('controlled scope admission failure');
            } },
    };
    const module = { exports: {} };
    vm.runInNewContext(source, { require(name) {
        if (Object.hasOwn(deps, name)) return deps[name];
        if (name.startsWith('node:')) return require(name);
        throw new Error('Unplanned component dependency: ' + name);
    }, module, __filename: file, __dirname: ev07, process: events, AbortController, JSON });
    return { directory, selected, events, requests, rows: recorderRows,
        run: flag => module.exports.run(destination, flag), destination,
        decision: () => JSON.parse(fs.readFileSync(path.join(destination, 'corpus-score.json'))),
        counters: () => ({ attemptsValidated, operationsValidated, prepared }),
        transforms: module.exports.containedOperationRecords };
}

test('ev974-C31 component aggregation admits a complete synthetic collection only with every independent gate', async t => {
    const f = fixture(t); const result = await f.run();
    assert.equal(result.status, 'completed');
    assert.equal(f.requests.length, 175); // one no-model preflight plus synthetic slot transports
    assert.deepEqual(f.counters(), { attemptsValidated: 1, operationsValidated: 1, prepared: 0 });
    assert.deepEqual(Object.fromEntries(Object.entries(f.decision()).filter(([k]) => k !== 'score')), {
        complete: true, completed: 174, attemptsComplete: true, containmentComplete: true,
        passed: true, githubWriteAttempts: 0, workspaceUnchanged: true });
    assert.equal(f.rows.filter(row => row.event === 'attempt-observed').length, 174);
    assert.equal(f.events.listenerCount('SIGINT'), 0); assert.equal(f.events.listenerCount('SIGTERM'), 0);
});

test('ev974-C31 preflight returns without dispatching a synthetic slot or recording a campaign finish', async t => {
    const f = fixture(t); assert.equal(await f.run('--preflight'), undefined);
    assert.equal(f.requests.length, 1); assert.equal(f.rows.at(-1).event, 'preflight-finish');
    assert.equal(f.rows.at(-1).modelCalls, 0); assert.equal(f.rows.at(-1).fullReview, 'unstarted');
    assert(!fs.existsSync(path.join(f.destination, 'corpus-score.json')));
    assert.equal(f.events.listenerCount('SIGINT'), 0); assert.equal(f.events.listenerCount('SIGTERM'), 0);
});

for (const [name, options] of Object.entries({
    'nonzero preflight': { preflightExit: 1 }, 'interrupted preflight': { preflightInterrupted: true },
    'preflight attempt': { preflightAttempt: true }, 'truncated preflight ledger': { preflightTruncated: true },
    'missing planner preflight': { preflightNoPlanner: true }, 'foreign preflight provenance': { preflightForeign: true },
})) test('ev974-C31 rejects ' + name + ' before any synthetic slot dispatch', async t => {
    const f = fixture(t, options); await assert.rejects(f.run());
    assert.equal(f.requests.length, 1); assert(!f.rows.some(row => row.event === 'case-dispatch'));
    assert(!f.rows.some(row => row.event === 'finish'));
    assert.equal(f.events.listenerCount('SIGINT'), 0); assert.equal(f.events.listenerCount('SIGTERM'), 0);
});

for (const [name, options, field] of [
    ['attempt evidence', { attemptsInvalid: true }, 'attemptsComplete'],
    ['operation scope evidence', { scopeInvalid: true }, 'containmentComplete'],
    ['independent score', { scoreInvalid: true }, null],
    ['changed worker workspace', { mutate: rows => { rows.at(-1).workspaceUnchanged = false; } }, 'workspaceUnchanged'],
    ['nonzero worker exit', { workerExit: 1 }, 'complete'],
    ['interrupted worker', { workerInterrupted: true }, 'complete'],
    ['truncated worker ledger', { truncated: true }, 'complete'],
    ['malformed worker ledger', { malformed: true }, 'complete'],
]) test('ev974-C31 fails the synthetic collection for invalid ' + name, async t => {
    const f = fixture(t, options); assert.equal((await f.run()).status, 'failed');
    const decision = f.decision(); assert.equal(decision.passed, false);
    if (field) assert.equal(decision[field], false);
    assert.equal(f.rows.at(-1).passed, false);
});

for (const [name, mutate] of [
    ['duplicate case rows', rows => rows.push(rows.find(row => row.event === 'case'))],
    ['foreign case id', rows => { rows.find(row => row.event === 'case').id = 'foreign'; }],
    ['foreign case index', rows => { rows.find(row => row.event === 'case').index = 1; }],
]) test('ev974-C31 a collector rejects ' + name + ' and stops later synthetic dispatch', async t => {
    const f = fixture(t, { mutate }); assert.equal((await f.run()).status, 'failed');
    assert.equal(f.requests.length, 2); assert.equal(f.rows.filter(row => row.event === 'collector-failure').length, 1);
    assert.equal(f.rows.filter(row => row.event === 'case' && row.status === 'missing-terminal').length, 1);
    assert.equal(f.rows.filter(row => row.event === 'case' && row.status === 'not-started').length, 173);
});

test('ev974-C31 foreign worker provenance interrupts aggregation before any further synthetic dispatch', async t => {
    const f = fixture(t, { mutate: rows => { rows[0].provenance.runtime.fixture = 'foreign'; } });
    assert.equal((await f.run()).status, 'failed'); assert.equal(f.requests.length, 2);
    assert.equal(f.rows.find(row => row.event === 'case').status, 'interrupted');
    assert.equal(f.rows.filter(row => row.event === 'case' && row.status === 'not-started').length, 173);
});

for (const signal of ['SIGINT', 'SIGTERM']) test('ev974-C31 ' + signal + ' stops later synthetic dispatch and releases listeners', async t => {
    const f = fixture(t, { signalAfterFirst: signal }); assert.equal((await f.run()).status, 'failed');
    assert.equal(f.requests.length, 2); assert.equal(f.rows.filter(row => row.event === 'case-dispatch').length, 1);
    assert.equal(f.events.listenerCount('SIGINT'), 0); assert.equal(f.events.listenerCount('SIGTERM'), 0);
});

for (const [name, artifact] of [
    ['foreign artifact name', { name: 'foreign.json' }],
    ['directory artifact', { name: 'a'.repeat(24) + '-1.request.json', directory: true }],
    ['symlink artifact', { name: 'a'.repeat(24) + '-1.request.json', symlink: true }],
]) test('ev974-C31 rejects ' + name + ' without retaining it as an executed attempt', async t => {
    const f = fixture(t, { artifact }); assert.equal((await f.run()).status, 'failed');
    assert.equal(f.requests.length, 2); assert.equal(f.rows.filter(row => row.event === 'collector-failure').length, 1);
    assert.equal(fs.readdirSync(path.join(f.destination, 'attempts')).length, 0);
});

test('ev974-C31 valid request artifacts are copied byte-for-byte privately without replay', async t => {
    const name = 'a'.repeat(24) + '-1.request.json', f = fixture(t, { artifact: { name } });
    assert.equal((await f.run()).status, 'completed');
    const artifact = path.join(f.destination, 'attempts', name);
    assert.equal(fs.readFileSync(artifact, 'utf8'), 'controlled model-free request');
    assert.equal(fs.statSync(artifact).mode & 0o777, 0o600); assert.equal(f.requests.length, 175);
});

test('ev974-C31 transport rejection aborts rather than replaying a missing terminal slot', async t => {
    const f = fixture(t, { throwTransport: true }); assert.equal((await f.run()).status, 'failed');
    assert.equal(f.requests.length, 2); assert.equal(f.rows.filter(row => row.event === 'case-dispatch').length, 1);
    assert.equal(f.rows.find(row => row.event === 'case').status, 'interrupted');
});

test('ev974-C31 operation record projection excludes preflight and preserves actual stop outcomes', t => {
    const f = fixture(t); const identity = { operationId: 'component' };
    const rows = [{ event: 'operation-start', identity, scopeId: 'a' },
        { event: 'operation-stopped', identity, scopeId: 'a', namespaceInitStopped: true, exitCode: 0 },
        { event: 'operation-stopped', identity, scopeId: 'b', namespaceInitStopped: false, exitCode: 2 },
        { event: 'operation-stopped', identity, scopeId: 'c', namespaceInitStopped: true, exitCode: 143, interrupted: true },
        { event: 'operation-start', identity, scopeId: 'preflight', preflight: true }, { event: 'case' }];
    assert.deepEqual(clone(f.transforms(rows)), [
        { event: 'start', identity, scopeId: 'a' },
        { event: 'stopped', identity, scopeId: 'a', namespaceInitStopped: true, outcome: 'completed' },
        { event: 'stopped', identity, scopeId: 'b', namespaceInitStopped: false, outcome: 'failed' },
        { event: 'stopped', identity, scopeId: 'c', namespaceInitStopped: true, outcome: 'interrupted' }]);
});
