'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { bound, byteLength, decide, diffExcerpt, limits, remainingVerifierBudget, verifierRequest } = require('./verification.cjs');

const finding = { id: 'long-host-owned-id', file: 'src/example.py', line: 12, title: 'An omitted parameter' };
const change = { filename: finding.file, patch: '@@ -10,4 +10,3 @@\n context\n- guard\n after\n more\n' };
const receipt = { id: 'evidence-1', text: 'caller' };
const answer = { id: 'candidate', verdict: 'confirmed', citations: ['evidence-1'], reason: 'The actual caller omits the argument.' };
const render = (text, name) => `[${name}]${text}`;
const usage = (input, output = 0) => ({ usage: { input_tokens: input, output_tokens: output } });

test('projects the nearest deletion hunk and rejects foreign paths or distant anchors', () => {
    assert.match(diffExcerpt(finding, [change]), /- guard/u);
    assert.equal(diffExcerpt({ ...finding, line: 80 }, [change]), null);
    assert.equal(diffExcerpt({ ...finding, file: 'elsewhere' }, [change]), null);
});

test('large diff excerpt keeps the nearby causal deletion and byte bound', () => {
    const large = { ...change, patch: '@@ -10,6 +10,5 @@\n a\n b\n- reject\n next\n' + ' '.padEnd(3200, 'X') };
    const excerpt = diffExcerpt(finding, [large]);
    assert.match(excerpt, /- reject/u);
    assert(byteLength(excerpt) <= limits.diffBytes);
    assert(!bound('😀'.repeat(100), 90).includes('\uFFFD'));
});

test('only scoped diff and bounded receipts are sent with a host-correlated identity', () => {
    const request = verifierRequest({}, finding, change.patch, [receipt], render);
    assert(!request.prompt.includes(finding.id));
    assert.match(request.prompt, /\[diff\].*-10/su);
    assert.deepEqual(request.options.schema.properties.citations.items.enum, ['diff', receipt.id]);
    assert.throws(() => verifierRequest({}, finding, change.patch, [receipt, receipt], render), /duplicate-receipt/u);
    assert.throws(() => verifierRequest({}, finding, change.patch, [{ ...receipt, text: 'a'.repeat(limits.packetBytes) }], render), /packet-byte-budget/u);
});

test('validated verdict maps back to the original opaque host identity', () => {
    assert.equal(decide(answer, finding.id, [receipt]).id, finding.id);
    assert.equal(decide({ ...answer, verdict: 'inconclusive', citations: [] }, finding.id, [receipt]).verdict, 'inconclusive');
    assert.equal(decide({ ...answer, citations: ['diff'] }, finding.id, []).verdict, 'confirmed');
});

test('rejects malformed, forged or missing witnesses and long or blank reasons', () => {
    for (const [patch, failure] of [
        [{ id: 'different' }, /verdict-identity/u], [{ additional: true }, /verdict-shape/u],
        [{ verdict: 'maybe' }, /verdict-value/u], [{ reason: ' ' }, /verdict-reason/u],
        [{ reason: 'x'.repeat(1500) }, /verdict-reason/u], [{ citations: ['forged'] }, /verdict-citation/u],
        [{ citations: ['diff'] }, /verdict-missing-witness/u], [{ citations: [] }, /verdict-missing-witness/u],
    ]) assert.throws(() => decide({ ...answer, ...patch }, finding.id, [receipt]), failure);
});

test('blocks over-budget or unaccounted spend and reserves capacity before the next call', () => {
    assert(remainingVerifierBudget([usage(7300), usage(7300)], 120));
    assert(!remainingVerifierBudget([usage(26_000)], 120));
    assert(!remainingVerifierBudget([], limits.subjectWallMs));
    assert(!remainingVerifierBudget(Array.from({ length: limits.verifierCalls }, () => usage(1)), 120));
    assert.throws(() => remainingVerifierBudget([usage(32_769)], 120), /verifier-token-budget/u);
    assert.throws(() => remainingVerifierBudget([usage(100, 4097)], 120), /verifier-token-budget/u);
    assert.throws(() => remainingVerifierBudget([usage(-1)], 120), /verifier-usage-unavailable/u);
    assert.throws(() => remainingVerifierBudget([{ usage: null }], 120), /verifier-usage-unavailable/u);
});
