'use strict';
// Component-only Unix HTTP engine fixture. Never contacts Docker or grants SDK admission.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), vm = require('node:vm'), crypto = require('node:crypto'), Module = require('node:module');
const root = path.resolve(__dirname, '../../../..'), file = path.join(root, 'quality/bugbot/evidence/issue974/operation-containment.cjs');
const hash = b => crypto.createHash('sha256').update(b).digest('hex'), raw = fs.readFileSync(file, 'utf8');
function canonical(v) { if (Array.isArray(v))
    return v.map(canonical); if (v && typeof v === 'object')
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])); return v; }
const objectHash = v => hash(JSON.stringify(canonical(v)));
async function fixture(options = {}) {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-http-')));
    fs.chmodSync(directory, 0o700);
    const socket = path.join(directory, 'engine.sock'), input = path.join(directory, 'input'), output = path.join(directory, 'output');
    fs.mkdirSync(input, { mode: 0o700 });
    fs.mkdirSync(output, { mode: 0o700 });
    const supervisor = path.join(directory, 'quality/bugbot/evidence/issue974/qualification-supervisor.cjs');
    fs.mkdirSync(path.dirname(supervisor), { recursive: true });
    fs.writeFileSync(supervisor, '// component supervisor byte marker\n');
    const engine = { version: 'fixture', apiVersion: '1.56', os: 'linux', arch: 'arm64', kernelVersion: 'fixture' }, image = 'sha256:' + 'a'.repeat(64), imageConfig = { Env: ['PATH=/usr/local/bin:/usr/bin:/bin'], Volumes: null };
    const profile = { schemaVersion: 1, image, imageConfigSha256: objectHash(imageConfig), hostNodeSha256: hash(fs.readFileSync(process.execPath)), socketPath: socket, supervisorSha256: hash(fs.readFileSync(supervisor)), workerUid: process.getuid(), workerGid: process.getgid(), engine };
    const plan = { implementation: 'd'.repeat(40), purpose: options.purpose ?? 'native-control', containment: profile, repositoryCohort: { order: ['U1'] }, ...options.planDelta }, planFile = path.join(directory, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify(plan));
    const proof = { planPath: 'plan.json', planSha256: hash(fs.readFileSync(planFile)), planCommit: 'e'.repeat(40) };
    const identity = { ownerId: 'b'.repeat(64), operationId: 'control:C27', planSha256: proof.planSha256, implementation: plan.implementation, imageSha256: image.slice(7), purpose: 'native-control' };
    const id = 'f'.repeat(64), requests = [], events = [], clientRequests = new Set(), connections = new Set(), waiters = [], exitWaiters = [], removalWaiters = [], timers = [];
    let config, running = false, pid = 0, status = 'created', removed = false, lifetime, ownerChannel, hasRun = false, stdinClosed = false;
    let releaseRemoval, releaseStart, releaseRegistration, resolveRemoved;
    const whenRemoved = new Promise(resolve => { resolveRemoved = resolve; });
    let lifetimeEnds = 0, attachDestructions = 0;
    function json(response, value, code = 200) {
        if (response.destroyed) return;
        if (!response.headersSent) response.writeHead(code, { 'content-type': 'application/json' });
        response.end(JSON.stringify(value));
    }
    function removeNow() {
        if (removed) return;
        removed = true; resolveRemoved();
        for (const response of removalWaiters.splice(0)) json(response, options.removalResult ?? options.waitResult ?? { StatusCode: 0 });
        // Docker removal also wakes next-exit on a never-started container.
        for (const response of exitWaiters.splice(0)) json(response, options.waitResult ?? { StatusCode: 0 });
    }
    function stopped() {
        if (!hasRun || status === 'exited') return;
        running = false; pid = 0; status = 'exited';
        for (const response of [...waiters.splice(0), ...exitWaiters.splice(0)]) json(response, options.waitResult ?? { StatusCode: 0 });
        if (config.HostConfig.AutoRemove) {
            if (options.holdRemoval) { releaseRemoval = removeNow; options.onHeldRemoval?.(removeNow); }
            else setImmediate(removeNow);
        }
    }
    const server = http.createServer((request, response) => {
        const chunks = [];
        request.on('data', c => chunks.push(c));
        request.on('end', () => {
            const route = request.url.replace('/v1.56', '');
            requests.push({ method: request.method, route });
            if (options.httpFailure === route) {
                response.writeHead(500);
                response.end('{}');
                return;
            }
            if (options.invalidJson === route) {
                response.end('{invalid');
                return;
            }
            if (options.oversized === route) {
                response.end('x'.repeat(2000001));
                return;
            }
            if (route === '/version')
                return json(response, { Version: engine.version, ApiVersion: engine.apiVersion, Os: engine.os, Arch: engine.arch, KernelVersion: engine.kernelVersion, ...options.engineDelta });
            if (route.startsWith('/images/'))
                return json(response, { Id: image, Config: imageConfig, Os: 'linux', Architecture: 'arm64', ...options.imageDelta });
            if (route.startsWith('/containers/create?')) {
                config = JSON.parse(Buffer.concat(chunks));
                if (options.lostCreateReply) {
                    response.destroy();
                    return;
                }
                return json(response, { Id: options.unknownCreateId ? 'unknown' : id }, 201);
            }
            if (route === '/containers/' + id + '/json') {
                const actual = removed ? undefined : { Id: id, Image: image, Config: { ...config }, HostConfig: config.HostConfig, Mounts: config.HostConfig.Mounts.map(m => ({ Destination: m.Target, Source: m.Source, Type: m.Type, Mode: '', Propagation: m.BindOptions.Propagation, RW: !m.ReadOnly })), State: { Running: running, Pid: pid, Restarting: false, Status: status, ExitCode: 0 } };
                if (actual) options.inspect?.(actual, { running, pid, status });
                const reply = () => actual ? json(response, actual) : json(response, {}, 404);
                // A held metadata response can authoritatively be404 too.
                // Never substitute a live/stopped container just for a test.
                if (options.holdInspection?.()) { options.onHeldInspection(reply); return; }
                return reply();
            }
            if (route === '/containers/' + id + '/start') {
                running = true; hasRun = true; pid = 123; status = 'running';
                const reply = () => { if (!response.destroyed) { response.writeHead(options.startStatus ?? 204); response.end(); } };
                if (options.holdStartReply) { releaseStart = reply; options.onHeldStart?.(reply); }
                else if (options.lostStartReply) response.destroy();
                else reply();
                if (options.completeOnStart || stdinClosed && !options.ignoreLifetimeEof) setImmediate(stopped);
                return;
            }
            if (['next-exit', 'removed'].some(condition => route === '/containers/' + id + '/wait?condition=' + condition)) {
                const condition = route.slice(route.lastIndexOf('=') + 1);
                const register = () => {
                    if (response.destroyed) return;
                    response.writeHead(200, { 'content-type': 'application/json' }); response.flushHeaders();
                    if (removed) { json(response, options.removalResult ?? options.waitResult ?? { StatusCode: 0 }); return; }
                    (condition === 'next-exit' ? exitWaiters : removalWaiters).push(response);
                };
                if (options.holdWaitRegistration === condition) { releaseRegistration = register; options.onHeldRegistration?.(register); }
                else register();
                return;
            }
            if (route === '/containers/' + id + '/wait?condition=not-running') {
                if (!running)
                    return json(response, options.waitResult ?? { StatusCode: 0 });
                waiters.push(response);
                if (options.escalateOnWait)
                    for (const timer of timers.splice(0))
                        timer.callback();
                return;
            }
            if (route === '/containers/' + id + '/kill?signal=SIGKILL') {
                stopped();
                response.writeHead(204);
                response.end();
                return;
            }
            if (route === '/containers/' + id + '?force=0&v=0' && request.method === 'DELETE') {
                removeNow();
                response.writeHead(204);
                response.end();
                return;
            }
            response.writeHead(404);
            response.end('{}');
        });
    });
    server.on('connection', connection => { connections.add(connection); connection.once('close', () => connections.delete(connection)); });
    server.on('upgrade', (request, connection) => {
        requests.push({ method: request.method, route: request.url.replace('/v1.56', '') });
        lifetime = connection;
        if (options.attachResponse) {
            connection.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n');
            return;
        }
        if (options.holdAttachment) { options.onHeldAttachment(() => connection.destroy()); return; }
        connection.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n' + (options.attachHead ? 'unexpected' : ''));
        connection.on('data', () => { });
        connection.on('end', () => { stdinClosed = true; if (!options.ignoreLifetimeEof) stopped(); });
    });
    try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
    }
    catch (error) {
        fs.rmSync(directory, { recursive: true, force: true });
        throw error;
    }
    const nativeRequire = Module.createRequire(file), module = { exports: {} }, provenance = { requireBootstrapAdmission: where => { assert.equal(where, directory); return proof; }, materializePlanBundle: (where, x, y, dest) => { fs.writeFileSync(dest, 'unit bundle'); return hash('unit bundle'); }, retainBootstrapScope: () => { }, confirmBootstrapScopeStopped: () => { } };
    const isolatedProcess = Object.create(process);
    Object.defineProperty(isolatedProcess, 'env', { value: options.environment ?? {}, writable: false });
    const authFile = path.join(directory, 'unit-auth.json');
    fs.writeFileSync(authFile, 'COMPONENT_ONLY_SESSION');
    const observedHttp = { ...http, request(...args) {
        const req = http.request(...args);
        clientRequests.add(req); req.once('close', () => clientRequests.delete(req));
        if (args[0]?.path?.includes('/attach?')) {
            const destroy = req.destroy;
            req.destroy = function (...values) { attachDestructions += 1; return destroy.apply(this, values); };
            req.once('upgrade', (_response, socket) => {
                ownerChannel = socket;
                const end = socket.end;
                socket.end = function (...values) { lifetimeEnds += 1; return end.apply(this, values); };
            });
        }
        return req;
    } };
    const context = { module, require: name => name === 'node:http' ? observedHttp : name === '../issue-950/execution-provenance.cjs' ? provenance : name === '../issue-950/ev07-shadow/load.cjs' ? {} : name.endsWith('/src/data/repository/agent_authentication') ? { buildAgentCliEnvironment: () => options.selectedCredentials ?? {}, codexChatGptSessionFile: () => options.sessionFile ? authFile : undefined } : name.endsWith('/src/data/repository/agent_credential_policy') ? { allowedCredentialVariables: () => ['OPENAI_API_KEY'] } : nativeRequire(name), process: isolatedProcess, Buffer, AbortController, AbortSignal, __dirname: path.dirname(file), __coverage__: globalThis.__coverage__, setTimeout: (callback, delay) => { assert.equal(delay, 5000); const timer = { callback }; timers.push(timer); if (options.escalateOnWait) setImmediate(() => { const index = timers.indexOf(timer); if (index >= 0) { timers.splice(index, 1); callback(); } }); return timer; }, clearTimeout: timer => { const index = timers.indexOf(timer); if (index >= 0)
            timers.splice(index, 1); } };
    vm.runInNewContext(raw, context, { filename: file });
    const record = async (event) => { events.push(JSON.parse(JSON.stringify(event))); if (event.event === 'operation-start') {
        const credentials = JSON.parse(fs.readFileSync(path.join(event.inputDirectory, 'private-credentials.json')));
        assert.deepEqual(credentials.environment, options.selectedCredentials?.OPENAI_API_KEY === undefined ? {} : { OPENAI_API_KEY: options.selectedCredentials.OPENAI_API_KEY });
        assert.equal(credentials.codexAuth, options.sessionFile ? 'COMPONENT_ONLY_SESSION' : null);
    } if (options.recordFailure === event.event)
        throw Error('unit durable record failure'); if (options.onRecord) await options.onRecord(event); };
    return { api: module.exports, directory, input, output, identity, profile, plan, requests, events, proof, get lifetimeEnds() { return lifetimeEnds; }, get attachDestructions() { return attachDestructions; }, get running() { return running; }, get removed() { return removed; }, get config() { return config; }, get activeClientRequests() { return clientRequests.size; }, get ownerChannelClosed() { return ownerChannel?.closed ?? true; }, record,
        whenRemoved() { return whenRemoved; },
        loseOwner() { assert(ownerChannel); ownerChannel.destroy(); },
        finish() { stopped(); }, releaseRemoval() { assert(releaseRemoval); releaseRemoval(); },
        releaseStart() { assert(releaseStart); releaseStart(); }, releaseRegistration() { assert(releaseRegistration); releaseRegistration(); },
        async create() { return module.exports.createOperationContainment({ root: directory, identity, inputDirectory: input, outputDirectory: output, record }); },
        async close() { lifetime?.destroy(); for (const connection of connections)
            connection.destroy(); await new Promise(resolve => server.close(resolve)); for (const event of events.filter(e => e.event === 'operation-incomplete' && e.inputDirectory)) {
            const staging = path.dirname(event.inputDirectory);
            assert(path.basename(staging).startsWith('bugbot-owned-operation-'));
            if (fs.existsSync(staging)) {
                assert.equal(fs.lstatSync(staging).uid, process.getuid());
                fs.rmSync(staging, { recursive: true, force: true });
            }
        } fs.rmSync(directory, { recursive: true, force: true }); } };
}
async function use(options, body) { const f = await fixture(options); try {
    await body(f);
}
finally {
    await f.close();
} }
async function exerciseEngineTransportFaults() {
    await use({ completeOnStart: true }, async (f) => { const scope = await f.create(); assert.throws(() => scope.wait()); assert.throws(() => scope.stop('invalid')); await assert.rejects(scope.remove()); await scope.start(); assert.throws(() => scope.start()); const first = scope.wait(), second = scope.wait(); assert.equal(first, second); const end = await first; assert.equal(end.namespaceInitStopped, true); assert.equal(end.exitCode, 0); assert.equal((await scope.stop('completed')).scopeId, scope.scopeId); await scope.remove(); assert.equal(f.removed, true); await assert.rejects(scope.remove()); });
    for (const escalated of [false, true])
        await use({ ignoreLifetimeEof: escalated, escalateOnWait: escalated }, async (f) => { const scope = await f.create(); await scope.start(); const first = scope.stop('cancelled'), again = scope.stop('failed'); assert.equal(first, again); assert.equal((await first).namespaceInitStopped, true); await scope.remove(); assert.equal(f.requests.filter(r => r.route.includes('/kill?')).length, escalated ? 1 : 0); });
    await use({}, async (f) => { const scope = await f.create(); const start = scope.start(); const stop = scope.stop('cancelled'); await assert.rejects(start); await stop; await scope.remove(); assert.equal(f.requests.filter(r => r.route.endsWith('/start')).length, 0); });
    for (const option of [{ unknownCreateId: true }, { lostCreateReply: true }, { httpFailure: '/version' }, { invalidJson: '/version' }, { oversized: '/version' }, { engineDelta: { Version: 'foreign' } }, { imageDelta: { Id: 'sha256:' + '0'.repeat(64) } }, { imageDelta: { Architecture: 'foreign' } }, { imageDelta: { Config: { Env: [], Volumes: { '/unreviewed': {} } } } }])
        await use(option, async (f) => { await assert.rejects(f.create()); assert.equal(f.requests.filter(r => r.method === 'POST' && r.route.includes('create?')).length, option.unknownCreateId || option.lostCreateReply ? 1 : 0); assert.equal(f.requests.filter(r => r.method === 'DELETE').length, 0); });
    for (const option of [{ attachResponse: true }, { attachHead: true }, { httpFailure: '/containers/' + 'f'.repeat(64) + '/start' }])
        await use(option, async (f) => { const scope = await f.create(); await assert.rejects(scope.start()); await scope.stop('failed'); await scope.remove(); assert.equal(f.removed, true); });
    for (const alter of [a => a.Id = '0'.repeat(64), a => a.Image = 'sha256:' + '0'.repeat(64), a => a.Config.Labels = {}, a => a.Config.OpenStdin = false, a => a.HostConfig.Privileged = true, a => a.Config.Entrypoint = ['foreign'], a => a.Config.Cmd = ['foreign'], a => a.Config.Env = ['SECRET=foreign'], a => a.HostConfig.RestartPolicy = { Name: 'always' }, a => a.Mounts[0].RW = true])
        await use({ inspect: alter }, async (f) => { const scope = await f.create(); await assert.rejects(scope.start()); await assert.rejects(scope.stop('failed')); assert.equal(f.requests.filter(r => r.method === 'DELETE' || r.route.endsWith('/start')).length, 0); });
    for (const alter of [a => a.State.Pid = 123, a => a.State.Restarting = true, a => a.State.Status = 'unknown', a => a.State.Running = true])
        await use({ inspect: alter }, async (f) => { const scope = await f.create(); await assert.rejects(scope.stop('failed')); await assert.rejects(scope.remove()); assert.equal(f.removed, false); });
    for (const option of [{ recordFailure: 'scope-created' }, { recordFailure: 'scope-start' }])
        await use(option, async (f) => { if (option.recordFailure === 'scope-created') {
            await assert.rejects(f.create(), /creation record failed/);
            return;
        } const scope = await f.create(); await assert.rejects(scope.start()); await scope.stop('failed'); await scope.remove(); });
    await use({ completeOnStart: true, waitResult: { StatusCode: 1, Error: { Message: 'runtime failure' } } }, async (f) => { const scope = await f.create(); await scope.start(); await assert.rejects(scope.wait(), /runtime failure/); await assert.rejects(scope.stop('failed')); await assert.rejects(scope.remove()); assert.equal(f.events.some(row => row.event === 'scope-stopped'), false); assert.equal(f.requests.filter(row => row.method === 'DELETE').length, 0); });
    for (const aborted of [false, true])
        await use({ completeOnStart: !aborted }, async (f) => { const cancel = new AbortController(); if (aborted)
            cancel.abort(); const result = await f.api.runContainedOperation({ root: f.directory, plan: f.plan, mode: 'native-control', slot: { caseId: 'ev974-C32' }, outputDirectory: path.join(f.directory, 'outer-output'), record: f.record, signal: cancel.signal }); assert.equal(result.interrupted, aborted); assert.equal(result.namespaceInitStopped, true); assert.equal(f.removed, true); });
    for (const configuration of [{ mode: 'corpus', purpose: 'qualification', preflight: true, selectedCredentials: { OPENAI_API_KEY: 'COMPONENT_ONLY_KEY', UNRELATED: 'MUST_NOT_COPY' }, sessionFile: true }, { mode: 'corpus', purpose: 'qualification', environment: {} }, { mode: 'review', purpose: 'qualification', environment: { COPILOT_EVIDENCE_TOKEN: 'COMPONENT_ONLY_EVIDENCE' } }, { mode: 'review', purpose: 'qualification', environment: { GH_TOKEN: 'COMPONENT_ONLY_FALLBACK' } }, { mode: 'review', purpose: 'qualification', environment: { GITHUB_TOKEN: 'COMPONENT_ONLY_OTHER' } }, { mode: 'review', purpose: 'qualification', environment: {} }])
        await use({ ...configuration, completeOnStart: true }, async (f) => { const campaign = path.join(f.directory, 'campaign'); fs.mkdirSync(path.join(campaign, 'corpus-v3'), { recursive: true }); fs.mkdirSync(path.join(campaign, 'fixtures/full-review/U1'), { recursive: true }); fs.writeFileSync(path.join(campaign, 'corpus-v3/unit.txt'), 'COMPONENT_SOURCE'); const result = await f.api.runContainedOperation({ root: f.directory, plan: f.plan, mode: configuration.mode, slot: configuration.mode === 'review' ? { subjectId: 'U1', repetition: 1 } : { caseId: 'component-case' }, outputDirectory: path.join(f.directory, 'outer-output'), record: f.record, signal: new AbortController().signal, campaign, preflight: configuration.preflight ?? false }); assert.equal(result.interrupted, false); assert.equal(result.exitCode, 0); assert.equal(f.removed, true); });
    await use({ unknownCreateId: true }, async (f) => { await assert.rejects(f.api.runContainedOperation({ root: f.directory, plan: f.plan, mode: 'native-control', slot: { caseId: 'ev974-C32' }, outputDirectory: path.join(f.directory, 'outer-output'), record: f.record, signal: new AbortController().signal })); assert.equal(f.events.at(-1).scopeId, null); assert.equal(f.events.at(-1).removed, false); assert.equal(fs.existsSync(f.events.at(-1).inputDirectory), true); assert.equal(f.requests.filter(r => r.method === 'DELETE').length, 0); });
    await use({ recordFailure: 'scope-created' }, async (f) => { await assert.rejects(f.api.runContainedOperation({ root: f.directory, plan: f.plan, mode: 'native-control', slot: { caseId: 'ev974-C32' }, outputDirectory: path.join(f.directory, 'outer-output'), record: f.record, signal: new AbortController().signal }), /creation record failed/); assert.equal(f.removed, true); assert.equal(f.events.at(-1).event, 'operation-incomplete'); assert.equal(f.events.at(-1).stoppedConfirmed, true); });
}
module.exports = { exerciseEngineTransportFaults, withEngineFixture: use };
