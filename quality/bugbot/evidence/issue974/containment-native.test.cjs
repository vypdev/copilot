'use strict';

// Explicit native command, separate from the 239 deterministic Node controls.
// Missing committed plans/actual Engine capability fail; nothing is skipped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { requireProfile } = require('./operation-containment.cjs');
const { trustedGitExecutable, gitEnvironment, pinnedGit } = require('../issue-950/execution-provenance.cjs');
const ids = ['ev974-C32', 'ev974-C33', 'ev974-C34', 'ev974-C35'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ownedChildren = new Set();
const verifiedBootstraps = new WeakMap();

function prepared() {
    assert(process.env.COPILOT_NATIVE_CONTROL_PLANS, 'Prepare the four committed native-control plans before this explicit native command.');
    const file = path.resolve(process.env.COPILOT_NATIVE_CONTROL_PLANS);
    assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink());
    const records = JSON.parse(fs.readFileSync(file, 'utf8'));
    const hostRoot = path.resolve(__dirname, '../../../..');
    const hostGit = pinnedGit(hostRoot);
    const trustedHostCommit = hostGit('rev-parse', 'HEAD').toString('utf8').trim();
    assert.match(trustedHostCommit, /^[a-f0-9]{40}$/u, 'committed native-control host source required');
    const committed = relative => hostGit('show', trustedHostCommit + ':' + relative);
    assert(hash(committed('quality/bugbot/evidence/issue974/containment-native.test.cjs')) === hash(fs.readFileSync(__filename)),
        'native harness must match its committed host source');
    const trustedBootstrapBytes = committed('quality/bugbot/evidence/issue-950/qualification-bootstrap.cjs');
    const trustedBootstrapSha256 = hash(trustedBootstrapBytes);
    assert.deepEqual(records.map(row => row.caseId), ids);
    const plans = records.map(row => {
        assert.deepEqual(Object.keys(row).sort(), ['bootstrapPath', 'bootstrapSha256', 'caseId', 'planPath', 'planSha256', 'repository', 'revision']);
        assert.match(row.revision, /^[a-f0-9]{40}$/u); assert.match(row.planSha256, /^[a-f0-9]{64}$/u);
        assert.match(row.bootstrapSha256, /^[a-f0-9]{64}$/u);
        assert.equal(fs.realpathSync(row.repository), row.repository);
        assert.equal(row.bootstrapSha256, trustedBootstrapSha256, 'bootstrap must match the independently trusted source pin');
        const supplied = fs.lstatSync(row.bootstrapPath);
        assert(supplied.isFile() && !supplied.isSymbolicLink() && supplied.size === trustedBootstrapBytes.length,
            'bootstrap must be an exact regular-file snapshot');
        const descriptor = fs.openSync(row.bootstrapPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        try {
            const opened = fs.fstatSync(descriptor);
            assert(opened.isFile() && opened.dev === supplied.dev && opened.ino === supplied.ino && opened.size === supplied.size,
                'bootstrap changed before snapshot verification');
            const bytes = Buffer.alloc(trustedBootstrapBytes.length + 1);
            const size = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
            assert(size === trustedBootstrapBytes.length && hash(bytes.subarray(0, size)) === trustedBootstrapSha256,
                'bootstrap bytes differ from the independently trusted source');
        } finally { fs.closeSync(descriptor); }
        const bytes = execFileSync(trustedGitExecutable(), ['-C', row.repository, 'show', row.revision + ':' + row.planPath],
            { env: gitEnvironment(), maxBuffer: 4 * 1024 * 1024 });
        assert.equal(hash(bytes), row.planSha256);
        const plan = JSON.parse(bytes); assert.equal(plan.purpose, 'native-control');
        assert.equal(plan.nativeControl.selectedCase, row.caseId); requireProfile(plan.containment);
        assert.equal(hash(fs.readFileSync(__filename)), plan.nativeControl.harnessSha256);
        const entry = Object.freeze({ ...row, plan });
        verifiedBootstraps.set(entry, Buffer.from(trustedBootstrapBytes));
        return entry;
    });
    const common = entry => ({ ...entry.plan, nativeControl: { ...entry.plan.nativeControl, selectedCase: null } });
    for (const entry of plans.slice(1)) assert.deepEqual(common(entry), common(plans[0]), 'native cases must use the same frozen tuple');
    return plans;
}

function rows(file) {
    if (!fs.existsSync(file)) return [];
    const result = [];
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        try { result.push(JSON.parse(line)); } catch { break; }
    }
    return result;
}

