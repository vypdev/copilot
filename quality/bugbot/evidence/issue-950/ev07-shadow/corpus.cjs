'use strict';

if (require.main === module) throw new Error('Use the independently reviewed immutable bootstrap; direct qualification runners are unsupported.');

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { trustedGitExecutable, gitEnvironment, admitQualificationModules, bootstrapOperation } = require('../execution-provenance.cjs');
const { tmpdir } = require('node:os');
const { qualificationProvenance, requirePinnedCliProbe, requirePinnedExecution, preparePinnedExecution, selectedPlanProvenance, expectedQualificationContext } = require('./implementation.cjs');

const plan = require('./configuration.cjs');
const root = path.resolve(__dirname, '../../../../..');
const hash = input => createHash('sha256').update(input).digest('hex');

async function run(destination, preflight = false) {
    require('../execution-provenance.cjs').requireBootstrapAdmission(root);
    const operation = bootstrapOperation(root);
    if (plan.containment && !operation) return runContainedCorpus(destination, preflight);
    assert(plan.schemaVersion !== 2 || operation, 'v2 research requires its contained live operation before CLI probes');
    const provenance = qualificationProvenance(plan);
    const implementation = provenance.implementation;
    admitQualificationModules(root);
    const cliProbe = requirePinnedCliProbe(plan.runtime);
    require('./load.cjs');

    const { runBugbotBenchmarkAgent } = require('../../../../../src/tooling/bugbot_benchmark_runner');
    const { evaluateBugbotBenchmark, loadBugbotBenchmark } = require('../../../../../src/tooling/bugbot_benchmark');
    const { createFindingsQueryPort } = require('../../../../../src/infrastructure/composition/agent_capability_composition_root');
    const { AgentCliClient } = require('../../../../../src/data/repository/agent_cli_client');
    const { AgentExecutionPlanner } = require('../../../../../src/infrastructure/agents/agent_execution_planner');
    const { codexInvocation } = require('../../../../../src/infrastructure/bugbot/shadow/session.cjs');

    assert.equal(hash(fs.readFileSync(__filename)), plan.inspectedArtifacts?.['corpus.cjs'],
        'corpus runner differs from the preregistered implementation');
    assert(destination, 'usage: node corpus.cjs <new output directory>');
    destination = path.resolve(destination);
    const v2 = plan.schemaVersion === 2;
    const corpusFile = v2 ? require('../../issue974/corpus-selection.cjs').selectedCorpus(plan, root).file
        : path.join(root, 'quality/bugbot/corpus.v1.json');
    assert.equal(hash(fs.readFileSync(corpusFile)), plan.corpus.sha256);
    const corpus = await loadBugbotBenchmark(corpusFile);
    assert.equal(corpus.cases.length, plan.corpus.cases);
    const selectedCases = operation ? [corpus.cases[operation.slot.index]] : corpus.cases;
    if (operation) assert.equal(selectedCases[0]?.id, operation.slot.caseId);
    const configuration = plan.detector;
    const preregistration = selectedPlanProvenance();
    const planner = new AgentExecutionPlanner();
    const cli = cliProbe.version;
    fs.mkdirSync(destination);
    const ledger = path.join(destination, 'corpus.jsonl');
    const record = v2 ? require('../../issue974/attempt-ledger.cjs').createDurableRecorder(ledger)
        : row => fs.appendFileSync(ledger, JSON.stringify(row) + '\n', { mode: 0o600 });
    const artifactDirectory = path.join(destination, 'attempts');
    if (v2) fs.mkdirSync(artifactDirectory, { mode: 0o700 });
    record({ event: 'start', at: new Date().toISOString(), cli, cliProbe, configuration,
        plan: preregistration.sha256, preregistration, runner: hash(fs.readFileSync(__filename)),
        implementation, provenance, corpus: plan.corpus.sha256, gitHubMutationPorts: 0 });
    if (v2) for (const [offset, testCase] of selectedCases.entries()) {
        const index = operation ? operation.slot.index : offset;
        record({ event: 'case-slot', index, id: testCase.id, status: 'not-started' });
    }
    const cwd = fs.mkdtempSync(path.join(tmpdir(), 'copilot-ev07-corpus-'));
    const oldCwd = process.cwd();
    const cancel = operation ? { signal: operation.signal, abort: operation.abort } : new AbortController();
    const abort = () => cancel.abort();
    process.once('SIGINT', abort);
    process.once('SIGTERM', abort);
    const results = new Map();
    function prepare(request, calls, runtimeProofs, prepared = () => undefined) {
        const invocation = preparePinnedExecution(planner, request, plan.runtime);
        try {
            const proof = requirePinnedExecution(invocation);
            const flags = codexInvocation(invocation.argv);
            assert.equal(flags.model, configuration.model);
            assert.equal(flags.modelProvider, configuration.modelProvider);
            assert.equal(flags.reasoningEffort, configuration.effort);
            assert.equal(flags.sandbox, 'read-only');
            calls.push(flags);
            runtimeProofs.push(proof);
            prepared({ flags, runtimeProof: proof, runtimeContract: invocation.runtimeContract,
                workspaceMode: invocation.workspaceMode, output: invocation.output,
                qualificationInvestigation: invocation.qualificationInvestigation === true,
                schemaArtifactSha256: invocation.artifacts.find(item => item.purpose === 'output-schema')?.sha256 ?? null });
            return invocation;
        } catch (error) {
            fs.rmSync(invocation.runtimeDirectory, { recursive: true, force: true });
            throw error;
        }
    }
    let next = 0;
    try {
        execFileSync(trustedGitExecutable(), ['init', '--quiet', '--template='], { cwd, env: gitEnvironment() });
        process.chdir(cwd);
        const flags = [], runtimeProofs = [];
        const canary = createFindingsQueryPort({ cli: { async execute(request) {
            const admission = prepare(request, flags, runtimeProofs);
            fs.rmSync(admission.runtimeDirectory, { recursive: true, force: true });
            return 'qualification planner preflight';
        } } });
        await canary.query({ agentId: 'qualification-preflight', configuration, prompt: 'qualification planner preflight', signal: cancel.signal });
        assert.equal(flags.length, 1);
        record({ event: 'planner-preflight', flags, runtimeProofs });
        if (preflight) return;
        async function worker() {
            while (next < selectedCases.length && !cancel.signal.aborted) {
                const offset = next++, index = operation ? operation.slot.index : offset;
                const testCase = selectedCases[offset];
                const start = performance.now();
                const calls = [], runtimeProofs = [];
                const cli = v2 ? require('../../issue974/attempt-ledger.cjs').createRecordedCli({
                    caseId: testCase.id, record, artifactDirectory, cancellation: cancel,
                    createClient: (observer, prepared) => new AgentCliClient({
                        prepare: request => prepare(request, calls, runtimeProofs, prepared),
                    }, observer),
                }) : new AgentCliClient({ prepare: request => prepare(request, calls, runtimeProofs) });
                const agent = createFindingsQueryPort({ cli });
                let outcome;
                try {
                    const result = await runBugbotBenchmarkAgent({ ...corpus, cases: [testCase] }, {
                        async query(request) {
                            const raw = await agent.query({ ...request, signal: cancel.signal });
                            const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
                            assert(value && Array.isArray(value.findings), 'missing model findings');
                            return value;
                        },
                    }, configuration);
                    outcome = { status: 'completed', predictions: result.predictions[testCase.id] };
                } catch (error) {
                    const failure = error.cause?.category ?? error.code ?? error.name;
                    outcome = { status: cancel.signal.aborted ? 'interrupted' : 'failed', failure };
                }
                const row = { event: 'case', index, id: testCase.id, wallMs: Math.round(performance.now() - start), calls, runtimeProofs,
                    ...(v2 ? { attemptIds: cli.attemptIds } : {}), ...outcome };
                results.set(testCase.id, row);
                record(row);
            }
        }
        await Promise.allSettled(Array.from({ length: plan.corpus.concurrency }, () => worker().catch(error => {
            cancel.abort();
            record({ event: 'collector-failure', reason: error?.code ?? error?.name ?? 'unknown' });
        })));
        const predictions = {};
        for (const [offset, testCase] of selectedCases.entries()) {
            const index = operation ? operation.slot.index : offset;
            const row = results.get(testCase.id);
            if (row?.status === 'completed') predictions[testCase.id] = row.predictions;
            if (!row) record({ event: 'case', index, id: testCase.id, status: 'not-started' });
        }
        const bundle = { schemaVersion: 1, predictions };
        const gates = plan.corpus.gates;
        const score = evaluateBugbotBenchmark(corpus, bundle, { precision: gates.precision, recall: gates.recall,
            f1: gates.f1, locationAccuracy: gates.exactLocation, severityAccuracy: gates.severity,
            categoryAccuracy: gates.category, maxConfidenceBrierScore: gates.maxBrier });
        const complete = Object.keys(predictions).length === selectedCases.length;
        let attemptsComplete = !v2;
        if (v2 && complete) {
            const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(line => JSON.parse(line));
            try {
                require('../../issue974/attempt-ledger.cjs').validateCompleteAttempts(rows, [...results.values()], plan, artifactDirectory);
                attemptsComplete = true;
            } catch { record({ event: 'attempt-admission', status: 'incomplete', fullReview: 'unstarted' }); }
        }
        const decision = { complete, completed: Object.keys(predictions).length, passed: complete && attemptsComplete && score.violations.length === 0,
            ...(v2 ? { attemptsComplete } : {}),
            githubWriteAttempts: 0, workspaceUnchanged: fs.readdirSync(cwd).every(entry => entry === '.git'), score };
        fs.writeFileSync(path.join(destination, 'predictions.json'), JSON.stringify(bundle, null, 2) + '\n');
        fs.writeFileSync(path.join(destination, 'corpus-score.json'), JSON.stringify(decision, null, 2) + '\n');
        record({ event: 'finish', complete, passed: decision.passed, githubWriteAttempts: 0, workspaceUnchanged: decision.workspaceUnchanged });
        console.log(JSON.stringify({ complete, completed: decision.completed, passed: decision.passed, violations: score.violations }));
    } finally {
        process.chdir(oldCwd);
        process.removeListener('SIGINT', abort);
        process.removeListener('SIGTERM', abort);
        // The contained operation's workspace belongs to its namespace. The
        // host confirms PID1 stopped before removing the owned container.
        if (!operation) fs.rmSync(cwd, { force: true, recursive: true });
    }
}

