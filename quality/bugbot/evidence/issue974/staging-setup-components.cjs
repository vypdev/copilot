'use strict';
// Real owned temporary directories and source, modeled Engine, no Docker/model.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { withEngineFixture } = require('./engine-transport-components.cjs');

for (const method of ['chmodSync', 'mkdirSync']) {
    test('owned staging setup failure cleans before Engine creation: ' + method, async () => {
        let staging, failures = 0;
        const failure = new Error('controlled staging setup failure');
        const facade = { ...fs,
            mkdtempSync(prefix, ...args) {
                const created = fs.mkdtempSync(prefix, ...args);
                if (path.basename(prefix).startsWith('bugbot-owned-operation-')) staging = fs.realpathSync(created);
                return created;
            },
            [method](target, ...args) {
                if (staging && (target === staging || target === path.join(staging, 'input'))) {
                    failures++; throw failure;
                }
                return fs[method](target, ...args);
            },
        };
        try {
            await withEngineFixture({ fileSystem: facade }, async f => {
                await assert.rejects(f.api.runContainedOperation({ root: f.directory, plan: f.plan,
                    mode: 'native-control', slot: { caseId: 'ev974-C32' },
                    outputDirectory: path.join(f.directory, 'outer-output'), record: f.record,
                    signal: new AbortController().signal }), error => error === failure);
                assert.equal(failures, 1); assert(staging);
                assert.equal(fs.existsSync(staging), false, 'uncreated owned staging must be removed');
                assert.equal(f.requests.length, 0, 'setup failure must not reach the Engine');
                assert.equal(f.events.filter(row => row.event === 'operation-incomplete').length, 1);
                assert.equal(f.events.at(-1).scopeId, null);
                assert.equal(f.events.at(-1).stoppedConfirmed, false);
            });
        } finally {
            // Remove only this test's real owned directory after the assertion,
            // including the intentionally failing original-source contrast.
            if (staging && fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
        }
    });
}
