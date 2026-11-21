'use strict';

// Model-free native controls only. This executable never grants an SDK scope,
// selects a model endpoint, or receives model/GitHub credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const cases = Object.freeze(['ev974-C32', 'ev974-C33', 'ev974-C34', 'ev974-C35']);
const root = path.resolve(__dirname, '../../../..');
const fixtureFile = '/sdk/quality/bugbot/evidence/issue974/containment-native-fixture.cjs';
const fixtureCliBytes = '#!/usr/local/bin/node\nrequire(' + JSON.stringify(fixtureFile) + ').fixtureCli();\n';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function write(file, value) {
    const fd = fs.openSync(file, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
}

function requireNativeWorker() {
    assert.equal(process.platform, 'linux'); assert(process.getuid() > 0);
    const input = JSON.parse(fs.readFileSync('/qualification-input/invocation.json', 'utf8'));
    assert.equal(input.mode, 'native-control'); assert.equal(input.identity.purpose, 'native-control');
    assert(cases.includes(input.slot.caseId));
    return input;
}

function processState(pid) {
    assert(Number.isSafeInteger(pid) && pid > 1);
    const raw = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
    return { pid, state: fields[0], ppid: Number(fields[1]), group: Number(fields[2]), session: Number(fields[3]) };
}

async function untilNative(predicate, interrupted = () => false) {
    // Only the fixed, credential-free subprocess fixtures use this readiness
    // bound. Corpus/review dispatch, models and research never enter this path.
    const end = Date.now() + 180_000;
    while (!predicate()) {
        if (interrupted()) throw new Error('Native fixture operation ended before readiness.');
        if (Date.now() >= end) throw new Error('Model-free native fixture did not become ready.');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

function descendant(role) {
    const input = requireNativeWorker(), directory = '/qualification-output/native';
    assert(['ignored', 'inherited', 'intermediate'].includes(role));
    if (role === 'intermediate') {
        const child = spawn(process.execPath, [fixtureFile, '--native-descendant', 'inherited'], {
            detached: true, stdio: ['ignore', process.stdout, process.stderr],
        });
        child.once('error', () => process.exit(1)); child.once('spawn', () => process.exit(0));
        return;
    }
    process.on('SIGTERM', () => undefined);
    write(path.join(directory, 'descendant.json'), { caseId: input.slot.caseId, ...processState(process.pid) });
    setInterval(() => undefined, 1000);
}

function fixtureCli() {
    if (process.argv.slice(2).includes('--version')) {
        console.log('codex-cli 0.169.1 model-free-native-fixture'); return;
    }
    const input = requireNativeWorker();
    const prompt = fs.readFileSync(0, 'utf8');
    assert.equal(prompt, 'Model-free native SDK containment control ' + input.slot.caseId);
    const inherited = input.slot.caseId === 'ev974-C33';
    const child = spawn(process.execPath, [fixtureFile, '--native-descendant', inherited ? 'intermediate' : 'ignored'], {
        detached: true, stdio: inherited ? ['ignore', process.stdout, process.stderr] : 'ignore',
    });
    child.once('error', () => process.exit(1));
    child.once('spawn', () => {
        write('/qualification-output/native/leader.json', processState(process.pid));
        if (input.slot.caseId === 'ev974-C34') { setInterval(() => undefined, 1000); return; }
        // The ordinary Codex findings plan uses its plain-text protocol with
        // native/local JSON schema validation, not shadow-session JSON events.
        console.log('{"ok":true}');
        process.exit(0);
    });
}

async function runWorker(output, plan, operation) {
    assert.equal(output, '/qualification-output/native'); fs.mkdirSync(output, { mode: 0o700 });
    const { requirePinnedCliProbe } = require('../issue-950/ev07-shadow/implementation.cjs');
    const realCli = requirePinnedCliProbe(plan.runtime);
    const fixture = path.join(output, 'fixture-codex');
    assert.equal(hash(fixtureCliBytes), plan.nativeControl.fixtureCliSha256);
    fs.writeFileSync(fixture, fixtureCliBytes, { flag: 'wx', mode: 0o700 });
    require('../issue-950/ev07-shadow/load.cjs');
    const { AgentExecutionPlanner } = require(path.join(root, 'src/infrastructure/agents/agent_execution_planner'));
    const { runAgentCli } = require(path.join(root, 'src/data/repository/agent_cli_execution'));
    const configuration = { ...plan.detector, executable: fixture };
    const prompt = 'Model-free native SDK containment control ' + operation.slot.caseId;
    const prepared = new AgentExecutionPlanner().prepareQualificationInvestigation({ configuration,
        capability: 'findings', prompt, cwd: root, signal: operation.signal, timeoutMs: 50,
        outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
    });
    let settled = false, result;
    const executing = runAgentCli(prepared, prompt, operation.signal).then(value => { settled = true; result = value; return value; });
    // Attach a handler before readiness so an actual SDK failure stays owned.
    void executing.catch(() => undefined);
    const descendantFile = path.join(output, 'descendant.json');
    await untilNative(() => fs.existsSync(descendantFile));
    const pid = JSON.parse(fs.readFileSync(descendantFile, 'utf8')).pid;
    await untilNative(() => processState(pid).ppid === 1);
    const state = processState(pid); assert.notEqual(state.state, 'Z'); assert.equal(state.session, pid);
    if (['ev974-C32', 'ev974-C35'].includes(operation.slot.caseId)) await executing;
    else assert.equal(settled, false, 'inherited pipes or live SDK execution must still be pending');
    write(path.join(output, 'sdk-ready.json'), { schemaVersion: 1, caseId: operation.slot.caseId,
        scopeId: operation.scopeId, identity: operation.identity, realCli, fixtureCliSha256: hash(fs.readFileSync(fixture)),
        preparedVersion: prepared.runtimeContract.version, qualificationInvestigation: prepared.qualificationInvestigation,
        sdkSettled: settled, descendant: state, result: result ?? null, modelCalls: 0 });
    if (operation.slot.caseId === 'ev974-C35') return { status: 'completed' };
    // C32 is deliberately quiet after its ordinary executor settled. C33 is
    // blocked by inherited pipes. C34 is waiting when its real outer owner dies.
    if (operation.slot.caseId === 'ev974-C32') await new Promise(() => undefined);
    else await executing;
    throw new Error('An interrupted native control cannot become completed research.');
}

async function run(output) {
    const provenance = require('../issue-950/execution-provenance.cjs');
    provenance.requireBootstrapAdmission(root);
    const plan = require('../issue-950/ev07-shadow/configuration.cjs');
    assert.equal(plan.purpose, 'native-control');
    assert.deepEqual(Object.keys(plan.nativeControl).sort(), ['cases', 'fixtureCliSha256', 'harnessSha256', 'schemaVersion', 'selectedCase']);
    assert.equal(plan.nativeControl.schemaVersion, 1); assert.deepEqual(plan.nativeControl.cases, cases);
    assert(cases.includes(plan.nativeControl.selectedCase));
    assert.equal(plan.nativeControl.fixtureCliSha256, hash(fixtureCliBytes));
    assert.match(plan.nativeControl.harnessSha256, /^[a-f0-9]{64}$/u);
    const operation = provenance.bootstrapOperation(root);
    if (operation) return runWorker(output, plan, operation);
    output = path.resolve(output); fs.mkdirSync(output, { mode: 0o700 });
    const record = require('./attempt-ledger.cjs').createDurableRecorder(path.join(output, 'native.jsonl'));
    const controls = new Set(), abort = () => { for (const control of controls) control.abort(); };
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    record({ event: 'native-start', caseId: plan.nativeControl.selectedCase, modelCalls: 0 });
    try {
        async function execute(name, cancelAtReady) {
            const cancel = new AbortController(); controls.add(cancel);
            const directory = path.join(output, name); let ended = false;
            const running = require('./operation-containment.cjs').runContainedOperation({ root, plan, mode: 'native-control',
                slot: { caseId: plan.nativeControl.selectedCase }, outputDirectory: directory, record, signal: cancel.signal });
            void running.then(() => { ended = true; }, () => { ended = true; });
            try {
                if (cancelAtReady) {
                    const ready = path.join(directory, 'native/sdk-ready.json');
                    await untilNative(() => fs.existsSync(ready), () => ended);
                    const evidence = JSON.parse(fs.readFileSync(ready, 'utf8'));
                    assert.equal(evidence.caseId, plan.nativeControl.selectedCase); assert.equal(evidence.modelCalls, 0);
                    record({ event: 'native-ready', name, evidence }); cancel.abort();
                }
                const terminal = await running;
                assert.equal(terminal.namespaceInitStopped, true);
                if (cancelAtReady && plan.nativeControl.selectedCase !== 'ev974-C35') assert.equal(terminal.interrupted, true);
                else if (cancelAtReady) {
                    assert(terminal.interrupted || terminal.exitCode === 0);
                    record({ event: 'native-race-outcome', interrupted: terminal.interrupted, exitCode: terminal.exitCode });
                }
                else assert.equal(terminal.exitCode, 0);
                return terminal;
            } catch (error) {
                cancel.abort(); await running.catch(() => undefined); throw error;
            } finally { controls.delete(cancel); }
        }
        const id = plan.nativeControl.selectedCase;
        if (id === 'ev974-C35') {
            await execute('completed', false);
            await execute('cancellation-race', true);
        } else await execute('operation', id !== 'ev974-C34');
        record({ event: 'native-finish', caseId: id, status: 'completed', modelCalls: 0 });
        return { status: 'completed' };
    } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}

module.exports = { run, fixtureCli, fixtureCliSha256: hash(fixtureCliBytes) };
if (require.main === module) {
    assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--native-descendant');
    descendant(process.argv[3]);
}
