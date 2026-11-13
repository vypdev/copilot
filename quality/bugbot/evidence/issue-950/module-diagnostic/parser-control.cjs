'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const { git } = require('../on-demand/contract.cjs');
const locked = require('./held-out.lock.json');
const evaluator = require('./oracle.json');

for (const [subject, { binding }] of Object.entries(locked)) {
    const cwd = path.join(process.argv[2], subject);
    assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), binding.head);
    const source = git(cwd, 'show', binding.head + ':' + evaluator[subject].decisive.path);
    const ast = ts.createSourceFile('tasks.ts', source, ts.ScriptTarget.Latest, true);
    const names = new Set(['TaskInputError', 'requireValue', 'taskQuantity']);
    const selected = ast.statements.filter(node => node.name && names.has(node.name.text));
    assert.equal(selected.length, names.size);
    const code = ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const moduleExports = {};
    vm.runInNewContext(code, { exports: moduleExports }, { timeout: 500 });
    const accepted = value => {
        try { return moduleExports.taskQuantity(value) === value; }
        catch (error) { assert.equal(error.name, 'TaskInputError'); return false; }
    };
    const checks = [accepted('1.12345'), accepted('1.123456'), accepted('1.1234567')];
    assert.deepEqual(checks, [true, evaluator[subject].verdict === 'refuted', false]);
    console.log(JSON.stringify({ subject, head: binding.head, inputs: ['1.12345', '1.123456', '1.1234567'], accepted: checks }));
}
