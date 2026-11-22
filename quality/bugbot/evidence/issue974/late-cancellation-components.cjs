'use strict';

// Actual outer operation and Unix HTTP transport; Engine/runtime/admission are
// modeled. These controls neither contact Docker nor qualify a native runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { withEngineFixture } = require('./engine-transport-components.cjs');
const root = path.resolve(__dirname, '../../../..');

for (const stage of ['scope-stopped', 'operation-stopped', 'scope-remove-start', 'scope-removed']) {
    test('ev974-C31 outer operation retains cancellation during ' + stage, async () => {
        await withEngineFixture({ completeOnStart: true }, async fixture => {
            const controller = new AbortController();
            let observed = false;
            const outcome = await fixture.api.runContainedOperation({
                root: fixture.directory, plan: fixture.plan, mode: 'native-control',
                slot: { caseId: 'late-cancel' }, outputDirectory: path.join(fixture.directory, 'late-output'),
                signal: controller.signal,
                async record(event) {
                    await fixture.record(event);
                    if (event.event === stage) { observed = true; controller.abort(); }
                },
            });
            assert(observed); assert(controller.signal.aborted);
            assert.equal(outcome.namespaceInitStopped, true);
            assert.equal(fixture.running, false); assert.equal(fixture.removed, true);
            assert.equal(outcome.interrupted, true);
            if (stage !== 'scope-stopped') assert.equal(fixture.events.at(-1).reason, 'explicit-cancellation');
        });
    });
}

test('ev974-C31 asynchronous cancellation during final HTTP inspection remains interrupted', async () => {
    const controller = new AbortController();
    let armed = false, held = false;
    await withEngineFixture({ completeOnStart: true, holdInspection: () => armed,
        onHeldInspection(release) {
            held = true; armed = false;
            setImmediate(() => { controller.abort(); release(); });
        },
    }, async fixture => {
        const outcome = await fixture.api.runContainedOperation({
            root: fixture.directory, plan: fixture.plan, mode: 'native-control',
            slot: { caseId: 'late-http-cancel' }, outputDirectory: path.join(fixture.directory, 'late-http-output'),
            signal: controller.signal,
            async record(event) { await fixture.record(event); if (event.event === 'operation-stopped') armed = true; },
        });
        assert(held); assert(controller.signal.aborted); assert.equal(outcome.namespaceInitStopped, true);
        assert.equal(fixture.running, false); assert.equal(fixture.removed, true);
        assert.equal(outcome.interrupted, true); assert.equal(fixture.events.at(-1).reason, 'explicit-cancellation');
    });
});

// Load the actual normalizer without admitting campaign configuration or a model
// client. The independent policy below is the real pure authority implementation.
const corpusFile = path.join(root, 'quality/bugbot/evidence/issue-950/ev07-shadow/corpus.cjs');
const normalizedModule = { exports: {} };
const controlledRequire = name => name.startsWith('node:') ? require(name) : {};
vm.runInNewContext(fs.readFileSync(corpusFile, 'utf8'), {
    require: controlledRequire, module: normalizedModule, __dirname: path.dirname(corpusFile),
}, { filename: corpusFile });
require('../issue-950/ev07-shadow/load.cjs');
const { requireCompleteQualificationOperations } = require(path.join(root, 'src/application/policies/qualification_operation_scope_policy'));
const transform = normalizedModule.exports.containedOperationRecords;
const identity = { ownerId: 'a'.repeat(64), operationId: 'corpus:fixture-case', planSha256: 'b'.repeat(64),
    implementation: 'c'.repeat(40), imageSha256: 'd'.repeat(64), purpose: 'corpus-case' };
const completed = [{ event: 'operation-start', identity, scopeId: 'e'.repeat(64) },
    { event: 'operation-stopped', identity, scopeId: 'e'.repeat(64), namespaceInitStopped: true, exitCode: 0, interrupted: false }];
const slots = [{ operationId: identity.operationId, purpose: identity.purpose }];
const tuple = { planSha256: identity.planSha256, implementation: identity.implementation, imageSha256: identity.imageSha256 };
test('ev974-C29 clean completed operation remains eligible after normalization', () => {
    assert.doesNotThrow(() => requireCompleteQualificationOperations(slots, transform(completed), tuple));
});
for (const reason of ['explicit-cancellation', 'runtime-or-ownership-unavailable']) for (const stoppedConfirmed of [true, false]) {
    test('ev974-C29 durable incomplete ' + reason + ' stopped=' + stoppedConfirmed + ' cannot be erased', () => {
        const rows = [...completed, { event: 'operation-incomplete', identity, scopeId: 'e'.repeat(64), reason, stoppedConfirmed, removed: true }];
        assert.throws(() => requireCompleteQualificationOperations(slots, transform(rows), tuple), /incomplete/);
    });
}
test('ev974-C29 explicitly marked unrelated preflight remains outside measured operation authority', () => {
    const rows = [...completed, { event: 'operation-incomplete', identity, scopeId: 'e'.repeat(64), reason: 'explicit-cancellation',
        stoppedConfirmed: true, preflight: true }];
    assert.doesNotThrow(() => requireCompleteQualificationOperations(slots, transform(rows), tuple));
});
