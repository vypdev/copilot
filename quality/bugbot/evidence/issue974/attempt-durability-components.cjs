'use strict';

// Actual private filesystem I/O with deterministic syscall faults and semantic
// CLI/verifier fakes. These controls do not simulate a successful host crash.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const sourceFile = path.join(__dirname, 'attempt-ledger.cjs');

function fixture(t, options = {}) {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-attempt-durability-')));
    const artifacts = path.join(directory, 'attempts'), ledger = path.join(directory, 'attempts.jsonl');
    fs.mkdirSync(artifacts, { mode: 0o700 });
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const events = [], rows = [], descriptors = new Map();
    let phase = 'initial', dispatches = 0;
    const facade = { ...fs,
        openSync(file, ...args) {
            const descriptor = fs.openSync(file, ...args), name = path.resolve(file);
            if (name.endsWith('.request.json')) phase = 'request';
            if (name.endsWith('.response.txt')) phase = 'response';
            descriptors.set(descriptor, { path: name, kind: fs.fstatSync(descriptor).isDirectory() ? 'directory' : 'file' });
            events.push({ type: 'open', ...descriptors.get(descriptor), phase });
            return descriptor;
        },
        fsyncSync(descriptor) {
            const fact = { type: 'sync', ...descriptors.get(descriptor), phase };
            fs.fsyncSync(descriptor); events.push(fact);
            options.syncFault?.(fact);
        },
        closeSync(descriptor) {
            const fact = { type: 'close', ...descriptors.get(descriptor), phase };
            fs.closeSync(descriptor); descriptors.delete(descriptor); events.push(fact);
            options.closeFault?.(fact);
        },
    };
    // The AST coverage runner instruments these exact production bytes too.
    const module = { exports: {} };
    vm.compileFunction(fs.readFileSync(sourceFile, 'utf8'), ['require', 'module', 'exports'], { filename: sourceFile })(
        name => name === 'node:fs' ? facade : require(name), module, module.exports);
    const api = module.exports;
    let durable;
    const initialize = () => { durable = api.createDurableRecorder(ledger); };
    const record = row => { durable(row); rows.push(row); events.push({ type: 'record', event: row.event, status: row.status }); };
    const dispatch = async () => { dispatches += 1; events.push({ type: 'dispatch' }); return '{}'; };
    const create = role => {
        const cancel = new AbortController();
        const request = { prompt: 'model-free durability control', outputSchema: { type: 'object' },
            schema: { type: 'object' }, configuration: { provider: 'component-only' }, candidateId: 'component-candidate', signal: cancel.signal };
        const cli = role === 'detector' ? api.createRecordedCli({ caseId: 'durability', record, artifactDirectory: artifacts,
            cancellation: { signal: cancel.signal, abort: () => cancel.abort() },
            createClient: () => ({ execute: dispatch }) }) : undefined;
        const verifier = role === 'verifier' ? api.createRecordedVerifier({ caseId: 'durability', record,
            artifactDirectory: artifacts, admitRuntime: () => ({}), transport: async () => {
                await dispatch(); return { fact: {}, response: {} };
            } }) : undefined;
        return { execute: () => cli ? cli.execute(request) : verifier(request), cli };
    };
    return { directory, artifacts, ledger, events, rows, descriptors, initialize, create,
        append: row => durable(row), dispatches: () => dispatches };
}

test('attempt durability control acknowledges a new ledger only after file and directory entries sync', t => {
    const f = fixture(t); f.initialize();
    const syncs = f.events.filter(row => row.type === 'sync');
    assert.deepEqual(syncs.map(row => row.path), [f.ledger, f.directory, path.dirname(f.directory)]);
    assert.equal(f.descriptors.size, 0);
});

for (const role of ['detector', 'verifier']) {
    test('attempt durability control ' + role + ' syncs both artifacts and their directory entries before dispatch or completion', async t => {
        const f = fixture(t); f.initialize(); f.events.length = 0;
        await f.create(role).execute();
        for (const phase of ['request', 'response']) {
            const fileSync = f.events.findIndex(row => row.type === 'sync' && row.kind === 'file'
                && row.path.startsWith(f.artifacts + path.sep) && row.phase === phase);
            const barrier = f.events.findIndex(row => phase === 'request' ? row.type === 'dispatch'
                : row.type === 'record' && row.event.endsWith('attempt-finish') && row.status === 'completed');
            assert(fileSync >= 0 && barrier > fileSync);
            const directories = f.events.slice(fileSync + 1, barrier).filter(row => row.type === 'sync' && row.kind === 'directory');
            assert.deepEqual(directories.map(row => row.path), [f.artifacts, f.directory]);
        }
        assert.equal(f.dispatches(), 1); assert.equal(f.descriptors.size, 0);
    });
    for (const target of ['artifact-directory', 'parent-directory']) {
        test('attempt durability control ' + role + ' refuses dispatch after a request ' + target + ' sync failure', async t => {
            const failure = new Error('controlled request directory sync failure');
            const f = fixture(t, { syncFault(fact) {
                if (fact.phase === 'request' && fact.kind === 'directory'
                    && fact.path === (target === 'artifact-directory' ? f.artifacts : f.directory)) throw failure;
            } });
            f.initialize();
            await assert.rejects(f.create(role).execute(), error => error === failure);
            assert.equal(f.dispatches(), 0); assert.deepEqual(f.rows, []); assert.equal(f.descriptors.size, 0);
        });
    }
    test('attempt durability control ' + role + ' retains a failed attempt when response directory sync fails', async t => {
        const failure = new Error('controlled response directory sync failure');
        const f = fixture(t, { syncFault(fact) {
            if (fact.phase === 'response' && fact.kind === 'directory' && fact.path === f.artifacts) throw failure;
        } });
        f.initialize();
        await assert.rejects(f.create(role).execute(), error => error === failure);
        assert.equal(f.dispatches(), 1); assert.equal(f.rows.at(-1).status, 'failed');
        assert.equal(f.rows.at(-1).responseFile, undefined); assert.equal(f.descriptors.size, 0);
    });
}

for (const target of ['file', 'directory']) {
    test('attempt durability control preserves the first ' + target + ' sync error if close also fails', t => {
        const first = new Error('controlled first sync failure'), later = new Error('controlled later close failure');
        const f = fixture(t, { syncFault(fact) { if (fact.kind === target) throw first; },
            closeFault(fact) { if (fact.kind === target) throw later; } });
        assert.throws(() => f.initialize(), error => error === first); assert.equal(f.descriptors.size, 0);
    });
    test('attempt durability control refuses acknowledgement after an otherwise successful ' + target + ' close fails', t => {
        const failure = new Error('controlled close failure');
        const f = fixture(t, { closeFault(fact) { if (fact.kind === target) throw failure; } });
        assert.throws(() => f.initialize(), error => error === failure); assert.equal(f.descriptors.size, 0);
    });
}

test('attempt durability control cannot silently recreate a lost ledger while appending', t => {
    const f = fixture(t); f.initialize(); fs.unlinkSync(f.ledger);
    assert.throws(() => f.append({ event: 'component-only' }), error => error.code === 'ENOENT');
    assert(!fs.existsSync(f.ledger)); assert.equal(f.descriptors.size, 0);
});
