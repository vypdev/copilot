'use strict';

if (require.main === module) throw new Error('Use the independently reviewed immutable qualification bootstrap.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { tmpdir } = require('node:os');
const { randomBytes } = require('node:crypto');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const imagePattern = /^sha256:[a-f0-9]{64}$/u;
const idPattern = /^[a-f0-9]{64}$/u;
const labelPrefix = 'dev.vyp.copilot.qualification.';
const unreturnedOwnedScopes = new WeakMap();

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
}
const objectSha256 = value => sha256(JSON.stringify(canonical(value)));

function requireProfile(value) {
    const keys = ['schemaVersion', 'image', 'imageConfigSha256', 'hostNodeSha256', 'socketPath', 'supervisorSha256', 'workerUid', 'workerGid', 'engine'];
    assert(value && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'closed containment profile required');
    assert.equal(value.schemaVersion, 1);
    assert.match(value.image, imagePattern, 'immutable image content identity required');
    for (const key of ['imageConfigSha256', 'hostNodeSha256', 'supervisorSha256']) assert.match(value[key], idPattern, key + ' required');
    assert(typeof value.socketPath === 'string' && path.isAbsolute(value.socketPath), 'reviewed local Unix socket required');
    assert(Number.isSafeInteger(value.workerUid) && value.workerUid > 0 && Number.isSafeInteger(value.workerGid) && value.workerGid > 0,
        'unprivileged worker identity required');
    const engineKeys = ['version', 'apiVersion', 'os', 'arch', 'kernelVersion'];
    assert(value.engine && Object.keys(value.engine).length === engineKeys.length && engineKeys.every(key =>
        Object.hasOwn(value.engine, key) && typeof value.engine[key] === 'string' && value.engine[key].length > 0), 'complete observed engine tuple required');
    assert.match(value.engine.apiVersion, /^1\.\d{2,3}$/u);
    assert.equal(value.engine.os, 'linux', 'worker requires Linux PID namespaces');
    return Object.freeze({ ...value, engine: Object.freeze({ ...value.engine }) });
}

function privateDirectory(directory, uid) {
    assert(typeof directory === 'string' && path.isAbsolute(directory) && fs.realpathSync(directory) === directory,
        'owned canonical staging directory required');
    const stat = fs.lstatSync(directory);
    assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === uid && (stat.mode & 0o077) === 0,
        'private owned staging directory required');
    return directory;
}

function labels(identity) {
    return Object.fromEntries(Object.entries(identity).map(([key, value]) => [labelPrefix + key, value]));
}

