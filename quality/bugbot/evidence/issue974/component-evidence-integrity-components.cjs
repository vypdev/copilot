'use strict';

// Real published coverage driver in an owned, remote-free fixture. Its semantic
// suites are suppressed; only registration of instrumented module bytes occurs.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createHash } = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const tests = ['quality/bugbot/evidence/issue-950/shadow-verification/verification.test.cjs',
    'quality/bugbot/evidence/issue974/session-transport.test.cjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

for (const changed of tests) test('component evidence integrity rejects a post-import test mutation: ' + changed, t => {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-test-hash-integrity-')));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    for (const relative of ['src/infrastructure/bugbot/shadow/session.cjs', 'src/infrastructure/bugbot/shadow/hash.cjs']) {
        const file = path.join(directory, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.copyFileSync(path.join(root, relative), file);
    }
    for (const relative of tests) {
        const file = path.join(directory, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, "'use strict';\nmodule.exports={};\n");
    }
    const before = hash(fs.readFileSync(path.join(directory, changed)));
    const driver = path.join(root, 'quality/bugbot/evidence/issue-974/controls/session-transport-coverage/coverage-runner.cjs');
    const output = path.join(directory, 'coverage'), child = path.join(directory, 'mutation-control.cjs');
    fs.writeFileSync(child, [
        "const fs=require('node:fs'),Module=require('node:module');const original=Module._load;let changed=false;",
        'const tests=' + JSON.stringify(tests.map(relative => path.join(directory, relative))) + ';',
        'Module._load=function(request,...args){if(tests.includes(request)){if(!changed){fs.appendFileSync('
            + JSON.stringify(path.join(directory, changed)) + ',"\\n// owned fixture mutation after test admission\\n");changed=true;}return {};}return original.call(this,request,...args);};',
        'require(' + JSON.stringify(driver) + ');',
        'require(' + JSON.stringify(path.join(directory, 'src/infrastructure/bugbot/shadow/session.cjs')) + ');',
    ].join('\n'));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'].includes(key)));
    const result = spawnSync(process.execPath, [child, directory, output], { cwd: directory, env, encoding: 'utf8' });
    const receiptPath = path.join(output, 'receipt.json'), exists = fs.existsSync(receiptPath);
    const after = hash(fs.readFileSync(path.join(directory, changed)));
    const receiptHash = exists ? JSON.parse(fs.readFileSync(receiptPath)).testSha256[changed] : null;
    console.log('AST_TEST_MUTATION_OBSERVATION', JSON.stringify({ changed, exit: result.status,
        before, after, receiptExists: exists, receiptHash, semanticExecutionSuppressed: true }));
    assert.ifError(result.error); assert.equal(result.signal, null); assert.equal(result.status, 1);
    assert.notEqual(before, after, 'the private mutation must actually occur');
    assert.match(result.stderr, /test bytes changed after pre-load capture/);
    assert.equal(exists, false, 'changed test bytes must not produce a misleading receipt');
});
