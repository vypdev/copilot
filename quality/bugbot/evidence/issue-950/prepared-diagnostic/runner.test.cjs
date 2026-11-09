'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { trial } = require('./run.cjs');
const { missingPremises } = require('./premises.cjs');
const packets = require('./packets.json');
const row = require('./order.json').find(item => item.subject === 'H2' && item.arm === 'complete');

test('the runner submits one frozen follow-up and retains only safe premise codes', async () => {
    const revision = packets.H2;
    const packet = revision.complete;
    let calls = 0;
    const result = await trial(row, revision, () => {}, (request, mode, cwd, timeout) => {
        calls++;
        assert.equal(request.prompt, packet.prompt);
        assert.deepEqual(request.options.schema.properties.kind.enum, ['verdict']);
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        assert.equal(timeout, 42000);
        return { fact: { outcome: 'completed', promptSha256: packet.promptSha256, schemaSha256: packet.schemaSha256,
            usage: { input_tokens: 10, output_tokens: 1 }, toolTypes: [] },
        response: { candidate: revision.binding.candidate, kind: 'verdict', verdict: 'inconclusive',
            citations: [packet.receipts[0].id], request: null, reason: 'Private arbitrary reason.',
            nextStep: 'Show which binding has precision six before submission.' } };
    });
    assert.equal(calls, 1);
    assert.equal(result.status, 'completed', result.reason);
    assert.deepEqual(result.anchor, revision.anchor.selected);
    assert.deepEqual(result.writeAttempts, []);
    assert.deepEqual(result.missing, { from: 'next-step', codes: ['precision-six-reachability'] });
    assert(!JSON.stringify(result).includes('Private arbitrary reason.'));
});

test('the runner rejects a citation from another revision without another call', async () => {
    const revision = packets.H2;
    const packet = revision.complete;
    let calls = 0;
    const result = await trial(row, revision, () => {}, () => {
        calls++;
        return { fact: { outcome: 'completed', promptSha256: packet.promptSha256, schemaSha256: packet.schemaSha256,
            usage: { input_tokens: 10, output_tokens: 1 }, toolTypes: [] },
        response: { candidate: revision.binding.candidate, kind: 'verdict', verdict: 'confirmed',
            citations: [packets.H1.historical.receipts[0].id], request: null, reason: 'Unknown citation.', nextStep: null } };
    });
    assert.equal(calls, 1);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'citation-integrity');
    assert.deepEqual(result.writeAttempts, []);
});

test('premise fallback exports no provider text', () => {
    assert.deepEqual(missingPremises('pagination', { verdict: 'inconclusive',
        reason: 'The click handler route is unclear.', nextStep: 'Look into it.' }),
    { from: 'reason', codes: ['event-to-controller-binding'] });
    assert.deepEqual(missingPremises('pagination', { verdict: 'inconclusive',
        reason: 'Unclear.', nextStep: 'Look into it.' }), { from: 'none', codes: ['unclassified'] });
});