/** Fixed transport configuration, never a user-supplied Docker argument list. */
function fixedConfiguration(profile, identity, inputDirectory, outputDirectory, imageEnvironment = []) {
    profile = requireProfile(profile);
    assert.match(identity.ownerId, idPattern); assert.match(identity.planSha256, idPattern);
    assert.match(identity.implementation, /^[a-f0-9]{40}$/u);
    assert.match(identity.operationId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    assert(['corpus-case', 'paired-review', 'native-control'].includes(identity.purpose));
    assert.equal(Object.keys(identity).length, 6);
    assert.equal(identity.imageSha256, profile.image.slice(7));
    assert.equal(typeof process.getuid, 'function');
    assert.equal(process.getuid(), profile.workerUid, 'staging owner differs from the reviewed worker identity');
    privateDirectory(inputDirectory, profile.workerUid); privateDirectory(outputDirectory, profile.workerUid);
    assert(inputDirectory !== outputDirectory && !inputDirectory.startsWith(outputDirectory + path.sep)
        && !outputDirectory.startsWith(inputDirectory + path.sep), 'staging directories must be independent');
    assert(Array.isArray(imageEnvironment) && imageEnvironment.every(value => typeof value === 'string'
        && /^(?:PATH|NODE_VERSION|YARN_VERSION)=.+$/u.test(value)), 'only immutable image runtime metadata is admitted');
    assert.equal(new Set(imageEnvironment.map(value => value.slice(0, value.indexOf('=')))).size, imageEnvironment.length);
    return {
        Image: profile.image, Entrypoint: ['/usr/local/bin/node', '/qualification-supervisor.cjs'],
        Cmd: [String(profile.workerUid), String(profile.workerGid)],
        WorkingDir: '/sdk', User: '0:0', Env: [...imageEnvironment], Labels: labels(identity),
        AttachStdin: true, AttachStdout: false, AttachStderr: false, OpenStdin: true, StdinOnce: true, Tty: false,
        HostConfig: {
            ReadonlyRootfs: true, Privileged: false, AutoRemove: false, RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
            PidMode: '', IpcMode: 'private', NetworkMode: 'bridge',
            CapDrop: ['ALL'], CapAdd: ['SETUID', 'SETGID'], SecurityOpt: ['no-new-privileges:true'],
            Mounts: [
                { Type: 'bind', Source: inputDirectory, Target: '/qualification-input', ReadOnly: true,
                    BindOptions: { Propagation: 'rprivate', NonRecursive: true } },
                { Type: 'bind', Source: outputDirectory, Target: '/qualification-output', ReadOnly: false,
                    BindOptions: { Propagation: 'rprivate', NonRecursive: true } },
            ],
            Tmpfs: { '/tmp': 'rw,nosuid,nodev,mode=1777' },
        },
    };
}

/** No research deadline or heartbeat. These requests can wait as long as the operation. */
function request(socketPath, apiVersion, method, route, body) {
    const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
        const req = http.request({ socketPath, method, path: '/v' + apiVersion + route, agent: false, timeout: 0,
            headers: bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {} }, response => {
            const chunks = []; let size = 0;
            response.on('data', chunk => {
                size += chunk.length;
                // Only bounded engine metadata uses this path; model output is
                // retained in the private operation directory, never parsed here.
                if (size > 2 * 1024 * 1024) response.destroy(new Error('Engine metadata exceeded its closed contract.'));
                else chunks.push(chunk);
            });
            response.once('error', reject);
            response.once('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('Owned engine request failed: HTTP ' + response.statusCode));
                try { resolve(text ? JSON.parse(text) : undefined); } catch { reject(new Error('Invalid engine metadata.')); }
            });
        });
        req.once('error', reject); req.end(bytes);
    });
}

/** Only the outer immutable bootstrap owns this writer; child/model stdio is unrelated. */
function attachLifetime(socketPath, apiVersion, id) {
    assert.match(id, idPattern);
    return new Promise((resolve, reject) => {
        const req = http.request({ socketPath, method: 'POST', agent: false, timeout: 0,
            path: '/v' + apiVersion + '/containers/' + id + '/attach?stream=1&stdin=1&stdout=0&stderr=0',
            headers: { Connection: 'Upgrade', Upgrade: 'tcp' } });
        req.once('upgrade', (response, socket, head) => {
            if (response.statusCode !== 101 || head.length) { socket.destroy(); reject(new Error('Owned stdin upgrade was not admitted.')); return; }
            // Unexpected bytes cannot serve as authority or block the lifetime
            // channel. The PID1 control input accepts EOF, never model output.
            socket.setTimeout(0); socket.resume(); resolve(socket);
        });
        req.once('response', response => { response.resume(); reject(new Error('Owned stdin upgrade unavailable.')); });
        req.once('error', reject); req.end();
    });
}

function observedEngine(value) {
    return { version: value.Version, apiVersion: value.ApiVersion, os: value.Os, arch: value.Arch, kernelVersion: value.KernelVersion };
}

/** Docker omits a false ReadOnly field. Confirm its effective RW value too;
 * no other missing field, mount, permission or provider flag is normalized. */