async function until(predicate) {
    const bound = Date.now() + 240_000;
    while (!await predicate()) {
        assert(Date.now() < bound, 'Model-free native fixture readiness/cleanup failed.');
        await new Promise(resolve => setTimeout(resolve, 25));
    }
}

function launch(entry, name) {
    const bootstrapBytes = verifiedBootstraps.get(entry);
    assert(bootstrapBytes, 'native launch requires its private prepared bootstrap authority');
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-native-' + name + '-')));
    fs.chmodSync(directory, 0o700);
    const verifiedBootstrap = path.join(directory, 'verified-bootstrap.cjs');
    fs.writeFileSync(verifiedBootstrap, bootstrapBytes, { flag: 'wx', mode: 0o400 });
    const output = path.join(directory, 'output'), log = path.join(directory, 'bootstrap.log');
    const fd = fs.openSync(log, 'wx', 0o600);
    const env = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', BUGBOT_VERIFICATION_MODE: 'disabled' };
    const child = spawn(process.execPath, [verifiedBootstrap, entry.repository, entry.revision, entry.planPath,
        entry.planSha256, entry.bootstrapSha256, 'native-control', output], { env, stdio: ['ignore', fd, fd] });
    ownedChildren.add(child);
    const done = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
            ownedChildren.delete(child); fs.fsyncSync(fd); fs.closeSync(fd); resolve({ code, signal });
        });
    });
    void done.catch(() => undefined);
    return { entry, child, directory, output, log, done,
        ledger: () => rows(path.join(output, 'native.jsonl')) };
}

function engine(entry, method, route) {
    const profile = requireProfile(entry.plan.containment);
    return new Promise((resolve, reject) => {
        const request = http.request({ socketPath: profile.socketPath, method, agent: false,
            path: '/v' + profile.engine.apiVersion + route }, response => {
            let body = '';
            response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
            response.once('error', reject);
            response.once('end', () => {
                if (response.statusCode !== 200 && response.statusCode !== 204) {
                    const error = new Error('Native Engine observation unavailable: ' + response.statusCode);
                    error.statusCode = response.statusCode; return reject(error);
                }
                try { resolve(body ? JSON.parse(body) : null); } catch (error) { reject(error); }
            });
        });
        request.once('error', reject); request.end();
    });
}

