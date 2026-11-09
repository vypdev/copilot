'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { git } = require('../on-demand/contract.cjs');
const held = require('./held-out.lock.json');
const evaluator = require('./oracle.json');

async function main(directory) {
    for (const [subject, { binding }] of Object.entries(held)) {
        const cwd = path.join(directory, subject);
        assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), binding.head);
        const modules = new Map();
        function load(file) {
            if (modules.has(file)) return modules.get(file);
            assert(file.startsWith('frontend/src/') && file.endsWith('.ts'));
            const exports = {};
            modules.set(file, exports);
            const text = git(cwd, 'show', binding.head + ':' + file);
            const code = ts.transpileModule(text, {
                compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
            }).outputText;
            vm.runInNewContext(code, { exports, require(specifier) {
                assert(specifier.startsWith('.'));
                return load(path.posix.join(path.posix.dirname(file), specifier + '.ts'));
            } }, { timeout: 750 });
            return exports;
        }
        const { TaskController } = load('frontend/src/application/task-controller.ts');
        const { taskMessage } = load('frontend/src/presentation/task-messages.ts');
        const context = { installationId: 'i', channel: 'test', subject: 's' };
        const read = value => ({ result: Promise.resolve(value), cancel() {} });
        const cursors = [], identityReads = [], accessReads = [];
        const controller = new TaskController('test', { session() {
            identityReads.push(true);
            return read({ deployment: 'test', context, access: 'full', serverTime: 1, expiresAt: 100, householdApiAvailable: true });
        } }, { access() {
            accessReads.push(true);
            return read({ householdId: 'h', memberId: 'm' });
        }, list(_context, cursor) {
            cursors.push(cursor);
            return read({ items: [cursor ? 'work-next' : 'work-first'], nextCursor: cursor ? null : 'next' });
        } }, { detach() {}, open() { return []; } }, { now() { return 1; }, anchor() {} }, {});
        const states = [];
        for (const action of ['refresh', 'more', 'refresh']) {
            await controller[action]();
            states.push(Array.from(controller.view.page.items));
        }
        assert.deepEqual(states, [['work-first'], ['work-next'], ['work-first']]);
        assert.deepEqual(cursors, [null, 'next', null]);
        assert.equal(identityReads.length, 3);
        assert.equal(accessReads.length, 3);
        const labels = ['en', 'es'].map(locale => taskMessage('more', locale));
        assert.deepEqual(labels, evaluator[subject].verdict === 'refuted' ? ['Next page', 'Página siguiente'] : ['Load more', 'Cargar más']);
        console.log(JSON.stringify({ subject, head: binding.head, labels, states, cursors,
            identityReads: identityReads.length, accessReads: accessReads.length }));
    }
}

main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