function requireFixedMountConfiguration(configured, effective, expected) {
    assert(Array.isArray(configured) && configured.length === expected.length, 'scope configuration changed: Mounts');
    for (const [index, mount] of configured.entries()) {
        assert(mount && typeof mount === 'object' && !Array.isArray(mount), 'invalid configured mount');
        assert(!Object.hasOwn(mount, 'ReadOnly') || typeof mount.ReadOnly === 'boolean', 'invalid mount read-only state');
        const normalized = { ...mount, ReadOnly: Object.hasOwn(mount, 'ReadOnly') ? mount.ReadOnly : false };
        assert(isDeepStrictEqual(normalized, expected[index]), 'scope configuration changed: Mounts');
    }
    assert(Array.isArray(effective) && effective.length === expected.length, 'scope effective mounts changed');
    const destinations = new Set();
    for (const mount of effective) {
        assert(mount && typeof mount === 'object' && !Array.isArray(mount), 'invalid effective mount');
        assert.deepEqual(Object.keys(mount).sort(), ['Destination', 'Mode', 'Propagation', 'RW', 'Source', 'Type']);
        assert(!destinations.has(mount.Destination), 'duplicate effective mount'); destinations.add(mount.Destination);
        const wanted = expected.find(value => value.Target === mount.Destination);
        assert(wanted, 'foreign effective mount');
        assert.equal(mount.Type, wanted.Type); assert.equal(mount.Source, wanted.Source);
        assert.equal(mount.Mode, ''); assert.equal(mount.Propagation, wanted.BindOptions.Propagation);
        assert.equal(mount.RW, !wanted.ReadOnly, 'effective mount access changed');
    }
}

