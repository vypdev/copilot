'use strict';
// Exact-source protocol components with modeled process/fork facts. No native
// namespace, Docker admission, model execution or installed acceptance is claimed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const vm = require('node:vm'), crypto = require('node:crypto'), { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const root = path.resolve(__dirname, '../../../..'), file = path.join(__dirname, 'qualification-supervisor.cjs');
const raw = fs.readFileSync(file, 'utf8'), digest = value => crypto.createHash('sha256').update(value).digest('hex');
const nonce = 'a'.repeat(64), sourceSha256 = digest(raw);

function fixture(options = {}) {
    const processModel = new EventEmitter(), worker = new EventEmitter(), exits = [], sends = [], forks = [];
    const stdout = [], stderr = [];
    Object.assign(processModel, { platform: 'linux', pid: 6, ppid: 1, execPath: '/usr/local/bin/node', argv: ['node', file, '1000', '1001'],
        getuid: () => 0, stdin: new EventEmitter(), stdout: new PassThrough(), stderr: new PassThrough(),
        exit: code => { exits.push(code); }, ...options.process });
    processModel.stdin.resume = () => { processModel.stdinResumed = true; };
    Object.assign(worker, { stdout: new PassThrough(), stderr: new PassThrough(), send: value => { sends.push(JSON.parse(JSON.stringify(value))); } });
    processModel.stdout.on('data', bytes => stdout.push(bytes.toString())); processModel.stderr.on('data', bytes => stderr.push(bytes.toString()));
    const moduleModel = { exports: {} };
    const load = name => name === 'node:fs' ? { readFileSync(name, encoding) {
        assert.equal(name, '/proc/1/cmdline'); assert.equal(encoding, 'utf8');
        if (options.initReadFailure) throw Error('modeled init observation unavailable');
        return (options.initArgv ?? ['/usr/bin/tini', '--', '/usr/local/bin/node', '/qualification-supervisor.cjs', processModel.argv[2], processModel.argv[3]]).join('\0') + '\0';
    } } : name === 'node:child_process' ? { fork: (...args) => {
        forks.push(args); if (options.forkFailure) throw new Error('modeled fork failure'); return worker;
    } } : require(name);
    load.main = options.main ? moduleModel : undefined;
    vm.runInNewContext(raw, { require: load, module: moduleModel, process: processModel }, { filename: file });
    return { process: processModel, worker, exits, sends, forks, stdout, stderr,
        run: () => moduleModel.exports.runSupervisor(),
        message: value => worker.emit('message', JSON.parse(JSON.stringify(value))),
        dispose() { for (const stream of [worker.stdout, worker.stderr, processModel.stdout, processModel.stderr]) stream.destroy(); },
    };
}

