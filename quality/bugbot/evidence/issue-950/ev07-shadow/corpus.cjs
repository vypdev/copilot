'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { trustedGitExecutable, gitEnvironment } = require('../execution-provenance.cjs');
const { tmpdir } = require('node:os');
const { qualificationProvenance, requirePinnedRuntime, requirePinnedExecution, selectedPlanProvenance } = require('./implementation.cjs');

const plan = require('./configuration.cjs');
const root = path.resolve(__dirname, '../../../../..');
const hash = input => createHash('sha256').update(input).digest('hex');

async function run(destination, preflight = false) {
    const provenance = qualificationProvenance(plan);
    const implementation = provenance.implementation;
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
    const corpusFile = path.join(root, 'quality/bugbot/corpus.v1.json');
    assert.equal(hash(fs.readFileSync(corpusFile)), plan.corpus.sha256);
    const corpus = await loadBugbotBenchmark(corpusFile);
    assert.equal(corpus.cases.length, plan.corpus.cases);
    const configuration = plan.detector;
    const preregistration = selectedPlanProvenance();
    const planner = new AgentExecutionPlanner();
    const cli = execFileSync('codex', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    requirePinnedRuntime(cli);
    fs.mkdirSync(destination);
    const ledger = path.join(destination, 'corpus.jsonl');
    const record = row => fs.appendFileSync(ledger, JSON.stringify(row) + '\n', { mode: 0o600 });
    record({ event: 'start', at: new Date().toISOString(), cli, configuration,
        plan: preregistration.sha256, preregistration, runner: hash(fs.readFileSync(__filename)),
        implementation, provenance, corpus: plan.corpus.sha256, gitHubMutationPorts: 0 });
    const cwd = fs.mkdtempSync(path.join(tmpdir(), 'copilot-ev07-corpus-'));
    const oldCwd = process.cwd();
    const cancel = new AbortController();
    const abort = () => cancel.abort();
    process.once('SIGINT', abort);
    process.once('SIGTERM', abort);
    const results = new Map();
    function prepare(request, calls, runtimeProofs) {
        const invocation = planner.prepare(request);
        try {
            const proof = requirePinnedExecution(invocation);
            const flags = codexInvocation(invocation.argv);
            assert.equal(flags.model, configuration.model);
            assert.equal(flags.modelProvider, configuration.modelProvider);
            assert.equal(flags.reasoningEffort, configuration.effort);
            assert.equal(flags.sandbox, 'read-only');
            calls.push(flags);
            runtimeProofs.push(proof);
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
        await canary.query({ agentId: 'qualification-preflight', configuration, prompt: 'qualification planner preflight' });
        assert.equal(flags.length, 1);
        record({ event: 'planner-preflight', flags, runtimeProofs });
        if (preflight) return;
        async function worker() {
            while (next < corpus.cases.length && !cancel.signal.aborted) {
                const index = next++;
                const testCase = corpus.cases[index];
                const start = performance.now();
                const calls = [], runtimeProofs = [];
                const agent = createFindingsQueryPort({ cli: new AgentCliClient({
                    prepare: request => prepare(request, calls, runtimeProofs),
                }) });
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
                const row = { event: 'case', index, id: testCase.id, wallMs: Math.round(performance.now() - start), calls, runtimeProofs, ...outcome };
                results.set(testCase.id, row);
                record(row);
            }
        }
        await Promise.all(Array.from({ length: plan.corpus.concurrency }, () => worker()));
        const predictions = {};
        for (const [index, testCase] of corpus.cases.entries()) {
            const row = results.get(testCase.id);
            if (row?.status === 'completed') predictions[testCase.id] = row.predictions;
            if (!row) record({ event: 'case', index, id: testCase.id, status: 'not-started' });
        }
        const bundle = { schemaVersion: 1, predictions };
        const score = evaluateBugbotBenchmark(corpus, bundle);
        const complete = Object.keys(predictions).length === corpus.cases.length;
        const decision = { complete, completed: Object.keys(predictions).length, passed: complete && score.violations.length === 0,
            githubWriteAttempts: 0, workspaceUnchanged: fs.readdirSync(cwd).every(entry => entry === '.git'), score };
        fs.writeFileSync(path.join(destination, 'predictions.json'), JSON.stringify(bundle, null, 2) + '\n');
        fs.writeFileSync(path.join(destination, 'corpus-score.json'), JSON.stringify(decision, null, 2) + '\n');
        record({ event: 'finish', complete, passed: decision.passed, githubWriteAttempts: 0, workspaceUnchanged: decision.workspaceUnchanged });
        console.log(JSON.stringify({ complete, completed: decision.completed, passed: decision.passed, violations: score.violations }));
    } finally {
        process.chdir(oldCwd);
        process.removeListener('SIGINT', abort);
        process.removeListener('SIGTERM', abort);
        fs.rmSync(cwd, { force: true, recursive: true });
    }
}

run(process.argv[2], process.argv[3] === '--preflight').catch(error => { console.error(error.code ?? error.name, error.message); process.exitCode = 1; });
