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
const qualificationSeccomp = require('./qualification-seccomp.cjs');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const imagePattern = /^sha256:[a-f0-9]{64}$/u;
const idPattern = /^[a-f0-9]{64}$/u;
const labelPrefix = 'dev.vyp.copilot.qualification.';
const unreturnedOwnedScopes = new WeakMap();
const attachedClosures = new WeakMap();

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
    assert(['corpus-case', 'paired-review', 'native-control', 'runtime-admission'].includes(identity.purpose));
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
            ReadonlyRootfs: true, Privileged: false, AutoRemove: true, RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
            PidMode: '', IpcMode: 'private', NetworkMode: 'bridge',
            CapDrop: ['ALL'], CapAdd: ['SETUID', 'SETGID'],
            SecurityOpt: ['no-new-privileges:true', 'seccomp=' + qualificationSeccomp],
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
function request(socketPath, apiVersion, method, route, body, expectedStatus, signal) {
    const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    let req, response, responseClosed, resolveClosed;
    const closed = new Promise(resolve => { resolveClosed = resolve; });
    const abort = () => { req?.destroy(new Error('Owned metadata request cancelled.')); response?.destroy(); };
    const pending = new Promise((resolve, reject) => {
        try {
            req = http.request({ socketPath, method, path: '/v' + apiVersion + route, agent: false, timeout: 0,
                headers: bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {} }, incoming => {
                response = incoming;
                responseClosed = new Promise(done => incoming.once('close', done));
                const chunks = []; let size = 0;
                incoming.on('data', chunk => {
                    size += chunk.length;
                    if (size > 2 * 1024 * 1024) incoming.destroy(new Error('Engine metadata exceeded its closed contract.'));
                    else chunks.push(chunk);
                });
                incoming.once('error', reject);
                incoming.once('aborted', () => reject(new Error('Owned metadata response aborted.')));
                incoming.once('end', () => {
                    if (incoming.statusCode !== expectedStatus) {
                        const error = new Error('Owned engine request failed: HTTP ' + incoming.statusCode);
                        error.statusCode = incoming.statusCode; reject(error); return;
                    }
                    try { const text = Buffer.concat(chunks).toString('utf8'); resolve(text ? JSON.parse(text) : undefined); }
                    catch { reject(new Error('Invalid engine metadata.')); }
                });
            });
            req.once('close', resolveClosed); req.once('error', reject);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort(); else req.end(bytes);
        } catch (error) { reject(error); if (!req) resolveClosed(); }
    });
    return pending.finally(async () => {
        signal?.removeEventListener('abort', abort); req?.destroy(); response?.destroy();
        await closed; if (responseClosed) await responseClosed;
    });
}

/** Registration and terminal evidence are distinct. No operation/research timeout. */
function registerWait(socketPath, apiVersion, id, condition, signal) {
    assert.match(id, idPattern); assert(['next-exit', 'removed'].includes(condition));
    let resolveReady, rejectReady, resolveResult, rejectResult, resolveClosed, responseClosed;
    let req, response, terminal = false;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    const requestClosed = new Promise(resolve => { resolveClosed = resolve; });
    const clear = () => signal.removeEventListener('abort', abort);
    const fail = error => {
        if (terminal) return;
        terminal = true; clear(); rejectReady(error); rejectResult(error);
        req?.destroy(); response?.destroy();
    };
    const abort = () => fail(new Error('Owned wait registration cancelled.'));
    void ready.catch(() => undefined); void result.catch(() => undefined);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); resolveClosed(); }
    else {
        try {
            req = http.request({ socketPath, method: 'POST', agent: false, timeout: 0,
                path: '/v' + apiVersion + '/containers/' + id + '/wait?condition=' + condition }, incoming => {
                response = incoming;
                responseClosed = new Promise(resolve => incoming.once('close', resolve));
                incoming.once('error', fail);
                incoming.once('aborted', () => fail(new Error('Owned wait response aborted.')));
                incoming.once('close', () => { if (!incoming.complete) fail(new Error('Owned wait response closed before completion.')); });
                if (terminal) { incoming.destroy(); return; }
                if (incoming.statusCode !== 200) { fail(new Error('Owned wait registration was not acknowledged.')); return; }
                clear(); resolveReady();
                const chunks = []; let size = 0;
                incoming.on('data', bytes => {
                    if (terminal) return;
                    size += bytes.length;
                    if (size > 2 * 1024 * 1024) fail(new Error('Owned wait metadata exceeded its closed contract.'));
                    else chunks.push(bytes);
                });
                incoming.once('end', () => {
                    if (terminal) return;
                    try {
                        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                        assert(value && typeof value === 'object' && !Array.isArray(value));
                        assert(Object.keys(value).every(key => ['StatusCode', 'Error'].includes(key)));
                        assert(Number.isSafeInteger(value.StatusCode) && value.StatusCode >= 0);
                        if (Object.hasOwn(value, 'Error')) {
                            assert(value.Error && typeof value.Error === 'object' && !Array.isArray(value.Error));
                            assert.deepEqual(Object.keys(value.Error), ['Message']);
                            assert.equal(typeof value.Error.Message, 'string');
                            assert(!value.Error.Message, 'owned scope reported a runtime failure');
                        }
                        terminal = true; resolveResult(Object.freeze({ StatusCode: value.StatusCode }));
                    } catch { fail(new Error('Owned wait terminal evidence is invalid or reports a runtime failure.')); }
                });
            });
            req.once('close', resolveClosed); req.once('error', fail); req.end();
        } catch (error) { fail(error); if (!req) resolveClosed(); }
    }
    return Object.freeze({ ready, result, async close() {
        fail(new Error('Owned wait observation closed before its terminal result.'));
        req?.destroy(); response?.destroy();
        await requestClosed; if (responseClosed) await responseClosed;
    } });
}