/** Bootstrap-authorized adapter. Unknown create/start effects are retained, never replayed. */
async function createOperationContainment({ root, identity, inputDirectory, outputDirectory, record }) {
    identity = Object.freeze({ ...identity });
    const proof = require('../issue-950/execution-provenance.cjs').requireBootstrapAdmission(root);
    const bytes = fs.readFileSync(path.join(root, proof.planPath));
    assert.equal(sha256(bytes), proof.planSha256, 'reviewed containment plan changed');
    const plan = JSON.parse(bytes), profile = requireProfile(plan.containment);
    assert.equal(identity.planSha256, proof.planSha256);
    assert.equal(identity.implementation, plan.implementation);
    assert.equal(sha256(fs.readFileSync(process.execPath)), profile.hostNodeSha256, 'host launcher differs');
    assert.equal(fs.realpathSync(profile.socketPath), profile.socketPath, 'reviewed Unix socket changed');
    const stat = fs.lstatSync(profile.socketPath);
    assert(stat.isSocket() && [0, process.getuid()].includes(stat.uid), 'reviewed local Unix socket unavailable');
    assert.equal(sha256(fs.readFileSync(path.join(root, 'quality/bugbot/evidence/issue974/qualification-supervisor.cjs'))),
        profile.supervisorSha256, 'immutable supervisor differs');
    const api = (method, route, body) => request(profile.socketPath, profile.engine.apiVersion, method, route, body);
    assert.deepEqual(observedEngine(await api('GET', '/version')), profile.engine, 'observed engine tuple differs');
    const image = await api('GET', '/images/' + profile.image + '/json');
    assert.equal(image.Id, profile.image, 'actual immutable image differs');
    assert.equal(objectSha256(image.Config), profile.imageConfigSha256, 'actual image configuration differs');
    assert.equal(image.Os, 'linux'); assert.equal(image.Architecture, profile.engine.arch);
    assert(!image.Config.Volumes || Object.keys(image.Config.Volumes).length === 0, 'image-declared mounts are not admitted');
    // Docker inherits image ENV even when the create request supplies [].
    // Freeze its admitted non-secret runtime metadata explicitly so inspect
    // compares the actual environment rather than an impossible empty one.
    const config = fixedConfiguration(profile, identity, inputDirectory, outputDirectory, image.Config.Env ?? []);
    const name = 'copilot-qualification-' + sha256(JSON.stringify(identity));
    await record({ event: 'scope-create-start', identity, name, configurationSha256: objectSha256(config) });
    const created = await api('POST', '/containers/create?name=' + name, config);
    assert.match(created?.Id ?? '', idPattern, 'scope creation identity is unknown');
    const id = created.Id;
    let lifetime, starting = false, stopping = false, removed = false, stoppedProof, confirmation, startRequest, stopRequest, waitRequest;
    async function inspect() {
        assert(!removed, 'owned scope already removed');
        const actual = await api('GET', '/containers/' + id + '/json');
        assert.equal(actual.Id, id); assert.equal(actual.Image, profile.image);
        for (const [key, value] of Object.entries(labels(identity))) assert.equal(actual.Config.Labels?.[key], value, 'scope ownership changed');
        assert.equal(actual.Config.OpenStdin, true); assert.equal(actual.Config.StdinOnce, true); assert.equal(actual.Config.Tty, false);
        assert.equal(actual.HostConfig.Privileged, false); assert.equal(actual.HostConfig.PidMode, '');
        assert.equal(actual.HostConfig.ReadonlyRootfs, true);
        assert(isDeepStrictEqual(actual.Config.Entrypoint, config.Entrypoint), 'scope entrypoint changed');
        assert(isDeepStrictEqual(actual.Config.Cmd, config.Cmd), 'scope worker identity changed');
        assert(isDeepStrictEqual(actual.Config.Env, config.Env), 'scope environment changed');
        requireFixedMountConfiguration(actual.HostConfig.Mounts, actual.Mounts, config.HostConfig.Mounts);
        for (const key of ['AutoRemove', 'RestartPolicy', 'IpcMode', 'NetworkMode', 'CapDrop', 'CapAdd', 'SecurityOpt', 'Tmpfs']) {
            assert(isDeepStrictEqual(actual.HostConfig[key], config.HostConfig[key]), 'scope configuration changed: ' + key);
        }
        return actual;
    }
    function confirmStopped() {
        confirmation ??= (async () => {
            const actual = await inspect();
            assert.equal(actual.State.Running, false, 'owned scope is still running');
            assert.equal(actual.State.Pid, 0, 'owned namespace init is not confirmed stopped');
            assert.equal(actual.State.Restarting, false);
            assert(['exited', 'created', 'dead'].includes(actual.State.Status), 'owned scope stop state is unknown');
            const proof = Object.freeze({ identity: Object.freeze({ ...identity }), scopeId: id, namespaceInitStopped: true });
            await record({ event: 'scope-stopped', ...proof, exitCode: actual.State.ExitCode, started: starting,
                actualImage: actual.Image, namespaceState: { running: actual.State.Running, pid: actual.State.Pid,
                    restarting: actual.State.Restarting, status: actual.State.Status } });
            stoppedProof = proof;
            return proof;
        })();
        return confirmation;
    }
    const owned = Object.freeze({ scopeId: id, identity: Object.freeze({ ...identity }),
        start() {
            assert(!startRequest && !stopping && !stoppedProof, 'owned operation cannot be replayed');
            startRequest = (async () => {
                await inspect();
                assert(!stopping, 'scope was stopped before startup');
                lifetime = await attachLifetime(profile.socketPath, profile.engine.apiVersion, id);
                lifetime.once('error', () => { /* Channel loss never becomes successful research. */ });
                assert(!stopping, 'scope was stopped before startup');
                await record({ event: 'scope-start', identity, scopeId: id });
                assert(!stopping, 'scope was stopped before startup');
                starting = true;
                await api('POST', '/containers/' + id + '/start');
            })();
            return startRequest;
        },
        wait() {
            assert(starting, 'owned operation has not started');
            waitRequest ??= (async () => {
                const result = await api('POST', '/containers/' + id + '/wait?condition=not-running');
                assert(!result.Error?.Message, 'owned scope reported a runtime failure');
                const proof = await confirmStopped();
                lifetime?.destroy();
                return { ...proof, exitCode: result.StatusCode };
            })();
            return waitRequest;
        },
        stop(reason) {
            assert(['completed', 'failed', 'cancelled', 'owner-lost'].includes(reason), 'invalid scope stop reason');
            if (stoppedProof) return Promise.resolve(stoppedProof);
            if (stopRequest) return stopRequest;
            stopping = true;
            stopRequest = (async () => {
                await inspect();
                await record({ event: 'scope-stop-request', identity, scopeId: id, reason });
                lifetime?.end();
                // Escalation begins AFTER an actual termination request only.
                // It never caps investigation/run/wait/heartbeat duration.
                let escalation;
                const force = setTimeout(() => { escalation = inspect().then(actual => actual.State.Running
                    ? api('POST', '/containers/' + id + '/kill?signal=SIGKILL') : undefined);
                void escalation.catch(() => undefined); }, 5_000);
                try {
                    if (startRequest) await startRequest.catch(() => undefined);
                    lifetime?.end();
                    if (starting) await api('POST', '/containers/' + id + '/wait?condition=not-running');
                    return await confirmStopped();
                } finally {
                    clearTimeout(force); lifetime?.destroy();
                    // Settle any already-issued owned effect before cleanup.
                    if (escalation) await escalation;
                }
            })();
            return stopRequest;
        },
        async remove() {
            assert(stoppedProof, 'confirm stopped scope before cleanup');
            const actual = await inspect();
            assert.equal(actual.State.Running, false); assert.equal(actual.State.Pid, 0);
            await record({ event: 'scope-remove-start', identity, scopeId: id });
            await api('DELETE', '/containers/' + id + '?force=0&v=0'); removed = true;
            await record({ event: 'scope-removed', identity, scopeId: id });
        },
    });
    try { await record({ event: 'scope-created', identity, scopeId: id, name }); }
    catch (cause) {
        // Carry the actual semantic object privately if durable recording
        // fails after creation. A claimed JSON/error container ID never grants
        // cleanup authority. No create/start is replayed.
        const error = new Error('Owned scope creation record failed.', { cause });
        unreturnedOwnedScopes.set(error, owned); throw error;
    }
    return owned;
}

