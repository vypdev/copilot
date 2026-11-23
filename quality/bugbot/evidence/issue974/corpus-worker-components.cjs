'use strict';
// Purely modeled CLI/agent ports around actual source and actual private FS.
// This does not execute a provider, Docker, native CLI or qualification campaign.
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
const file = path.join(ev07, 'corpus.cjs'), source = fs.readFileSync(file, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

function fixture(t, options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-corpus-worker-component-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const selected = JSON.parse(fs.readFileSync(path.join(ev07, 'plan.json')));
    delete selected.containment; selected.schemaVersion = options.v2 ? 2 : 1;
    const corpusFile = path.join(root, 'quality/bugbot/corpus.v1.json');
    selected.corpus.sha256 = hash(fs.readFileSync(corpusFile));
    selected.corpus.cases = 3; selected.corpus.concurrency = options.concurrency ?? 1;
    selected.inspectedArtifacts = { 'corpus.cjs': hash(source) };
    const cases = Array.from({ length: 3 }, (_, index) => ({ id: 'model-free-worker-' + index }));
    const controller = new AbortController();
    const operation = options.v2 && !options.missingOperation
        ? { slot: { index: options.index ?? 0, caseId: options.wrongSlot ? 'foreign' : cases[options.index ?? 0].id },
            signal: controller.signal, abort: () => controller.abort() } : undefined;
    const provenance = { implementation: selected.implementation, runtime: { component: 'worker' } };
    const events = new EventEmitter(), invocations = [], preparations = [], queries = [], records = [];
    let currentDirectory = directory, gitInvocations = 0, evaluated = 0, attemptsValidated = 0;
    events.cwd = () => currentDirectory; events.chdir = value => { currentDirectory = value; };
    const destination = path.join(directory, 'output');
    const flags = { model: selected.detector.model, modelProvider: selected.detector.modelProvider,
        reasoningEffort: selected.detector.effort, sandbox: 'read-only', ...options.flags };
    const preparePinnedExecution = (_planner, request) => {
        const runtimeDirectory = path.join(directory, 'invocation-' + invocations.length);
        fs.mkdirSync(runtimeDirectory);
        const invocation = { runtimeDirectory, argv: ['component-only'], runtimeContract: { component: true },
            workspaceMode: 'read-only', output: 'native-and-local-json-schema', qualificationInvestigation: options.research !== false,
            artifacts: options.noSchema ? [] : [{ purpose: 'output-schema', sha256: 'f'.repeat(64) }] };
        invocations.push({ invocation, request }); return invocation;
    };
    class ControlledClient {
        constructor(port) { this.port = port; }
        async execute(request) {
            this.port.prepare(request); queries.push(request);
            if (options.signal && queries.length === 1) {
                if (operation) operation.abort(); else events.emit(options.signal);
                throw Object.assign(new Error('controlled interruption'), { name: 'AbortError' });
            }
            if (options.failure) throw options.failure;
            return options.raw === undefined ? JSON.stringify({ findings: [] }) : options.raw;
        }
    }
    const deps = {
        'node:fs': { ...fs, appendFileSync(file, content, settings) {
            const row = options.caseLedgerFailure || options.collectorRecordFailure ? JSON.parse(content) : undefined;
            if (options.caseLedgerFailure && row?.event === 'case' && row.id === cases.at(-1).id
                || options.collectorRecordFailure && row?.event === 'collector-failure') {
                throw Object.assign(new Error('controlled terminal ledger failure'), { code: 'EIO' });
            }
            return fs.appendFileSync(file, content, settings);
        } },
        '../execution-provenance.cjs': {
            requireBootstrapAdmission() { if (options.noAdmission) throw new Error('controlled bootstrap rejection'); },
            bootstrapOperation: () => operation, admitQualificationModules() {}, trustedGitExecutable: () => '/controlled/not-executed-git',
            gitEnvironment: () => ({ COMPONENT_GIT: 'fixed' }) },
        './configuration.cjs': selected,
        './implementation.cjs': { qualificationProvenance: () => provenance,
            selectedPlanProvenance: () => ({ sha256: 'a'.repeat(64) }), preparePinnedExecution,
            requirePinnedCliProbe() { if (options.probeInvalid) throw new Error('controlled CLI identity mismatch'); return { version: 'component-only-cli' }; },
            requirePinnedExecution(invocation) { if (options.executionInvalid) throw new Error('controlled runtime identity mismatch');
                assert(invocations.some(item => item.invocation === invocation)); return { componentOnly: true }; } },
        './load.cjs': {},
        '../../issue974/corpus-selection.cjs': { selectedCorpus: () => ({ file: corpusFile }) },
        '../../../../../src/tooling/bugbot_benchmark_runner': { async runBugbotBenchmarkAgent(corpus, agent, configuration) {
            assert.equal(corpus.cases.length, 1); assert.equal(configuration, selected.detector);
            await agent.query({ configuration, capability: 'findings', prompt: 'model-free component fixture' });
            return { predictions: { [corpus.cases[0].id]: [] } };
        } },
        '../../../../../src/tooling/bugbot_benchmark': {
            loadBugbotBenchmark: async () => ({ cases: options.shortCorpus ? cases.slice(1) : cases }),
            evaluateBugbotBenchmark(_corpus, bundle, gates) { evaluated++; assert.equal(gates.precision, selected.corpus.gates.precision);
                assert.equal(gates.maxConfidenceBrierScore, selected.corpus.gates.maxBrier);
                return { violations: options.scoreInvalid ? ['controlled scorer rejection'] : [], predictionCount: Object.keys(bundle.predictions).length }; } },
        '../../../../../src/infrastructure/composition/agent_capability_composition_root': {
            createFindingsQueryPort: ({ cli }) => ({ query: request => cli.execute(request) }) },
        '../../../../../src/data/repository/agent_cli_client': { AgentCliClient: ControlledClient },
        '../../../../../src/infrastructure/agents/agent_execution_planner': { AgentExecutionPlanner: class {} },
        '../../../../../src/infrastructure/bugbot/shadow/session.cjs': { codexInvocation: () => flags },
        '../../issue974/attempt-ledger.cjs': {
            createDurableRecorder(ledger) { return row => { records.push(row); fs.appendFileSync(ledger, JSON.stringify(row) + '\n'); }; },
            createRecordedCli({ createClient }) {
                const cli = createClient({}, value => preparations.push(value)); cli.attemptIds = ['component-attempt']; return cli;
            }, validateCompleteAttempts(rows, results, plan, artifacts) {
                attemptsValidated++; assert.equal(plan, selected); assert.equal(results.length, 1);
                assert(rows.some(row => row.event === 'case-slot')); assert(fs.statSync(artifacts).isDirectory());
                if (options.attemptsInvalid) throw new Error('controlled incomplete attempts');
            } },
        'node:os': { tmpdir: () => directory },
        'node:child_process': { execFileSync(executable, args, config) {
            gitInvocations++; assert.equal(executable, '/controlled/not-executed-git');
            assert.deepEqual(Array.from(args), ['init', '--quiet', '--template=']); assert.equal(config.env.COMPONENT_GIT, 'fixed');
            fs.mkdirSync(path.join(config.cwd, '.git')); if (options.workspaceChanged) fs.writeFileSync(path.join(config.cwd, 'unexpected'), 'controlled mutation');
        } },
    };
    const module = { exports: {} };
    vm.runInNewContext(source, { require(name) {
        if (Object.hasOwn(deps, name)) return deps[name];
        if (name.startsWith('node:')) return require(name);
        throw new Error('Unplanned worker component dependency: ' + name);
    }, module, __filename: file, __dirname: ev07, process: events, AbortController, JSON,
        performance, console: { log() {} } });
    return { selected, directory, destination, events, queries, preparations, invocations, records,
        run: flag => module.exports.run(destination, flag),
        decision: () => JSON.parse(fs.readFileSync(path.join(destination, 'corpus-score.json'))),
        rows: () => fs.readFileSync(path.join(destination, 'corpus.jsonl'), 'utf8').trim().split('\n').map(JSON.parse),
        counters: () => ({ gitInvocations, evaluated, attemptsValidated, cwdRestored: currentDirectory === directory }) };
}

test('ev974-C31 worker preflight admits planner flags without executing an agent port', async t => {
    const f = fixture(t); await f.run('--preflight');
    assert.equal(f.queries.length, 0); assert.equal(f.invocations.length, 1);
    assert.equal(fs.existsSync(f.invocations[0].invocation.runtimeDirectory), false);
    assert.equal(f.rows().at(-1).event, 'planner-preflight'); assert.equal(f.counters().evaluated, 0);
    assert.equal(f.counters().cwdRestored, true); assert.equal(f.events.listenerCount('SIGINT'), 0);
});

test('ev974-C31 historical worker route scores each synthetic case once and restores its owned workspace', async t => {
    const f = fixture(t, { concurrency: 2 }); await f.run();
    assert.equal(f.queries.length, 3); assert.equal(f.invocations.length, 4);
    assert.equal(f.decision().passed, true); assert.equal(f.decision().complete, true);
    assert.equal(f.decision().completed, 3); assert.equal(f.decision().githubWriteAttempts, 0);
    assert.equal(f.decision().workspaceUnchanged, true); assert.equal(f.counters().cwdRestored, true);
    assert(f.rows().filter(row => row.event === 'case').every(row => row.calls.length === 1));
    assert.equal(f.events.listenerCount('SIGINT'), 0); assert.equal(f.events.listenerCount('SIGTERM'), 0);
});

for (const collectorRecordFailure of [false, true]) test(
    'ev974-C31 final legacy case-ledger failure cannot pass even when collector recording fails=' + collectorRecordFailure, async t => {
        const f = fixture(t, { caseLedgerFailure: true, collectorRecordFailure }); await f.run();
        assert.equal(f.queries.length, 3);
        assert.equal(f.decision().complete, true, 'all in-memory predictions exist in this counterexample');
        assert.equal(f.decision().completed, 3);
        assert.equal(f.decision().passed, false, 'a missing durable terminal case cannot be a passing decision');
        assert.equal(f.rows().filter(row => row.event === 'case').length, 2);
        assert.equal(f.rows().at(-1).event, 'finish'); assert.equal(f.rows().at(-1).passed, false);
        assert.equal(f.counters().cwdRestored, true);
        assert.equal(f.events.listenerCount('SIGINT'), 0); assert.equal(f.events.listenerCount('SIGTERM'), 0);
    });

test('ev974-C31 contained worker selects only its assigned synthetic slot and records prepared invocation metadata', async t => {
    const f = fixture(t, { v2: true, index: 1 }); await f.run();
    assert.equal(f.queries.length, 1); assert.equal(f.counters().attemptsValidated, 1);
    const slots = f.rows().filter(row => row.event === 'case-slot'); assert.equal(slots.length, 1);
    assert.equal(slots[0].index, 1); assert.equal(slots[0].id, 'model-free-worker-1');
    assert.equal(f.decision().passed, true); assert.equal(f.decision().attemptsComplete, true);
    assert.equal(f.preparations.length, 1);
    assert.equal(f.preparations[0].qualificationInvestigation, true);
    assert.equal(f.preparations[0].schemaArtifactSha256, 'f'.repeat(64));
    assert.equal(f.rows().find(row => row.event === 'case').attemptIds[0], 'component-attempt');
});

test('ev974-C31 a contained worker does not invent absent schema/research metadata', async t => {
    const f = fixture(t, { v2: true, noSchema: true, research: false }); await f.run();
    assert.equal(f.preparations[0].qualificationInvestigation, false); assert.equal(f.preparations[0].schemaArtifactSha256, null);
});

for (const [name, options] of Object.entries({
    'bootstrap admission': { noAdmission: true }, 'CLI pin': { probeInvalid: true },
    'v2 live operation': { v2: true, missingOperation: true }, 'assigned slot identity': { v2: true, wrongSlot: true },
    'declared corpus count': { shortCorpus: true },
})) test('ev974-C31 worker rejects invalid ' + name + ' before any agent query', async t => {
    const f = fixture(t, options); await assert.rejects(f.run());
    assert.equal(f.queries.length, 0); assert.equal(f.counters().evaluated, 0);
});

for (const [key, value] of [['model', 'foreign'], ['modelProvider', 'foreign'], ['reasoningEffort', 'low'], ['sandbox', 'danger-full-access']]) {
    test('ev974-C31 worker rejects a planner ' + key + ' mismatch before any agent query', async t => {
        const f = fixture(t, { flags: { [key]: value } }); await assert.rejects(f.run());
        assert.equal(f.queries.length, 0); assert.equal(f.invocations.length, 1);
        assert.equal(fs.existsSync(f.invocations[0].invocation.runtimeDirectory), false);
        assert.equal(f.counters().cwdRestored, true); assert.equal(f.events.listenerCount('SIGINT'), 0);
    });
}

test('ev974-C31 worker rejects an unpinned execution and removes its prepared runtime directory', async t => {
    const f = fixture(t, { executionInvalid: true }); await assert.rejects(f.run());
    assert.equal(f.queries.length, 0); assert.equal(fs.existsSync(f.invocations[0].invocation.runtimeDirectory), false);
    assert.equal(f.counters().cwdRestored, true);
});

for (const [name, raw] of [['non-JSON response', '{invalid'], ['missing findings', '{}'], ['null response', 'null'],
    ['non-array findings', '{"findings":7}']]) test('ev974-C31 worker retains failed cases for ' + name + ' without synthetic success', async t => {
    const f = fixture(t, { raw }); await f.run();
    assert.equal(f.decision().passed, false); assert.equal(f.decision().completed, 0);
    assert(f.rows().filter(row => row.event === 'case').every(row => row.status === 'failed'));
    assert.equal(f.rows().at(-1).passed, false);
});

test('ev974-C31 worker accepts structured findings as well as a parsed transport response', async t => {
    const f = fixture(t, { raw: { findings: [] } }); await f.run(); assert.equal(f.decision().passed, true);
});

for (const [name, failure, expected] of [
    ['causal category', { cause: { category: 'controlled-category' }, code: 'ignored', name: 'ignored' }, 'controlled-category'],
    ['provider code', { code: 'CONTROLLED_CODE', name: 'ignored' }, 'CONTROLLED_CODE'],
    ['error name', { name: 'ControlledError' }, 'ControlledError'],
]) test('ev974-C31 worker retains a bounded failure selected by ' + name, async t => {
    const f = fixture(t, { failure }); await f.run();
    assert(f.rows().filter(row => row.event === 'case').every(row => row.failure === expected));
    assert.equal(f.decision().complete, false);
});

for (const signal of ['SIGINT', 'SIGTERM']) test('ev974-C31 worker ' + signal + ' records interruption and leaves later cases unstarted', async t => {
    const f = fixture(t, { signal }); await f.run();
    assert.equal(f.queries.length, 1); const cases = f.rows().filter(row => row.event === 'case');
    assert.equal(cases[0].status, 'interrupted'); assert.equal(cases.filter(row => row.status === 'not-started').length, 2);
    assert.equal(f.decision().passed, false); assert.equal(f.counters().cwdRestored, true);
    assert.equal(f.events.listenerCount(signal), 0);
});

test('ev974-C31 contained worker cancellation uses its operation signal and records no later model-free query', async t => {
    const f = fixture(t, { v2: true, signal: 'SIGINT' }); await f.run();
    assert.equal(f.queries.length, 1); assert.equal(f.rows().find(row => row.event === 'case').status, 'interrupted');
    assert.equal(f.decision().passed, false); assert.equal(f.decision().attemptsComplete, false);
});

test('ev974-C31 complete predictions cannot override an independent scorer rejection', async t => {
    const f = fixture(t, { scoreInvalid: true }); await f.run();
    assert.equal(f.decision().complete, true); assert.equal(f.decision().passed, false);
});

test('ev974-C31 complete worker predictions cannot override missing attempt admission', async t => {
    const f = fixture(t, { v2: true, attemptsInvalid: true }); await f.run();
    assert.equal(f.decision().complete, true); assert.equal(f.decision().attemptsComplete, false); assert.equal(f.decision().passed, false);
    assert.equal(f.rows().find(row => row.event === 'attempt-admission').fullReview, 'unstarted');
});

test('ev974-C31 worker reports a mutated workspace truthfully to the independent outer collector', async t => {
    const f = fixture(t, { v2: true, workspaceChanged: true }); await f.run();
    assert.equal(f.decision().workspaceUnchanged, false); assert.equal(f.rows().at(-1).workspaceUnchanged, false);
});