// Independent host observation. This is not a production scope capability or
// model-output receipt; the native test supplies its positively inspected ID.
function nativeWait(entry, scopeId, condition) {
    assert.match(scopeId, /^[a-f0-9]{64}$/u); assert(['next-exit', 'removed'].includes(condition));
    const profile = requireProfile(entry.plan.containment);
    let acknowledge, rejectAcknowledgment, complete, rejectCompletion, requestClosed, responseClosed, req, response, settled = false;
    const registered = new Promise((resolve, reject) => { acknowledge = resolve; rejectAcknowledgment = reject; });
    const result = new Promise((resolve, reject) => { complete = resolve; rejectCompletion = reject; });
    const closed = new Promise(resolve => { requestClosed = resolve; });
    const fail = error => {
        if (settled) return;
        settled = true; rejectAcknowledgment(error); rejectCompletion(error); req?.destroy(); response?.destroy();
    };
    void registered.catch(() => undefined); void result.catch(() => undefined);
    try {
        req = http.request({ socketPath: profile.socketPath, method: 'POST', agent: false, timeout: 0,
            path: '/v' + profile.engine.apiVersion + '/containers/' + scopeId + '/wait?condition=' + condition }, incoming => {
            response = incoming; responseClosed = new Promise(resolve => incoming.once('close', resolve));
            incoming.once('error', fail); incoming.once('aborted', () => fail(new Error('Independent native wait response aborted.')));
            incoming.once('close', () => { if (!incoming.complete) fail(new Error('Independent native wait closed before completion.')); });
            if (settled) { incoming.destroy(); return; }
            if (incoming.statusCode !== 200) { fail(new Error('Independent native wait registration failed.')); return; }
            acknowledge(); const chunks = []; let length = 0;
            incoming.on('data', chunk => {
                if (settled) return;
                length += chunk.length;
                if (length > 2 * 1024 * 1024) fail(new Error('Independent native wait metadata exceeded its bound.'));
                else chunks.push(chunk);
            });
            incoming.once('end', () => {
                if (settled) return;
                try {
                    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    assert(value && !Array.isArray(value) && typeof value === 'object');
                    assert(Object.keys(value).every(key => key === 'StatusCode' || key === 'Error'));
                    assert(Number.isSafeInteger(value.StatusCode) && value.StatusCode >= 0);
                    if (Object.hasOwn(value, 'Error')) {
                        assert(value.Error && !Array.isArray(value.Error) && typeof value.Error === 'object');
                        assert.deepEqual(Object.keys(value.Error), ['Message']); assert.equal(value.Error.Message, '');
                    }
                    settled = true; complete({ StatusCode: value.StatusCode });
                } catch { fail(new Error('Independent native wait terminal evidence invalid.')); }
            });
        });
        req.once('error', fail); req.once('close', requestClosed); req.end();
    } catch (error) { fail(error); if (!req) requestClosed(); }
    return { registered, result, async close() {
        fail(new Error('Independent native wait closed without terminal evidence.')); req?.destroy(); response?.destroy();
        await closed; if (responseClosed) await responseClosed;
    } };
}

function validateScope(run, scope) {
    assert.match(scope.scopeId, /^[a-f0-9]{64}$/u);
    assert.match(scope.identity.ownerId, /^[a-f0-9]{64}$/u);
    assert.equal(scope.identity.operationId, 'control:' + run.entry.caseId);
    assert.equal(scope.identity.planSha256, run.entry.planSha256);
    assert.equal(scope.identity.implementation, run.entry.plan.implementation);
    assert.equal(scope.identity.imageSha256, run.entry.plan.containment.image.slice(7));
    assert.equal(scope.identity.purpose, 'native-control');
    return scope;
}

function knownScope(run) {
    const created = run.ledger().filter(row => row.event === 'scope-created');
    assert.equal(created.length, 1); return validateScope(run, created[0]);
}

async function inspectOwned(run, scope) {
    const actual = await engine(run.entry, 'GET', '/containers/' + scope.scopeId + '/json');
    assert.equal(actual.Id, scope.scopeId); assert.equal(actual.Image, run.entry.plan.containment.image);
    for (const [key, value] of Object.entries(scope.identity)) assert.equal(actual.Config.Labels['dev.vyp.copilot.qualification.' + key], value);
    return actual;
}

async function ready(run) {
    const file = path.join(run.output, 'operation/native/sdk-ready.json');
    await until(() => fs.existsSync(file) || run.child.exitCode !== null || run.child.signalCode !== null);
    assert(fs.existsSync(file), fs.readFileSync(run.log, 'utf8'));
    const observed = JSON.parse(fs.readFileSync(file, 'utf8')), scope = knownScope(run);
    assert.equal(observed.scopeId, scope.scopeId); assert.deepEqual(observed.identity, scope.identity);
    assert.equal(observed.modelCalls, 0); assert.equal(observed.qualificationInvestigation, true);
    assert.equal(observed.descendant.ppid, 1); assert.equal(observed.descendant.pid, observed.descendant.session);
    assert.notEqual(observed.descendant.state, 'Z');
    return { scope, observed };
}

async function stopOwner(run) {
    if (!ownedChildren.has(run.child)) return;
    run.child.kill('SIGTERM');
    let escalation;
    const timer = setTimeout(() => { escalation = run.child.kill('SIGKILL'); }, 10_000);
    try { await run.done; } finally { clearTimeout(timer); void escalation; }
}

function cancelWithTest(t, run) {
    t.signal.addEventListener('abort', () => { void stopOwner(run).catch(() => undefined); }, { once: true });
}