function privateWrite(file, bytes) {
    const descriptor = fs.openSync(file, 'wx', 0o600);
    try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

/** One complete frozen outer slot, using the same public bootstrap and SDK in
 * the admitted image. No arbitrary entrypoint, mount, CLI or retry parameters. */
async function runContainedOperation({ root, plan, mode, slot, outputDirectory, record, signal, campaign, preflight = false }) {
    const provenance = require('../issue-950/execution-provenance.cjs');
    const proof = provenance.requireBootstrapAdmission(root);
    assert(['corpus', 'review', 'native-control'].includes(mode));
    assert(typeof preflight === 'boolean' && (mode === 'corpus' || !preflight));
    assert(signal instanceof AbortSignal && typeof record === 'function');
    assert.equal(mode === 'native-control', plan.purpose === 'native-control');
    const operationId = mode === 'corpus' ? 'corpus:' + slot.caseId
        : mode === 'review' ? 'review:' + slot.subjectId + ':r' + slot.repetition : 'control:' + slot.caseId;
    const identity = Object.freeze({ ownerId: randomBytes(32).toString('hex'), operationId,
        planSha256: proof.planSha256, implementation: plan.implementation,
        imageSha256: plan.containment.image.slice(7),
        purpose: mode === 'corpus' ? 'corpus-case' : mode === 'review' ? 'paired-review' : 'native-control' });
    const staging = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'bugbot-owned-operation-')));
    fs.chmodSync(staging, 0o700);
    const input = path.join(staging, 'input'); fs.mkdirSync(input, { mode: 0o700 });
    let bundleSha256;
    let scope, createdEffect = false, confirmed = false, removed = false, cancelled = signal.aborted, stopping;
    const retained = async event => {
        if (event.event === 'scope-create-start') {
            await record(event);
            createdEffect = true; provenance.retainBootstrapScope(root, identity, null); return;
        }
        if (event.event === 'scope-created') provenance.retainBootstrapScope(root, identity, event.scopeId);
        await record(event);
        if (event.event === 'scope-stopped') provenance.confirmBootstrapScopeStopped(root, identity, event.scopeId);
    };
    const abort = () => {
        cancelled = true;
        if (scope && !stopping) {
            stopping = scope.stop('cancelled'); void stopping.catch(() => undefined);
        }
    };
    try {
        fs.mkdirSync(outputDirectory, { mode: 0o700 }); outputDirectory = fs.realpathSync(outputDirectory);
        const bundle = path.join(input, 'plan.bundle');
        bundleSha256 = provenance.materializePlanBundle(root, plan.implementation, proof.planCommit, bundle);
        if (mode === 'review') {
            assert(typeof campaign === 'string');
            const target = path.join(input, 'campaign');
            fs.mkdirSync(path.join(target, 'fixtures', 'full-review'), { recursive: true, mode: 0o700 });
            fs.cpSync(path.join(campaign, 'corpus-v3'), path.join(target, 'corpus-v3'),
                { recursive: true, verbatimSymlinks: true, dereference: false });
            assert(plan.repositoryCohort.order.includes(slot.subjectId) && [1, 2, 3].includes(slot.repetition));
            fs.cpSync(path.join(campaign, 'fixtures', 'full-review', slot.subjectId),
                path.join(target, 'fixtures', 'full-review', slot.subjectId),
                { recursive: true, verbatimSymlinks: true, dereference: false });
        }
        const credentials = { environment: {}, codexAuth: null, evidenceToken: null };
        if (mode !== 'native-control') {
            // Reuse normal credential selection; never bake values into the
            // image, engine config, public receipts or argv diagnostics.
            require('../issue-950/ev07-shadow/load.cjs');
            const authentication = require(path.join(root, 'src/data/repository/agent_authentication'));
            const policy = require(path.join(root, 'src/data/repository/agent_credential_policy'));
            const selected = authentication.buildAgentCliEnvironment('codex', process.env, 'openai');
            for (const key of policy.allowedCredentialVariables('codex', 'openai')) {
                if (selected[key] !== undefined) credentials.environment[key] = selected[key];
            }
            const sessionFile = authentication.codexChatGptSessionFile(process.env);
            if (sessionFile) credentials.codexAuth = fs.readFileSync(sessionFile, 'utf8');
            if (mode === 'review') credentials.evidenceToken = process.env.COPILOT_EVIDENCE_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
        }
        privateWrite(path.join(input, 'private-credentials.json'), JSON.stringify(credentials));
        scope = await createOperationContainment({ root, identity, inputDirectory: input, outputDirectory, record: retained });
        privateWrite(path.join(input, 'invocation.json'), JSON.stringify({ schemaVersion: 1, identity,
            scopeId: scope.scopeId, proof, mode, slot, bundleSha256, preflight }));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        await record({ event: 'operation-start', identity, scopeId: scope.scopeId, slot, preflight, outputDirectory, inputDirectory: input, bundleSha256 });
        if (!cancelled) await scope.start();
        const terminal = cancelled ? await stopping : await scope.wait();
        confirmed = terminal.namespaceInitStopped === true;
        if (stopping) await stopping;
        const outcome = { identity, scopeId: scope.scopeId, namespaceInitStopped: confirmed,
            exitCode: terminal.exitCode ?? null,
            interrupted: cancelled || signal.aborted || [130, 143].includes(terminal.exitCode), outputDirectory, preflight };
        await record({ event: 'operation-stopped', ...outcome });
        await scope.remove(); removed = true;
        return outcome;
    } catch (error) {
        scope ??= unreturnedOwnedScopes.get(error);
        if (scope) {
            try {
                const terminal = await scope.stop(cancelled ? 'cancelled' : 'failed');
                confirmed = terminal.namespaceInitStopped === true;
                if (confirmed) { await scope.remove(); removed = true; }
            } catch { /* Exact owned IDs and unknown effects remain in the durable ledger. */ }
        }
        await record({ event: 'operation-incomplete', identity, scopeId: scope?.scopeId ?? null,
            stoppedConfirmed: confirmed, removed, inputDirectory: input, outputDirectory,
            reason: cancelled ? 'explicit-cancellation' : 'runtime-or-ownership-unavailable' });
        throw error;
    } finally {
        signal.removeEventListener('abort', abort);
        // Unknown creation/lifetime effects retain their private staging. No
        // adoption, replay, unrelated cleanup or active research deadline.
        if (!createdEffect || confirmed && removed) fs.rmSync(staging, { recursive: true, force: true });
    }
}

module.exports = { createOperationContainment, runContainedOperation, fixedConfiguration, requireProfile, objectSha256,
    requireFixedMountConfiguration };
