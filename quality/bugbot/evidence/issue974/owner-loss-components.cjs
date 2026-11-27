'use strict';
// Actual private Unix HTTP, modeled Engine/admission. No Docker, SDK or model.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const os = require('node:os'), http = require('node:http'), vm = require('node:vm'), Module = require('node:module');
const { test } = require('node:test');
const { withEngineFixture } = require('./engine-transport-components.cjs');
const sourceFile = path.join(__dirname, 'operation-containment.cjs');
const source = fs.readFileSync(sourceFile, 'utf8'), sourceRequire = Module.createRequire(sourceFile);
const id = 'a'.repeat(64), nextTurn = () => new Promise(resolve => setImmediate(resolve));
// Only controlled fixture readiness/cleanup is bounded; no operation/model runs.
const control = (name, body) => test('ev974-C27 owner-loss ' + name, { timeout: 10000 }, body);
function register(adapter = http) {
    const module = { exports: {} };
    vm.runInNewContext(source + '\nmodule.exports.testWait = registerWait;\n', {
        module, require: name => name === 'node:http' ? adapter : sourceRequire(name), Buffer,
        process, __dirname, AbortController, AbortSignal, setTimeout, clearTimeout,
    }, { filename: sourceFile });
    return module.exports.testWait;
}
function independentWatch(adapter = http) {
    const file = path.join(__dirname, 'containment-native.test.cjs'), module = { exports: {} };
    const nativeRequire = Module.createRequire(file);
    vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testWait = nativeWait;\n', {
        module, require: name => name === 'node:test' ? { test() {} } : name === 'node:http' ? adapter : nativeRequire(name),
        __filename: file, __dirname, process, Buffer, setTimeout, clearTimeout,
    }, { filename: file });
    return module.exports.testWait;
}
const observedEntry = socketPath => ({ plan: { containment: {
    schemaVersion: 1, image: 'sha256:' + 'a'.repeat(64), imageConfigSha256: 'b'.repeat(64),
    hostNodeSha256: 'c'.repeat(64), supervisorSha256: 'd'.repeat(64), socketPath, workerUid: 1000, workerGid: 1000,
    engine: { version: 'fixture', apiVersion: '1.56', os: 'linux', arch: 'fixture', kernelVersion: 'fixture' },
} } });
async function serverFixture(body, controls = {}) {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-wait-observation-')));
    fs.chmodSync(directory, 0o700);
    const socketPath = path.join(directory, 'engine.sock'), connections = new Set();
    let resolveRequest, releaseClose, requestClosed = 0, responseClosed = 0;
    const received = new Promise(resolve => { resolveRequest = resolve; });
    const server = http.createServer((request, response) => { request.resume(); resolveRequest({ request, response }); });
    server.on('upgrade', (request, socket) => { resolveRequest({ request, socket }); });
    server.on('connection', socket => { connections.add(socket); socket.once('close', () => connections.delete(socket)); });
    const adapter = { ...http, request(options, callback) {
        const request = http.request(options, response => {
            response.once('close', () => { responseClosed += 1; }); callback(response);
        });
        if (controls.holdClose) {
            const emit = request.emit; let released = false;
            request.emit = function (event, ...values) {
                if (event === 'close' && !released) {
                    releaseClose = () => { if (!released) { released = true; emit.call(this, event, ...values); } };
                    controls.onCloseHeld(); return true;
                }
                return emit.call(this, event, ...values);
            };
            request.once('error', controls.onError);
        }
        request.once('close', () => { requestClosed += 1; }); return request;
    } };
    try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
        await body({ socketPath, received, register: register(adapter), httpAdapter: adapter, releaseClose() { assert(releaseClose); releaseClose(); },
            closed: () => ({ request: requestClosed, response: responseClosed }) });
    } finally {
        for (const socket of connections) socket.destroy();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
function headers(response) { response.writeHead(200, { 'content-type': 'application/json' }); response.flushHeaders(); }
async function invalidBody(value) {
    await serverFixture(async f => {
        const ticket = f.register(f.socketPath, '1.56', id, 'next-exit', new AbortController().signal);
        const { response } = await f.received; headers(response); response.end(JSON.stringify(value));
        await ticket.ready; await assert.rejects(ticket.result, /invalid|runtime failure/u); await ticket.close();
        assert.equal(f.closed().request, 1); assert.equal(f.closed().response, 1);
    });
}

control('wait acknowledges registration before terminal body and retains observation after later abort', async () => {
    await serverFixture(async f => {
        const cancellation = new AbortController(), ticket = f.register(f.socketPath, '1.56', id, 'next-exit', cancellation.signal);
        const { request, response } = await f.received;
        assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1.56/containers/' + id + '/wait?condition=next-exit');
        headers(response); await ticket.ready;
        let settled = false; void ticket.result.then(() => { settled = true; }, () => { settled = true; });
        await nextTurn(); assert.equal(settled, false);
        cancellation.abort(); response.end(JSON.stringify({ StatusCode: 143, Error: { Message: '' } }));
        assert.equal((await ticket.result).StatusCode, 143); await ticket.close();
        assert.equal(f.closed().request, 1); assert.equal(f.closed().response, 1);
    });
});
control('already cancelled registration dispatches no request', async () => {
    let calls = 0; const cancellation = new AbortController(); cancellation.abort();
    const ticket = register({ request() { calls += 1; throw Error('must not dispatch'); } })('/private/tmp/unused.sock', '1.56', id, 'removed', cancellation.signal);
    await assert.rejects(ticket.ready, /cancelled/u); await assert.rejects(ticket.result, /cancelled/u); await ticket.close(); assert.equal(calls, 0);
});
control('cancellation before headers settles both promises and closes the issued request', async () => {
    await serverFixture(async f => {
        const cancellation = new AbortController(), ticket = f.register(f.socketPath, '1.56', id, 'removed', cancellation.signal);
        await f.received; cancellation.abort();
        await assert.rejects(ticket.ready, /cancelled/u); await assert.rejects(ticket.result, /cancelled/u); await ticket.close();
        assert.equal(f.closed().request, 1); assert.equal(f.closed().response, 0);
    });
});
control('non200 registration cannot acknowledge either boundary', async () => {
    await serverFixture(async f => {
        const ticket = f.register(f.socketPath, '1.56', id, 'next-exit', new AbortController().signal);
        const { response } = await f.received; response.writeHead(500); response.end('{}');
        await assert.rejects(ticket.ready, /not acknowledged/u); await assert.rejects(ticket.result, /not acknowledged/u); await ticket.close();
        assert.equal(f.closed().request, 1); assert.equal(f.closed().response, 1);
    });
});
control('malformed JSON cannot become terminal evidence', async () => {
    await serverFixture(async f => {
        const ticket = f.register(f.socketPath, '1.56', id, 'next-exit', new AbortController().signal);
        const { response } = await f.received; headers(response); response.end('{invalid');
        await ticket.ready; await assert.rejects(ticket.result, /invalid/u); await ticket.close();
    });
});
control('closed terminal schema rejects invalid exit and runtime error forms', async () => {
    for (const value of [null, [], {}, { StatusCode: -1 }, { StatusCode: 0.5 }, { StatusCode: '0' },
        { StatusCode: Number.MAX_SAFE_INTEGER + 1 }, { StatusCode: 0, extra: true }, { StatusCode: 0, Error: null },
        { StatusCode: 0, Error: {} }, { StatusCode: 0, Error: { Message: 1 } }, { StatusCode: 0, Error: { Message: '', extra: true } }]) await invalidBody(value);
});
control('runtime error fails without exposing provider payload', async () => {
    await serverFixture(async f => {
        const ticket = f.register(f.socketPath, '1.56', id, 'removed', new AbortController().signal);
        const { response } = await f.received; headers(response);
        response.end(JSON.stringify({ StatusCode: 0, Error: { Message: 'PRIVATE_PROVIDER_PAYLOAD_SENTINEL' } }));
        await ticket.ready; await assert.rejects(ticket.result, error => /runtime failure/u.test(error.message) && !error.message.includes('PRIVATE_PROVIDER'));
        await ticket.close();
    });
});
control('truncated body fails after successful registration and closes callbacks', async () => {
    await serverFixture(async f => {
        const ticket = f.register(f.socketPath, '1.56', id, 'next-exit', new AbortController().signal);
        const { response } = await f.received; headers(response); await ticket.ready;
        response.write('{"StatusCode":'); response.destroy();
        await assert.rejects(ticket.result, /aborted|closed/u); await ticket.close();
        assert.equal(f.closed().request, 1); assert.equal(f.closed().response, 1);
    });
});
control('oversized valid JSON is stopped by the metadata bound', async () => {
    await serverFixture(async f => {
        const ticket = f.register(f.socketPath, '1.56', id, 'next-exit', new AbortController().signal);
        const { response } = await f.received; headers(response);
        response.end(JSON.stringify({ StatusCode: 0, Error: { Message: 'x'.repeat(2 * 1024 * 1024) } }));
        await ticket.ready; await assert.rejects(ticket.result, /exceeded/u); await ticket.close();
    });
});
control('transport connection failure settles both boundaries', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-missing-wait-'));
    try {
        const ticket = register()(path.join(directory, 'missing.sock'), '1.56', id, 'removed', new AbortController().signal);
        await assert.rejects(ticket.ready); await assert.rejects(ticket.result); await ticket.close();
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
control('synchronous transport failure settles closure without an issued request', async () => {
    const failure = new Error('controlled request constructor failure');
    const ticket = register({ request() { throw failure; } })('/private/tmp/unused.sock', '1.56', id, 'removed', new AbortController().signal);
    await assert.rejects(ticket.ready, error => error === failure); await assert.rejects(ticket.result, error => error === failure); await ticket.close();
});
control('disposing a registered observation awaits closure and prevents late terminal authority', async () => {
    await serverFixture(async f => {
        const ticket = f.register(f.socketPath, '1.56', id, 'removed', new AbortController().signal);
        const { response } = await f.received; headers(response); await ticket.ready;
        let successes = 0, failures = 0; void ticket.result.then(() => { successes += 1; }, () => { failures += 1; });
        await ticket.close(); response.end(JSON.stringify({ StatusCode: 0 })); await nextTurn();
        assert.equal(successes, 0); assert.equal(failures, 1); assert.equal(f.closed().request, 1); assert.equal(f.closed().response, 1);
    });
});

const noDelete = f => assert.equal(f.requests.filter(row => row.method === 'DELETE').length, 0);
control('complete scope registers both observations before start and uses daemon removal', async () => {
    await withEngineFixture({ completeOnStart: true }, async f => {
        const scope = await f.create(); await scope.start(); assert.equal((await scope.wait()).exitCode, 0); await scope.remove();
        assert.equal(f.config.HostConfig.AutoRemove, true); assert.equal(f.removed, true); noDelete(f);
        const start = f.requests.findIndex(row => row.route.endsWith('/start'));
        for (const condition of ['next-exit', 'removed']) assert(f.requests.findIndex(row => row.route.endsWith('/wait?condition=' + condition)) < start);
        assert.equal(f.events.find(row => row.event === 'scope-stopped').namespaceState.source, 'registered-next-exit');
        assert.equal(f.activeClientRequests, 0); assert.equal(f.ownerChannelClosed, true);
    });
});
control('owner channel loss releases a started scope without host stop or delete', async () => {
    await withEngineFixture({ waitResult: { StatusCode: 143 } }, async f => {
        const scope = await f.create(); await scope.start(); f.loseOwner();
        assert.equal((await scope.wait()).exitCode, 143); await scope.remove();
        assert.equal(f.removed, true); noDelete(f); assert.equal(f.events.some(row => row.event === 'scope-stop-request'), false);
    });
});
control('namespace exit alone cannot settle pending daemon removal', async () => {
    await withEngineFixture({ completeOnStart: true, holdRemoval: true }, async f => {
        const scope = await f.create(); await scope.start(); await scope.wait();
        let settled = false; const removing = scope.remove().then(() => { settled = true; }); void removing.catch(() => undefined);
        await nextTurn(); assert.equal(settled, false); assert.equal(f.removed, false); noDelete(f);
        f.releaseRemoval(); await removing; assert.equal(f.activeClientRequests, 0); assert.equal(f.ownerChannelClosed, true);
    });
});
control('cancelled pending registration never starts and removes only the created scope', async () => {
    let held; const pending = new Promise(resolve => { held = resolve; });
    await withEngineFixture({ holdWaitRegistration: 'next-exit', onHeldRegistration: held }, async f => {
        const scope = await f.create(), starting = scope.start().then(() => null, error => error);
        await pending; const terminal = await scope.stop('cancelled'); assert.equal(terminal.namespaceInitStopped, true);
        assert(await starting); await scope.remove(); f.releaseRegistration();
        assert.equal(f.requests.some(row => row.route.endsWith('/start')), false);
        assert.equal(f.requests.filter(row => row.method === 'DELETE').length, 1); assert.equal(f.activeClientRequests, 0);
    });
});
control('cancelled start-record callback cannot dispatch a later start', async () => {
    let scope, stopping;
    await withEngineFixture({ onRecord(event) { if (event.event === 'scope-start') { stopping = scope.stop('cancelled'); void stopping.catch(() => undefined); } } }, async f => {
        scope = await f.create(); await assert.rejects(scope.start(), /stopped before startup/u); await stopping; await scope.remove();
        assert.equal(f.requests.some(row => row.route.endsWith('/start')), false); assert.equal(f.activeClientRequests, 0);
    });
});
control('cancellation settles an unacknowledged start and retains inspected stop evidence', async () => {
    let held; const pending = new Promise(resolve => { held = resolve; });
    await withEngineFixture({ holdStartReply: true, holdRemoval: true, onHeldStart: held }, async f => {
        const scope = await f.create(), starting = scope.start().then(() => null, error => error);
        await pending; await scope.stop('cancelled'); assert(await starting);
        const observed = f.events.find(row => row.event === 'scope-stopped');
        assert.equal(observed.startAcknowledged, false); assert.equal(observed.namespaceState.source, 'inspection');
        f.releaseRemoval(); await scope.remove(); f.releaseStart(); noDelete(f); assert.equal(f.activeClientRequests, 0);
    });
});
control('lost start reply needs an actual running observation before registered exit proof', async () => {
    await withEngineFixture({ lostStartReply: true, ignoreLifetimeEof: true, escalateOnWait: true }, async f => {
        const scope = await f.create(); await assert.rejects(scope.start()); assert.throws(() => scope.wait());
        await scope.stop('failed'); await scope.remove(); noDelete(f);
        const observed = f.events.find(row => row.event === 'scope-stopped');
        assert.equal(observed.startAcknowledged, false); assert.equal(observed.started, true);
        assert.equal(observed.namespaceState.source, 'registered-next-exit');
        assert.equal(f.requests.filter(row => row.route.includes('/kill?')).length, 1);
    });
});
control('lost start reply followed by absence cannot grant stop or removal authority', async () => {
    await withEngineFixture({ lostStartReply: true, completeOnStart: true }, async f => {
        const scope = await f.create(); await assert.rejects(scope.start()); await f.whenRemoved();
        await assert.rejects(scope.stop('failed')); await assert.rejects(scope.remove()); noDelete(f);
        assert.equal(f.events.some(row => row.event === 'scope-stopped'), false); assert.equal(f.activeClientRequests, 0);
    });
});
control('unexpected successful HTTP status cannot grant start acknowledgment', async () => {
    await withEngineFixture({ startStatus: 202, ignoreLifetimeEof: true, escalateOnWait: true }, async f => {
        const scope = await f.create(); await assert.rejects(scope.start(), /HTTP 202/u); assert.throws(() => scope.wait());
        await scope.stop('failed'); await scope.remove(); noDelete(f);
        assert.equal(f.events.find(row => row.event === 'scope-stopped').startAcknowledged, false);
    });
});
control('changed ownership after start remains uncertain despite lifetime termination', async () => {
    let armed = false;
    await withEngineFixture({ holdRemoval: true, inspect(actual) { if (armed) actual.Config.Labels = {}; } }, async f => {
        const scope = await f.create(); await scope.start(); armed = true;
        await assert.rejects(scope.stop('failed'), /ownership changed/u); await assert.rejects(scope.remove()); noDelete(f);
        assert.equal(f.events.some(row => row.event === 'scope-stopped'), false); assert.equal(f.activeClientRequests, 0);
        f.releaseRemoval(); await f.whenRemoved();
    });
});
control('mismatched exit and removal results fail without replaying cleanup', async () => {
    await withEngineFixture({ completeOnStart: true, removalResult: { StatusCode: 1 } }, async f => {
        const scope = await f.create(); await scope.start(); await scope.wait();
        await assert.rejects(scope.remove(), /differs/u); await assert.rejects(scope.remove(), /differs/u); noDelete(f);
        assert.equal(f.events.filter(row => row.event === 'scope-remove-start').length, 1);
        assert.equal(f.events.some(row => row.event === 'scope-removed'), false); assert.equal(f.activeClientRequests, 0);
    });
});
control('never-started cleanup requires inspected created state and one owned delete', async () => {
    await withEngineFixture({}, async f => {
        const scope = await f.create(); await scope.stop('cancelled'); await scope.remove();
        assert.equal(f.events.find(row => row.event === 'scope-stopped').started, false);
        assert.equal(f.requests.some(row => row.route.endsWith('/start') || row.route.includes('/wait?')), false);
        assert.equal(f.requests.filter(row => row.method === 'DELETE').length, 1); assert.equal(f.activeClientRequests, 0);
    });
});
control('failed removal record closes observers while retaining incomplete delivery', async () => {
    await withEngineFixture({ completeOnStart: true, holdRemoval: true, recordFailure: 'scope-remove-start' }, async f => {
        const scope = await f.create(); await scope.start(); await scope.wait();
        await assert.rejects(scope.remove(), /durable record failure/u); await assert.rejects(scope.remove(), /durable record failure/u);
        assert.equal(f.activeClientRequests, 0); assert.equal(f.ownerChannelClosed, true); noDelete(f);
        assert.equal(f.events.filter(row => row.event === 'scope-remove-start').length, 1);
        assert.equal(f.events.some(row => row.event === 'scope-removed'), false);
        f.releaseRemoval(); await f.whenRemoved();
    });
});

control('cancelled pending attachment waits for its held close callback before rejection', async () => {
    let errorSeen, closeSeen;
    const observedError = new Promise(resolve => { errorSeen = resolve; }), observedClose = new Promise(resolve => { closeSeen = resolve; });
    await serverFixture(async f => {
        const module = { exports: {} };
        vm.runInNewContext(source + '\nmodule.exports.testAttach = attachLifetime;\n', {
            module, require: name => name === 'node:http' ? f.httpAdapter : sourceRequire(name), Buffer,
            process, __dirname, AbortController, AbortSignal, setTimeout, clearTimeout,
        }, { filename: sourceFile });
        const cancellation = new AbortController();
        const attachment = module.exports.testAttach(f.socketPath, '1.56', id, cancellation.signal);
        let settled = false; void attachment.then(() => { settled = true; }, () => { settled = true; });
        await f.received; cancellation.abort(); await observedError; await observedClose;
        try {
            await Promise.resolve();
            assert.equal(settled, false, 'attachment rejection must await its actual owned close callback');
        } finally { f.releaseClose(); await assert.rejects(attachment, /cancelled/u); }
        assert.equal(f.closed().request, 1);
    }, { holdClose: true, onError: errorSeen, onCloseHeld: closeSeen });
});

control('independent native-host observer sees exit and removal without calling host cleanup', async () => {
    await withEngineFixture({ waitResult: { StatusCode: 143 } }, async f => {
        const scope = await f.create(); await scope.start();
        const watch = independentWatch(), entry = { plan: { containment: f.profile } };
        const exit = watch(entry, scope.scopeId, 'next-exit'), removed = watch(entry, scope.scopeId, 'removed');
        try {
            await Promise.all([exit.registered, removed.registered]); f.loseOwner();
            assert.equal((await exit.result).StatusCode, 143); assert.equal((await removed.result).StatusCode, 143);
            await scope.wait(); await scope.remove(); noDelete(f);
        } finally { await Promise.all([exit.close(), removed.close()]); }
    });
});
control('independent native-host observer rejects malformed failed truncated and oversized evidence', async () => {
    for (const mode of ['http', 'json', 'exit', 'runtime', 'truncated', 'oversized']) {
        await serverFixture(async f => {
            const observation = independentWatch(f.httpAdapter)(observedEntry(f.socketPath), id, 'next-exit');
            const { response } = await f.received;
            if (mode === 'http') {
                response.writeHead(500); response.end('{}'); await assert.rejects(observation.registered);
            } else {
                headers(response); await observation.registered;
                if (mode === 'truncated') { response.write('{"StatusCode":'); response.destroy(); }
                else if (mode === 'json') response.end('{invalid');
                else response.end(JSON.stringify(mode === 'exit' ? { StatusCode: '0' } :
                    { StatusCode: 0, Error: { Message: mode === 'oversized' ? 'x'.repeat(2 * 1024 * 1024) : 'PRIVATE_PROVIDER_SENTINEL' } }));
            }
            await assert.rejects(observation.result, error => !error.message.includes('PRIVATE_PROVIDER_SENTINEL'));
            await observation.close(); assert.equal(f.closed().request, 1); assert.equal(f.closed().response, 1);
        });
    }
});