async function cleanupKnownScopes(run) {
    // Test cleanup is not acceptance evidence. It follows the actual owner
    // termination request and addresses only IDs durably observed from this
    // exact public-bootstrap launch; unknown create effects remain retained.
    for (const event of run.ledger().filter(row => row.event === 'scope-created')) {
        const scope = validateScope(run, event);
        let actual;
        try { actual = await inspectOwned(run, scope); }
        catch (error) { if (error.statusCode === 404) continue; throw error; }
        const forced = actual.State.Running;
        if (forced) {
            try { await engine(run.entry, 'POST', '/containers/' + scope.scopeId + '/kill?signal=SIGKILL'); }
            catch (error) { if (error.statusCode !== 404) throw error; }
        }
        let absent = false;
        await until(async () => {
            try { actual = await inspectOwned(run, scope); return !actual.State.Running && actual.State.Pid === 0; }
            catch (error) { if (error.statusCode !== 404) throw error; absent = true; return true; }
        });
        fs.appendFileSync(path.join(run.directory, 'test-cleanup.jsonl'), JSON.stringify({ scope, forced,
            absent, state: absent ? null : actual.State, acceptanceEvidence: false }) + '\n', { mode: 0o600 });
        if (!absent) {
            try { await engine(run.entry, 'DELETE', '/containers/' + scope.scopeId + '?force=0&v=0'); }
            catch (error) { if (error.statusCode !== 404) throw error; }
        }
    }
}

for (const id of ids.slice(0, 2)) test(id + ' actual contained SDK cancels escaped descendants', { timeout: 360_000 }, async t => {
    const entry = prepared().find(row => row.caseId === id), run = launch(entry, id);
    cancelWithTest(t, run);
    try {
        const exit = await run.done; assert.equal(exit.code, 0, fs.readFileSync(run.log, 'utf8'));
        const ledger = run.ledger(), ready = ledger.find(row => row.event === 'native-ready');
        assert(ready); assert.equal(ready.evidence.sdkSettled, id === 'ev974-C32');
        assert.equal(ready.evidence.descendant.ppid, 1); assert.equal(ready.evidence.modelCalls, 0);
        if (id === 'ev974-C32') {
            const { launcher, nested } = ready.evidence.nestedNamespace;
            assert.equal(launcher.ppid, 1); assert.equal(launcher.session, launcher.pid);
            assert.notEqual(launcher.state, 'Z'); assert.notEqual(nested.state, 'Z');
            assert.equal(nested.procfsScope, 'outer-operation');
            assert(Number.isSafeInteger(nested.namespacePid) && nested.namespacePid > 0);
            assert.match(launcher.bwrapSha256, /^[a-f0-9]{64}$/u);
            for (const name of ['user', 'pid', 'mnt', 'ipc', 'net']) assert.notEqual(nested.namespaces[name], launcher.namespaces[name]);
        }
        const end = ledger.find(row => row.event === 'operation-stopped');
        assert.equal(end.namespaceInitStopped, true); assert.equal(end.interrupted, true);
        assert.equal(ledger.filter(row => row.event === 'scope-removed').length, 1);
        assert.equal(ledger.at(-1).event, 'native-finish');
    } finally { await stopOwner(run); await cleanupKnownScopes(run); }
});