function runSupervisorComponents() {
    assert.equal(digest(fs.readFileSync(file)), sourceSha256, 'source changed before protocol controls');
    const results = [];
    const check = (name, body, options) => {
        let f;
        try { f = fixture(options); body(f); results.push({ name, passed: true }); }
        catch (error) { results.push({ name, passed: false, error: error.message }); }
        finally { f?.dispose(); }
    };
    check('fixed fork/owner handshake excludes inherited authority and stdout parsing', f => {
        f.run(); assert.equal(f.process.stdinResumed, true); assert.equal(f.forks.length, 1);
        const [program, args, options] = f.forks[0]; assert.equal(program, '/qualification-bootstrap.cjs'); assert.deepEqual(Array.from(args), []);
        assert.equal(options.cwd, '/sdk'); assert.deepEqual(JSON.parse(JSON.stringify(options.env)), {
            PATH: '/opt/codex/node_modules/.bin:/usr/local/bin:/usr/bin:/bin', BUGBOT_VERIFICATION_MODE: 'disabled' });
        assert.deepEqual(Array.from(options.stdio), ['ignore', 'pipe', 'pipe', 'ipc']);
        assert.deepEqual(f.sends, [{ kind: 'scope-owner', workerUid: 1000, workerGid: 1001 }]);
        f.worker.stdout.write('{"kind":"scope-complete","reason":"completed"}'); f.worker.stderr.write('modeled diagnostic');
        assert.deepEqual(f.exits, []); assert.equal(f.stdout.join(''), '{"kind":"scope-complete","reason":"completed"}');
        assert.equal(f.stderr.join(''), 'modeled diagnostic');
    });
    for (const [name, process] of [
        ['nonLinux', { platform: 'darwin' }], ['missingImageInit', { pid: 1 }], ['notInitPrimaryChild', { ppid: 9 }], ['wrongSupervisorUID', { getuid: () => 1000 }],
        ['wrongNode', { execPath: '/usr/bin/node' }], ['missingArg', { argv: ['node', file, '1000'] }],
        ['extraArg', { argv: ['node', file, '1000', '1001', 'extra'] }],
    ]) check(`refuse ${name} before fork`, f => { assert.throws(f.run); assert.equal(f.forks.length, 0); }, { process });
    for (const options of [{ initReadFailure: true }, { initArgv: ['/usr/local/bin/node', '/qualification-supervisor.cjs', '1000', '1001'] },
        { initArgv: ['/usr/bin/tini', '--', '/usr/local/bin/node', '/foreign.cjs', '1000', '1001'] }]) {
        check('reject unavailable or mismatched image init before fork ' + JSON.stringify(options), f => { assert.throws(f.run); assert.equal(f.forks.length, 0); }, options);
    }
    for (const index of [2, 3]) for (const value of ['0', '-1', '1.5', 'NaN', String(Number.MAX_SAFE_INTEGER + 1)]) {
        const argv = ['node', file, '1000', '1001']; argv[index] = value;
        check(`refuse identity argument${index}=${value}`, f => { assert.throws(f.run); assert.equal(f.forks.length, 0); }, { process: { argv } });
    }
    for (const [event, code] of [['end', 143], ['error', 143], ['data', 1]]) check(`owner stdin ${event}`, f => {
        f.run(); f.process.stdin.emit(event, event === 'error' ? new Error('modeled input failure') : Buffer.from('untrusted'));
        assert.deepEqual(f.exits, [code]); f.process.emit('SIGINT'); assert.deepEqual(f.exits, [code]);
    });
    for (const [event, code] of [['SIGTERM', 143], ['SIGINT', 130]]) check(`owner signal ${event}`, f => {
        f.run(); f.process.emit(event); assert.deepEqual(f.exits, [code]);
    });
    for (const event of ['error', 'exit']) check(`worker ${event} stops namespace init`, f => {
        f.run(); f.worker.emit(event, event === 'error' ? new Error('modeled worker failure') : 0); assert.deepEqual(f.exits, [1]);
    });
    check('worker close is not an operation-completion witness', f => { f.run(); f.worker.emit('close', 0); assert.deepEqual(f.exits, []); });
    for (const value of [null, 0, true, 'text', []]) check(`refuse nonobject IPC ${JSON.stringify(value)}`, f => {
        f.run(); f.message(value); assert.deepEqual(f.exits, [1]);
    });
    for (const correlation of ['', 'A'.repeat(64), 'a'.repeat(63), null, [nonce]]) check(`refuse malformed ready correlation ${JSON.stringify(correlation)}`, f => {
        f.run(); f.message({ kind: 'scope-ready', correlation }); assert.deepEqual(f.exits, [1]); assert.equal(f.sends.length, 1);
    });
    check('refuse extra ready fields', f => { f.run(); f.message({ kind: 'scope-ready', correlation: nonce, extra: true }); assert.deepEqual(f.exits, [1]); });
    check('refuse repeated readiness', f => {
        f.run(); f.message({ kind: 'scope-ready', correlation: nonce });
        assert.deepEqual(f.sends[1], { kind: 'scope-ready-accepted', correlation: nonce });
        f.message({ kind: 'scope-ready', correlation: nonce }); assert.deepEqual(f.exits, [1]);
    });
    check('refuse completion before ready', f => { f.run(); f.message({ kind: 'scope-complete', correlation: nonce, reason: 'completed' }); assert.deepEqual(f.exits, [1]); });
    for (const value of [
        { kind: 'scope-complete', correlation: 'b'.repeat(64), reason: 'completed' },
        { kind: 'scope-complete', correlation: nonce, reason: 'completed', extra: true },
        { kind: 'unknown', correlation: nonce, reason: 'completed' },
        { kind: 'scope-stop', correlation: nonce, reason: 'completed' },
        { kind: 'scope-complete', correlation: nonce, reason: 'cancelled' },
    ]) check(`refuse foreign terminal IPC ${JSON.stringify(value)}`, f => {
        f.run(); f.message({ kind: 'scope-ready', correlation: nonce }); f.message(value); assert.deepEqual(f.exits, [1]);
    });
    for (const [kind, reason, code] of [['scope-stop', 'failed', 1], ['scope-stop', 'cancelled', 130], ['scope-complete', 'completed', 0]]) {
        check(`closed terminal IPC ${kind}/${reason}`, f => {
            f.run(); f.message({ kind: 'scope-ready', correlation: nonce }); f.message({ kind, correlation: nonce, reason }); assert.deepEqual(f.exits, [code]);
        });
    }
    check('executable entrypoint invokes the same owner protocol', f => { assert.equal(f.forks.length, 1); assert.equal(f.process.exitCode, undefined); }, { main: true });
    check('entrypoint failure is nonzero without importing the worker', f => { assert.equal(f.process.exitCode, 1); assert.equal(f.forks.length, 0); }, { main: true, process: { pid: 1 } });
    check('fork failure is nonzero at executable entrypoint', f => { assert.equal(f.process.exitCode, 1); assert.equal(f.forks.length, 1); }, { main: true, forkFailure: true });
    assert.equal(digest(fs.readFileSync(file)), sourceSha256, 'source changed during protocol controls');
    const result = { kind: 'modeled exact-source supervisor IPC components', source: path.relative(root, file), sourceSha256,
        passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length, cases: results.length,
        results, actualNamespaceAcceptance: false, qualificationModelCalls: 0, production: 'disabled' };
    console.log(JSON.stringify(result)); assert.equal(result.failed, 0, 'supervisor protocol component failures; retain this full command'); return result;
}
module.exports = { runSupervisorComponents };
if (require.main === module) runSupervisorComponents();