function readWorkerLedger(file) {
    const rows = [];
    if (!fs.existsSync(file)) return { rows, complete: false };
    const bytes = fs.readFileSync(file, 'utf8');
    for (const line of bytes.split('\n').filter(Boolean)) {
        try { rows.push(JSON.parse(line)); } catch { return { rows, complete: false }; }
    }
    return { rows, complete: bytes.endsWith('\n') };
}

async function runContainedCorpus(destination, preflight) {
    const provenance = qualificationProvenance(plan), preregistration = selectedPlanProvenance();
    require('./load.cjs');
    admitQualificationModules(root);
    const { loadBugbotBenchmark, evaluateBugbotBenchmark } = require('../../../../../src/tooling/bugbot_benchmark');
    const { createDurableRecorder, validateCompleteAttempts } = require('../../issue974/attempt-ledger.cjs');
    const { runContainedOperation } = require('../../issue974/operation-containment.cjs');
    const { requireCompleteQualificationOperations } = require('../../../../../src/application/policies/qualification_operation_scope_policy');
    const corpus = await loadBugbotBenchmark(require('../../issue974/corpus-selection.cjs').selectedCorpus(plan, root).file);
    assert.equal(corpus.cases.length, 174);
    destination = path.resolve(destination); fs.mkdirSync(destination, { mode: 0o700 });
    const operations = path.join(destination, 'operations'), artifacts = path.join(destination, 'attempts');
    fs.mkdirSync(operations, { mode: 0o700 }); fs.mkdirSync(artifacts, { mode: 0o700 });
    const ledger = path.join(destination, 'corpus.jsonl'), record = createDurableRecorder(ledger);
    const cancel = new AbortController(), abort = () => cancel.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    const results = new Map();
    for (const [index, item] of corpus.cases.entries()) record({ event: 'case-slot', index, id: item.id, status: 'not-started' });
    try {
        const first = corpus.cases[0], preflightDirectory = path.join(operations, 'preflight');
        const probe = await runContainedOperation({ root, plan, mode: 'corpus', slot: { index: 0, caseId: first.id },
            outputDirectory: preflightDirectory, record, signal: cancel.signal, preflight: true });
        assert.equal(probe.exitCode, 0); assert.equal(probe.interrupted, false);
        const probeRows = readWorkerLedger(path.join(preflightDirectory, 'corpus-v3/corpus.jsonl'));
        assert(probeRows.complete && !probeRows.rows.some(row => /^attempt-/u.test(row.event)), 'preflight must start zero model calls');
        const actual = probeRows.rows.find(row => row.event === 'start');
        assert(actual && probeRows.rows.some(row => row.event === 'planner-preflight'));
        assert.deepEqual(actual.provenance, expectedQualificationContext(provenance, plan, 'worker'));
        if (preflight) {
            record({ event: 'preflight-finish', modelCalls: 0, fullReview: 'unstarted', runtime: actual.provenance.runtime, cliProbe: actual.cliProbe });
            return;
        }
        record({ event: 'start', at: new Date().toISOString(), cli: actual.cli, cliProbe: actual.cliProbe,
            configuration: plan.detector, plan: preregistration.sha256, preregistration,
            runner: hash(fs.readFileSync(__filename)), implementation: plan.implementation,
            provenance, corpus: plan.corpus.sha256, gitHubMutationPorts: 0, preflightScope: probe });
        let next = 0;
        async function worker() {
            while (next < corpus.cases.length && !cancel.signal.aborted) {
                const index = next++, item = corpus.cases[index];
                const output = path.join(operations, hash(item.id));
                record({ event: 'case-dispatch', index, id: item.id });
                let terminal;
                try {
                    terminal = await runContainedOperation({ root, plan, mode: 'corpus', slot: { index, caseId: item.id },
                        outputDirectory: output, record, signal: cancel.signal });
                } catch { cancel.abort(); /* Keep actual prefixes/unknown scope; stop further dispatch without replay. */ }
                const inner = path.join(output, 'corpus-v3'), read = readWorkerLedger(path.join(inner, 'corpus.jsonl'));
                for (const row of read.rows.filter(row => /^attempt-/u.test(row.event))) record(row);
                const attemptDirectory = path.join(inner, 'attempts');
                if (fs.existsSync(attemptDirectory)) for (const name of fs.readdirSync(attemptDirectory)) {
                    assert(/^[a-f0-9]{24}-[1-9][0-9]*\.(?:request\.json|response\.txt)$/u.test(name));
                    const source = path.join(attemptDirectory, name); assert(fs.lstatSync(source).isFile());
                    fs.copyFileSync(source, path.join(artifacts, name), fs.constants.COPYFILE_EXCL);
                    fs.chmodSync(path.join(artifacts, name), 0o600);
                }
                const candidates = read.rows.filter(row => row.event === 'case');
                assert(candidates.length <= 1 && candidates.every(row => row.index === index && row.id === item.id));
                const row = candidates[0] ?? { event: 'case', index, id: item.id, calls: [], runtimeProofs: [], attemptIds: [] };
                const finish = read.rows.find(row => row.event === 'finish');
                const workerProvenance = read.rows.find(row => row.event === 'start')?.provenance ?? null;
                let sourceIntact = false;
                try { assert.deepEqual(workerProvenance, expectedQualificationContext(provenance, plan, 'worker')); sourceIntact = true; }
                catch { cancel.abort(); }
                const complete = terminal?.exitCode === 0 && !terminal.interrupted && read.complete && sourceIntact
                    && row.status === 'completed' && finish?.workspaceUnchanged === true;
                const retained = { ...row, status: complete ? 'completed' : cancel.signal.aborted || terminal?.interrupted ? 'interrupted' : 'failed',
                    workspaceUnchanged: finish?.workspaceUnchanged === true,
                    workerProvenance,
                    scopeId: terminal?.scopeId ?? null, namespaceInitStopped: terminal?.namespaceInitStopped === true };
                record(retained); results.set(item.id, retained);
            }
        }
        let collectorFailed = false;
        await Promise.allSettled(Array.from({ length: plan.corpus.concurrency }, () => worker().catch(error => {
            collectorFailed = true;
            cancel.abort();
            record({ event: 'collector-failure', reason: error?.code ?? error?.name ?? 'unknown' });
        })));
        const predictions = {};
        for (const [index, item] of corpus.cases.entries()) {
            const row = results.get(item.id);
            if (row?.status === 'completed') predictions[item.id] = row.predictions;
            if (!row) {
                const dispatched = readWorkerLedger(ledger).rows.some(event => event.event === 'case-dispatch' && event.id === item.id);
                record({ event: 'case', index, id: item.id, status: dispatched ? 'missing-terminal' : 'not-started' });
            }
        }
        const rows = readWorkerLedger(ledger).rows, bundle = { schemaVersion: 1, predictions }, gates = plan.corpus.gates;
        const score = evaluateBugbotBenchmark(corpus, bundle, { precision: gates.precision, recall: gates.recall, f1: gates.f1,
            locationAccuracy: gates.exactLocation, severityAccuracy: gates.severity, categoryAccuracy: gates.category, maxConfidenceBrierScore: gates.maxBrier });
        const complete = Object.keys(predictions).length === 174;
        let attemptsComplete = false, containmentComplete = false;
        try { validateCompleteAttempts(rows, [...results.values()], plan, artifacts); attemptsComplete = true; } catch { /* Retained incomplete evidence. */ }
        try {
            requireCompleteQualificationOperations(corpus.cases.map(item => ({ operationId: 'corpus:' + item.id, purpose: 'corpus-case' })),
                containedOperationRecords(rows), { planSha256: preregistration.sha256, implementation: plan.implementation, imageSha256: plan.containment.image.slice(7) });
            containmentComplete = true;
        } catch { /* A missing stop or unknown namespace cannot admit phase42. */ }
        const workspaceUnchanged = results.size === 174 && [...results.values()].every(row => row.workspaceUnchanged);
        const decision = { complete, completed: Object.keys(predictions).length, attemptsComplete, containmentComplete,
            passed: !collectorFailed && complete && attemptsComplete && containmentComplete && workspaceUnchanged && score.violations.length === 0,
            githubWriteAttempts: 0, workspaceUnchanged, score };
        fs.writeFileSync(path.join(destination, 'predictions.json'), JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
        fs.writeFileSync(path.join(destination, 'corpus-score.json'), JSON.stringify(decision, null, 2) + '\n', { mode: 0o600 });
        record({ event: 'finish', complete, passed: decision.passed, githubWriteAttempts: 0, workspaceUnchanged });
        return { status: decision.passed ? 'completed' : 'failed' };
    } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}

function containedOperationRecords(rows) {
    return rows.filter(row => !row.preflight && ['operation-start', 'operation-stopped', 'operation-incomplete'].includes(row.event)).map(row =>
        row.event === 'operation-start' ? { event: 'start', identity: row.identity, scopeId: row.scopeId }
            : { event: 'stopped', identity: row.identity, scopeId: row.scopeId, namespaceInitStopped: row.namespaceInitStopped ?? row.stoppedConfirmed,
                outcome: row.event === 'operation-incomplete'
                    ? row.reason === 'explicit-cancellation' ? 'interrupted' : 'failed'
                    : row.interrupted ? 'interrupted' : row.exitCode === 0 ? 'completed' : 'failed' });
}

module.exports = { run: (destination, flag) => run(destination, flag === '--preflight'), containedOperationRecords };