/** Only the outer immutable bootstrap owns this writer; child/model stdio is unrelated. */
function attachLifetime(socketPath, apiVersion, id, signal) {
    assert.match(id, idPattern);
    return new Promise((resolve, reject) => {
        let req, response, socket, responseClosed, socketClosed, resolveRequestClosed, failed = false, admitted = false;
        const requestClosed = new Promise(done => { resolveRequestClosed = done; });
        const clear = () => signal.removeEventListener('abort', abort);
        const fail = error => {
            if (failed || admitted) return;
            failed = true; clear(); req?.destroy(); response?.destroy(); socket?.destroy();
            // Rejection is not quiescence: drain the actual owned close
            // callbacks before allowing startup/outer cancellation to settle.
            void Promise.all([requestClosed, responseClosed, socketClosed].filter(Boolean)).then(() => reject(error));
        };
        const abort = () => fail(new Error('Owned stdin attachment cancelled.'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { resolveRequestClosed(); abort(); return; }
        try {
            req = http.request({ socketPath, method: 'POST', agent: false, timeout: 0,
                path: '/v' + apiVersion + '/containers/' + id + '/attach?stream=1&stdin=1&stdout=0&stderr=0',
                headers: { Connection: 'Upgrade', Upgrade: 'tcp' } });
            req.once('close', resolveRequestClosed); req.once('error', fail);
            req.once('upgrade', (incoming, upgraded, head) => {
                socket = upgraded; socketClosed = new Promise(done => upgraded.once('close', done));
                upgraded.once('error', fail);
                if (failed) { upgraded.destroy(); return; }
                if (signal.aborted || incoming.statusCode !== 101 || head.length) {
                    fail(new Error('Owned stdin upgrade was not admitted.')); return;
                }
                clear(); upgraded.setTimeout(0); upgraded.resume(); admitted = true;
                attachedClosures.set(upgraded, Promise.all([requestClosed, socketClosed])); resolve(upgraded);
            });
            req.once('response', incoming => {
                response = incoming; responseClosed = new Promise(done => incoming.once('close', done));
                incoming.once('error', fail); fail(new Error('Owned stdin upgrade unavailable.'));
            });
            if (failed) req.destroy(); else req.end();
        } catch (error) { if (!req) resolveRequestClosed(); fail(error); }
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
async function createOperationContainment({ root, identity, inputDirectory, outputDirectory, record, signal }) {
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
    const api = (method, route, body, signal) => request(profile.socketPath, profile.engine.apiVersion, method, route, body,
        method === 'GET' ? 200 : route.startsWith('/containers/create?') ? 201 : 204, signal);
    assert.deepEqual(observedEngine(await api('GET', '/version', undefined, signal)), profile.engine, 'observed engine tuple differs');
    const image = await api('GET', '/images/' + profile.image + '/json', undefined, signal);
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
    const created = await api('POST', '/containers/create?name=' + name, config, signal);
    assert.match(created?.Id ?? '', idPattern, 'scope creation identity is unknown');
    const id = created.Id;
    let lifetime, lifetimeClosed, starting = false, startAcknowledged = false, observedRunning = false, stopping = false, removed = false;
    let stoppedProof, stopObservation, confirmation, startRequest, stopRequest, waitRequest, removeRequest, exitWait, removalWait;
    const attachment = new AbortController(), registration = new AbortController(), startCancellation = new AbortController();
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
    async function closeWaits() {
        lifetime?.destroy(); if (lifetimeClosed) await lifetimeClosed;
        const outcomes = await Promise.allSettled([exitWait, removalWait].filter(Boolean).map(wait => wait.close()));
        const failure = outcomes.find(value => value.status === 'rejected');
        if (failure) throw failure.reason;
    }
    function confirmStopped() {
        confirmation ??= (async () => {
            let namespaceState, exitCode, started;
            if (startAcknowledged || observedRunning) {
                assert(exitWait && removalWait, 'registered owned observations required');
                const result = await exitWait.result;
                exitCode = result.StatusCode; started = true;
                // Engine next-exit is the namespace init's exit, bound to the
                // inspected immutable ID before this acknowledged/observed start.
                namespaceState = { source: 'registered-next-exit', running: false, pid: 0, restarting: false, status: 'exited' };
            } else {
                const actual = await inspect();
                assert.equal(actual.State.Running, false, 'owned scope is still running');
                assert.equal(actual.State.Pid, 0, 'owned namespace init is not confirmed stopped');
                assert.equal(actual.State.Restarting, false);
                assert(starting ? ['created', 'exited', 'dead'].includes(actual.State.Status) : actual.State.Status === 'created',
                    'owned scope stop state is unknown');
                exitCode = actual.State.ExitCode; started = actual.State.Status === 'created' ? false : null;
                namespaceState = { source: 'inspection', running: actual.State.Running, pid: actual.State.Pid,
                    restarting: actual.State.Restarting, status: actual.State.Status };
            }
            const proof = Object.freeze({ identity, scopeId: id, namespaceInitStopped: true });
            await record({ event: 'scope-stopped', ...proof, exitCode, started, startAcknowledged,
                actualImage: profile.image, namespaceState });
            stopObservation = { exitCode, started, namespaceState }; stoppedProof = proof;
            return proof;
        })();
        return confirmation;
    }
    const owned = Object.freeze({ scopeId: id, identity: Object.freeze({ ...identity }),
        start() {
            assert(!startRequest && !stopping && !stoppedProof, 'owned operation cannot be replayed');
            startRequest = (async () => {
                const actual = await inspect();
                assert.equal(actual.State.Running, false); assert.equal(actual.State.Pid, 0);
                assert.equal(actual.State.Restarting, false); assert.equal(actual.State.Status, 'created');
                assert(!stopping, 'scope was stopped before startup');
                exitWait = registerWait(profile.socketPath, profile.engine.apiVersion, id, 'next-exit', registration.signal);
                removalWait = registerWait(profile.socketPath, profile.engine.apiVersion, id, 'removed', registration.signal);
                await Promise.all([exitWait.ready, removalWait.ready]);
                assert(!stopping, 'scope was stopped before startup');
                lifetime = await attachLifetime(profile.socketPath, profile.engine.apiVersion, id, attachment.signal);
                lifetimeClosed = attachedClosures.get(lifetime); assert(lifetimeClosed, 'owned lifetime closure required');
                lifetime.once('error', () => { /* Channel loss never becomes successful research. */ });
                assert(!stopping, 'scope was stopped before startup');
                await record({ event: 'scope-start', identity, scopeId: id });
                assert(!stopping, 'scope was stopped before startup');
                starting = true;
                await api('POST', '/containers/' + id + '/start', undefined, startCancellation.signal); startAcknowledged = true;
            })();
            return startRequest;
        },
        wait() {
            assert(starting && startAcknowledged, 'owned operation has not acknowledged start');
            waitRequest ??= (async () => {
                const proof = await confirmStopped();
                lifetime?.destroy();
                return { ...proof, exitCode: stopObservation.exitCode };
            })();
            return waitRequest;
        },
        stop(reason) {
            assert(['completed', 'failed', 'cancelled', 'owner-lost'].includes(reason), 'invalid scope stop reason');
            if (stoppedProof) return Promise.resolve(stoppedProof);
            if (stopRequest) return stopRequest;
            stopping = true;
            stopRequest = (async () => {
                // Lifetime termination precedes metadata and durable callbacks.
                // A registered started-scope observer survives operation abort.
                if (!starting) registration.abort();
                attachment.abort(); lifetime?.end(); startCancellation.abort();
                let escalation, failure, answer;
                const retain = cause => { failure ??= { cause }; };
                const observe = async () => {
                    try {
                        const actual = await inspect();
                        if (starting && exitWait && removalWait && actual.State.Running === true && actual.State.Pid > 0
                            && actual.State.Restarting === false) observedRunning = true;
                        return actual;
                    } catch (error) {
                        // Missing metadata is provisional only. Exit/stop proof
                        // still needs an acknowledged/observed start or inspection.
                        if (error.statusCode !== 404 || !starting || !exitWait || !removalWait) throw error;
                        return undefined;
                    }
                };
                const force = setTimeout(() => {
                    escalation = observe().then(actual => actual?.State.Running
                        ? api('POST', '/containers/' + id + '/kill?signal=SIGKILL') : undefined);
                    void escalation.catch(() => undefined);
                }, 5_000);
                try {
                    await observe();
                    try { await record({ event: 'scope-stop-request', identity, scopeId: id, reason }); }
                    catch (cause) { retain(cause); }
                    if (startRequest) await startRequest.catch(() => undefined);
                    lifetime?.end();
                    try { answer = await confirmStopped(); } catch (cause) { retain(cause); }
                } catch (cause) { retain(cause); }
                finally {
                    clearTimeout(force); lifetime?.destroy();
                    if (escalation) { try { await escalation; } catch (cause) { retain(cause); } }
                    if (!stoppedProof) { try { await closeWaits(); } catch (cause) { retain(cause); } }
                }
                if (failure) throw failure.cause;
                return answer;
            })();
            return stopRequest;
        },
        async remove() {
            assert(stoppedProof, 'confirm stopped scope before cleanup');
            assert(!removed, 'owned scope already removed');
            removeRequest ??= (async () => {
                try {
                    await record({ event: 'scope-remove-start', identity, scopeId: id });
                    if (stopObservation.started === false) {
                        const actual = await inspect();
                        assert.equal(actual.State.Running, false); assert.equal(actual.State.Pid, 0);
                        assert.equal(actual.State.Status, 'created');
                        await api('DELETE', '/containers/' + id + '?force=0&v=0');
                    } else {
                        assert(removalWait, 'registered owned removal observation required');
                        const result = await removalWait.result;
                        assert.equal(result.StatusCode, stopObservation.exitCode, 'owned exit/removal evidence differs');
                        let absent = false;
                        try { await inspect(); }
                        catch (error) { if (error.statusCode !== 404) throw error; absent = true; }
                        assert(absent, 'owned removal observation did not establish absence');
                    }
                    removed = true;
                    await record({ event: 'scope-removed', identity, scopeId: id });
                } finally { await closeWaits(); }
            })();
            return removeRequest;
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
    assert(['corpus', 'review', 'native-control', 'runtime-admission'].includes(mode));
    assert(typeof preflight === 'boolean' && (mode === 'corpus' || !preflight));
    assert(signal instanceof AbortSignal && typeof record === 'function');
    assert.equal(mode === 'native-control', plan.purpose === 'native-control');
    assert.equal(mode === 'runtime-admission', plan.purpose === 'runtime-admission');
    if (mode === 'runtime-admission') {
        require('./sdk-runtime-admission.cjs').requireAdmissionPlan(plan);
        assert(slot && typeof slot === 'object' && !Array.isArray(slot));
        assert.deepEqual(Object.keys(slot), []);
    }
    const operationId = mode === 'corpus' ? 'corpus:' + slot.caseId
        : mode === 'review' ? 'review:' + slot.subjectId + ':r' + slot.repetition
            : mode === 'runtime-admission' ? 'runtime:admission' : 'control:' + slot.caseId;
    const identity = Object.freeze({ ownerId: randomBytes(32).toString('hex'), operationId,
        planSha256: proof.planSha256, implementation: plan.implementation,
        imageSha256: plan.containment.image.slice(7),
        purpose: mode === 'corpus' ? 'corpus-case' : mode === 'review' ? 'paired-review'
            : mode === 'runtime-admission' ? 'runtime-admission' : 'native-control' });
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
    signal.addEventListener('abort', abort, { once: true });
    try {
        fs.mkdirSync(outputDirectory, { mode: 0o700 }); outputDirectory = fs.realpathSync(outputDirectory);
        const bundle = path.join(input, 'plan.bundle');
        bundleSha256 = provenance.materializePlanBundle(root, plan.implementation, proof.planCommit, bundle);
        if (mode === 'runtime-admission') {
            const canary = path.join(input, 'campaign/corpus-v3'); fs.mkdirSync(canary, { recursive: true, mode: 0o700 });
            privateWrite(path.join(canary, 'runtime-control-canary.txt'), 'DUMMY_RUNTIME_ORACLE_CANARY\n');
        }
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
        scope = await createOperationContainment({ root, identity, inputDirectory: input, outputDirectory, record: retained, signal });
        privateWrite(path.join(input, 'invocation.json'), JSON.stringify({ schemaVersion: 1, identity,
            scopeId: scope.scopeId, proof, mode, slot, bundleSha256, preflight }));
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
        if (stopping) await stopping;
        // Cancellation stays live through every awaited cleanup callback. A
        // stop observation is not delivery completion; retain a late explicit
        // cancellation even when the namespace was already confirmed stopped.
        if (!outcome.interrupted && (cancelled || signal.aborted)) {
            outcome.interrupted = true;
            await record({ event: 'operation-incomplete', identity, scopeId: scope.scopeId,
                stoppedConfirmed: confirmed, removed, inputDirectory: input, outputDirectory, preflight,
                reason: 'explicit-cancellation' });
        }
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
            stoppedConfirmed: confirmed, removed, inputDirectory: input, outputDirectory, preflight,
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