test('ev974-C34 actual outer SIGKILL independently removes its namespace and retains incomplete evidence', { timeout: 360_000 }, async t => {
    const entry = prepared().find(row => row.caseId === 'ev974-C34'), run = launch(entry, 'owner-loss');
    cancelWithTest(t, run);
    let scope, exitObservation, removalObservation;
    const cancelObservation = () => { void Promise.allSettled([exitObservation, removalObservation].filter(Boolean).map(observation => observation.close())); };
    t.signal.addEventListener('abort', cancelObservation, { once: true });
    try {
        ({ scope } = await ready(run));
        const before = await inspectOwned(run, scope);
        assert.equal(before.State.Running, true); assert(before.State.Pid > 0); assert.equal(before.State.Restarting, false);
        assert.equal(before.HostConfig.AutoRemove, true); assert.equal(before.HostConfig.RestartPolicy.Name, 'no');
        exitObservation = nativeWait(entry, scope.scopeId, 'next-exit'); removalObservation = nativeWait(entry, scope.scopeId, 'removed');
        if (t.signal.aborted) cancelObservation();
        await Promise.all([exitObservation.registered, removalObservation.registered]);
        assert.equal((await inspectOwned(run, scope)).State.Running, true);
        assert(run.child.kill('SIGKILL')); const exit = await run.done; assert.equal(exit.signal, 'SIGKILL');
        const namespaceExit = await exitObservation.result, namespaceRemoved = await removalObservation.result;
        assert.equal(namespaceExit.StatusCode, 143); assert.equal(namespaceRemoved.StatusCode, namespaceExit.StatusCode);
        await assert.rejects(inspectOwned(run, scope), error => error.statusCode === 404);
        assert(!run.ledger().some(row => ['operation-stopped', 'native-finish'].includes(row.event)));
        fs.writeFileSync(path.join(run.directory, 'owner-loss-proof.json'), JSON.stringify({ scope,
            outerPid: run.child.pid, exit, before: { Image: before.Image, State: before.State, autoRemove: before.HostConfig.AutoRemove },
            namespaceExit, namespaceRemoved, exactIdAbsent: true, manualDeleteIssued: false,
            source: 'independent-host-engine-observer', modelCalls: 0, outcome: 'interrupted-incomplete' }, null, 2), { flag: 'wx', mode: 0o600 });
    } finally {
        t.signal.removeEventListener('abort', cancelObservation);
        await Promise.allSettled([exitObservation, removalObservation].filter(Boolean).map(observation => observation.close()));
        await stopOwner(run); await cleanupKnownScopes(run);
    }
});

test('ev974-C35 actual completion/cancel races preserve identity and leave an unrelated owned scope running', { timeout: 360_000 }, async t => {
    const plans = prepared(), sentinel = launch(plans.find(row => row.caseId === 'ev974-C34'), 'unrelated-sentinel');
    cancelWithTest(t, sentinel);
    let target;
    try {
        const { scope } = await ready(sentinel);
        target = launch(plans.find(row => row.caseId === 'ev974-C35'), 'completion-race');
        cancelWithTest(t, target);
        const exit = await target.done; assert.equal(exit.code, 0, fs.readFileSync(target.log, 'utf8'));
        const ledger = target.ledger(), stopped = ledger.filter(row => row.event === 'operation-stopped');
        assert.equal(stopped.length, 5); assert.equal(new Set(stopped.map(row => row.scopeId)).size, 5);
        assert(stopped.every(row => row.namespaceInitStopped === true && row.scopeId !== scope.scopeId));
        assert.equal(stopped[0].interrupted, false); assert.equal(stopped[0].exitCode, 0);
        assert.equal(ledger.filter(row => row.event === 'scope-removed').length, 5);
        const late = ledger.filter(row => row.event === 'native-late-cancellation-proof');
        assert.deepEqual(late.map(row => row.stage), ['operation-stopped', 'scope-remove-start', 'scope-removed']);
        assert(late.every(row => row.interrupted === true && row.namespaceInitStopped === true && row.modelCalls === 0));
        assert.deepEqual(late.map(row => row.scopeId), stopped.slice(2).map(row => row.scopeId));
        const incomplete = ledger.filter(row => row.event === 'operation-incomplete');
        assert.equal(incomplete.length, 3);
        assert(incomplete.every(row => row.reason === 'explicit-cancellation' && row.stoppedConfirmed === true && row.removed === true));
        const actual = await inspectOwned(sentinel, scope);
        assert.equal(actual.State.Running, true); assert(actual.State.Pid > 0);
        fs.writeFileSync(path.join(target.directory, 'unrelated-scope-proof.json'), JSON.stringify({ scope,
            state: actual.State, modelCalls: 0 }, null, 2), { flag: 'wx', mode: 0o600 });
    } finally {
        try { if (target) { await stopOwner(target); await cleanupKnownScopes(target); } }
        finally { await stopOwner(sentinel); await cleanupKnownScopes(sentinel); }
    }
});
