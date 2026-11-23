'use strict';
// Core-only actual bootstrap function with modeled proc/process facts; no native
// namespace, UID drop, image, CLI, SDK or model admission is inferred.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), Module = require('node:module'), crypto = require('node:crypto');
const file = path.join(__dirname, '../issue-950/qualification-bootstrap.cjs');
const source = fs.readFileSync(file, 'utf8'), load = Module.createRequire(file);
function exerciseInitParent() {
    const owner = { workerUid: 1000, workerGid: 1001 }, argv = ['/usr/local/bin/node', '/qualification-supervisor.cjs', '1000', '1001'];
    const rows = [];
    for (const [name, options] of [
        ['valid image init and exact supervisor parent', {}],
        ['worker directly under PID1', { ppid: 1 }],
        ['foreign namespace init', { init: ['foreign', '--', ...argv] }],
        ['missing init separator', { init: ['/usr/bin/tini', ...argv] }],
        ['foreign init supervisor', { init: ['/usr/bin/tini', '--', '/usr/local/bin/node', '/foreign', '1000', '1001'] }],
        ['wrong init identity', { init: ['/usr/bin/tini', '--', ...argv.slice(0, 2), '999', '1001'] }],
        ['foreign direct parent', { parent: ['/usr/bin/node', ...argv.slice(1)] }],
        ['wrong direct parent identity', { parent: [...argv.slice(0, 2), '1000', '999'] }],
        ['parent changes during admission', { reparented: true }],
        ['proc observation unavailable', { readFailure: true }],
    ]) {
        try {
            let reads = 0, accesses = 0;
            const processModel = Object.create(process); Object.defineProperty(processModel, 'ppid', { get: () => options.reparented && accesses++ ? 1 : options.ppid ?? 9 });
            const observedFs = { ...fs, readFileSync(name, encoding) {
                reads++; assert.equal(encoding, 'utf8'); if (options.readFailure) throw Error('modeled proc failure');
                assert(['/proc/1/cmdline', '/proc/9/cmdline'].includes(name));
                return (name === '/proc/1/cmdline' ? options.init ?? ['/usr/bin/tini', '--', ...argv] : options.parent ?? argv).join('\0') + '\0';
            } };
            const module = { exports: {} };
            vm.runInNewContext(source + '\nmodule.exports = { admitContainedWorkerParent };\n', {
                module, require: name => name === 'node:fs' ? observedFs : load(name), process: processModel,
                Buffer, __filename: file, __dirname: path.dirname(file),
            }, { filename: file });
            const invoke = () => module.exports.admitContainedWorkerParent(owner);
            if (name === 'valid image init and exact supervisor parent') { invoke(); assert.equal(reads, 2); }
            else assert.throws(invoke);
            rows.push({ name, passed: true });
        } catch (error) { rows.push({ name, passed: false, message: error.message }); }
    }
    const result = { kind: 'modeled actual-bootstrap init/parent binding controls', sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), rows,
        passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, nativeAcceptance: false, scientificCalls: 0 };
    console.log(JSON.stringify(result)); assert.equal(result.failed, 0); return result;
}
module.exports = { exerciseInitParent };
if (require.main === module) exerciseInitParent();
