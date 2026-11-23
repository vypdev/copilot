'use strict';
// Real owned filesystem fixtures mapped onto the fixed Linux paths. No Docker,
// image worker, credentials, CLI or model is executed by these components.
const assert = require('node:assert/strict'), fs = require('node:fs');
const os = require('node:os'), path = require('node:path'), vm = require('node:vm'), Module = require('node:module');
const { test } = require('node:test');
const sourceFile = path.join(__dirname, '../issue-950/qualification-bootstrap.cjs');
const source = fs.readFileSync(sourceFile, 'utf8'), nativeRequire = Module.createRequire(sourceFile);

function fixture(t, options = {}) {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-fixed-scratch-')));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const actual = path.join(directory, 'scratch'), fixed = '/tmp/bugbot-contained-worker';
    let creates = 0;
    const mapped = { ...fs, realpathSync(name) {
        assert.equal(name, '/tmp'); return options.parentAlias ? '/unreviewed-tmp-alias' : '/tmp';
    }, mkdirSync(name, flags) {
        assert.equal(name, fixed); assert.deepEqual(JSON.parse(JSON.stringify(flags)), { mode: 0o700 });
        creates++; return fs.mkdirSync(actual, flags);
    } };
    const module = { exports: {} };
    vm.runInNewContext(source + '\nmodule.exports = { createContainedWorkerScratch };\n', {
        module, require: name => name === 'node:fs' ? mapped : name === 'node:os'
            ? { ...os, tmpdir: () => options.tmpdir ?? '/tmp' } : nativeRequire(name),
        process, Buffer, __filename: sourceFile, __dirname: path.dirname(sourceFile),
    }, { filename: sourceFile });
    return { directory, actual, fixed, create: module.exports.createContainedWorkerScratch,
        creates: () => creates };
}

test('ev974-C26 fixed worker scratch creates one private literal root in the modeled namespace', t => {
    const f = fixture(t); assert.equal(f.create(), f.fixed);
    const stat = fs.lstatSync(f.actual); assert(stat.isDirectory() && !stat.isSymbolicLink());
    assert.equal(stat.uid, process.getuid()); assert.equal(stat.mode & 0o777, 0o700); assert.equal(f.creates(), 1);
});
test('ev974-C26 an existing worker scratch directory is refused without adopting or changing it', t => {
    const f = fixture(t); fs.mkdirSync(f.actual); const marker = path.join(f.actual, 'owned-canary');
    fs.writeFileSync(marker, 'UNCHANGED'); assert.throws(f.create, { code: 'EEXIST' });
    assert.equal(fs.readFileSync(marker, 'utf8'), 'UNCHANGED');
});
test('ev974-C26 an existing worker scratch symlink cannot redirect source materialization', t => {
    const f = fixture(t), target = path.join(f.directory, 'target'); fs.mkdirSync(target); fs.symlinkSync(target, f.actual);
    assert.throws(f.create, { code: 'EEXIST' }); assert.deepEqual(fs.readdirSync(target), []);
});
test('ev974-C26 a linked temporary parent rejects before fixed worker scratch creation', t => {
    const f = fixture(t, { parentAlias: true }); assert.throws(f.create, /canonical contained tmpfs required/u);
    assert.equal(f.creates(), 0); assert(!fs.existsSync(f.actual));
});
test('ev974-C26 ambient temporary-directory redirection cannot move the fixed worker source', t => {
    const f = fixture(t, { tmpdir: '/unreviewed-private-temp' }); assert.throws(f.create, /fixed contained tmpfs required/u);
    assert.equal(f.creates(), 0); assert(!fs.existsSync(f.actual));
});
