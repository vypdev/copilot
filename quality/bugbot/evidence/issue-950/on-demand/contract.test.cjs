'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { assess, dryRunPorts, receipt, retrieve, selectAnchor } = require('./contract.cjs');
const { scenario, trial } = require('./run.cjs');
const binding = { operation: 'op', candidate: 'candidate', head: 'a'.repeat(40), tree: 'b'.repeat(40) };
const otherHead = { ...binding, head: 'c'.repeat(40) };
const otherCandidate = { ...binding, candidate: 'other-candidate' };
const source = { kind: 'git', path: 'example.js', blob: 'd'.repeat(40), start: 1, end: 1, text: 'const value = true;' };
const initial = receipt(binding, { kind: 'diff', text: 'pinned' });
const result = (verdict, citations) => ({ candidate: binding.candidate, kind: 'verdict', verdict, citations,
    request: null, reason: 'material premise', nextStep: verdict === 'inconclusive' ? 'Inspect pinned source.' : null });
const request = { kind: 'readBlob', path: 'example.js', start: 1, end: 1, query: null };
const intermediate = req => ({ candidate: binding.candidate, kind: 'request', request: req, verdict: null,
    citations: [], reason: 'missing source', nextStep: null });
const call = overrides => assess({ binding, receipts: [initial], arm: 'on-demand', ...overrides });
const blocked = () => assert.fail('forbidden capability');
const reader = (_cwd, command, mode) => {
    if (command === 'ls-tree') return `100644 blob ${source.blob}\texample.js\0`;
    if (mode === '-s') return String(Buffer.byteLength(source.text));
    return source.text;
};

test('C01 direct verdict bypasses retrieval', async () => {
    const answer = await call({ ask: () => result('refuted', [initial.id]), acquire: blocked });
    assert.equal(answer.verdict, 'refuted');
});
test('C02 allowed read supplies exact fragment and bound receipt', async () => {
    const answer = await call({
        acquire: req => retrieve('fixture', binding, req, reader),
        ask: ({ receipts, followup }) => {
            if (!followup) return intermediate(request);
            const recovered = receipts[1];
            assert.equal(recovered.text, source.text);
            assert.equal(recovered.candidate, binding.candidate);
            assert.equal(recovered.tree, binding.tree);
            assert.equal(recovered.id, followup.receipt);
            return result('confirmed', [recovered.id]);
        },
    });
    assert.equal(answer.verdict, 'confirmed');
});
for (const [label, req, responseStatus] of [
    ['C03 traversal denied before source read', { ...request, path: '../outside' }, 'denied'],
    ['C04 missing Git path', request, 'absent'],
    ['C05 candidate range exhausted before read', { ...request, end: 81 }, 'budget'],
]) {
    test(label, async () => {
        const answer = await call({
            acquire: req => retrieve('fixture', binding, req, responseStatus === 'absent' ? () => '' : blocked),
            ask: ({ followup }) => {
                if (!followup) return intermediate(req);
                assert.equal(followup.status, responseStatus);
                return result('inconclusive', []);
            },
        });
        assert.equal(answer.verdict, 'inconclusive');
        assert(answer.nextStep);
    });
}
for (const [label, second, injected, code] of [
    ['C06 forged citation', result('refuted', ['fake']), undefined, 'citation-integrity'],
    ['C07 another candidate', result('confirmed', [receipt(otherCandidate, source).id]), receipt(otherCandidate, source), 'citation-integrity'],
    ['C08 another revision', result('refuted', [receipt(otherHead, source).id]), receipt(otherHead, source), 'citation-integrity'],
    ['C09 second request', intermediate(request), undefined, 'second-request'],
]) {
    test(`${label} leaves a valid sibling and the historical result with zero writes`, async () => {
        const attempts = [];
        const ports = dryRunPorts(name => attempts.push(name));
        const mixed = async () => {
            await Promise.all([
                call({ ask: () => result('confirmed', [initial.id]) }),
                call({ acquire: () => ({ status: 'provided', receipt: injected ?? receipt(binding, source) }),
                    ask: ({ followup }) => followup ? second : intermediate(request) }),
            ]);
            ports.publishFinding();
            ports.resolveThread();
            ports.approve();
        };
        await assert.rejects(mixed, { code });
        assert.deepEqual(attempts, []);
    });
}
const patch = '@@ -1,2 +1,4 @@\n def fixture(\n+    *,\n+    expected_schema_fixture: int,\n ):';
const locate = line => ({ path: 'test_fixture.py', side: 'RIGHT', line });
test('C10 pytest separator selects its unique substantive companion', () => {
    assert.deepEqual(selectAnchor(locate(2), patch), { original: locate(2), selected: locate(3), reason: 'unique-nearby' });
});
test('C11 valid substantive line stays in place', () => {
    assert.deepEqual(selectAnchor(locate(3), patch), { original: locate(3), selected: locate(3), reason: 'original-changed' });
});
test('C12 two substantive companion lines withhold anchor', () => {
    const ambiguous = patch.replace('+    expected_schema_fixture: int,', '+    expected_schema_fixture: int,\n+    second_fixture: int,');
    assert.deepEqual(selectAnchor(locate(2), ambiguous), { original: locate(2), selected: null, reason: 'ambiguous' });
});
test('dry run rejects each provider effect and records the attempt', () => {
    const attempts = [];
    const ports = dryRunPorts(name => attempts.push(name));
    for (const name of ['publishReview', 'publishCheck', 'resolveThread', 'approve', 'changeLabel']) {
        assert.throws(() => ports[name](), { code: 'dry-run-write-port' });
    }
    assert.equal(attempts.length, 5);
});
test('initial prompt, schema and tool envelope match across arms', async () => {
    const checkout = process.env.BUGBOT_PILOT_V4_SUBJECTS;
    const fixture = scenario('J2', checkout, checkout);
    const prompts = [];
    for (const arm of ['fixed', 'repeat', 'on-demand']) {
        const rows = [];
        const answer = await trial({ model: 'gpt-6.1-sol', subject: 'J2', arm, repetition: 1 }, fixture, row => rows.push(row),
            (message, mode, cwd) => {
                assert.equal(mode, 'closed');
                assert.equal(cwd, null);
                const fact = { outcome: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, toolTypes: [] };
                if (message.agentId === 'demand-initial') {
                    prompts.push(message);
                    const candidate = /c-875-2-[a-f0-9]{12}/u.exec(message.prompt)[0];
                    return { fact, response: { ...intermediate({ kind: 'readBlob', path: 'tests/browser/image_channel.py',
                        start: 22, end: 45, query: null }), candidate } };
                }
                assert.deepEqual(message.options.schema.properties.kind.enum, ['verdict']);
                assert.equal(message.prompt.includes('self.sequence = 0'), arm === 'on-demand');
                const candidate = /c-875-2-[a-f0-9]{12}/u.exec(message.prompt)[0];
                return { fact, response: { ...result('inconclusive', []), candidate } };
            });
        assert.equal(answer.status, 'completed');
        assert.equal(answer.calls.length, arm === 'fixed' ? 1 : 2);
        assert.deepEqual(answer.writeAttempts, []);
    }
    assert.deepEqual(prompts, [prompts[0], prompts[0], prompts[0]]);
});
