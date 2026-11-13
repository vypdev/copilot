'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { assess, limits } = require('../tree-search/contract.cjs');
const { byteLength } = require('../v4/verification.cjs');
const { nativeGit, retrieve: frozen } = require('../tree-search/git-evidence.cjs');
const { retrieve, sourceLimits } = require('./git-evidence.cjs');
const { target, request, attest } = require('./replay-common.cjs');
const { H1 } = require('../module-diagnostic/held-out.lock.json');

const fixture = () => path.join(process.env.BUGBOT_PACKET_RESERVED_SUBJECTS, 'H1');
const binding = { ...H1.binding, operation: 'packing-test', candidate: 'candidate', scopes: [''] };
const narrow = target('function taskQuantity');
const broad = target('taskQuantity(');

test('the bounded merge recovers the exact parser ranges on the frozen tree', () => {
    const cwd = fixture();
    const first = frozen(cwd, binding, request(narrow));
    assert.equal(first.status, 'provided');
    assert.equal(frozen(cwd, binding, request(narrow, broad)).reason, 'fragment-byte-budget');
    const result = retrieve(cwd, binding, request(narrow, broad));
    assert.equal(result.status, 'provided');
    assert.deepEqual(result.receipts.map(proof => [proof.start, proof.end]), [[9, 47], [41, 79]]);
    assert.deepEqual(result.receipts[0], first.receipts[0]);
    attest(cwd, binding, result);
});

test('an auxiliary query cannot discard an admitted receipt when its packet share is exhausted', () => {
    const cwd = fixture();
    const first = retrieve(cwd, binding, request(narrow));
    const result = retrieve(cwd, binding, request(narrow, broad), {
        caps: { ...sourceLimits, evidenceBytes: first.budget.evidenceBytes },
    });
    assert.equal(result.status, 'partial');
    assert.equal(result.results[1].status, 'partial');
    assert.equal(result.results[1].reason, 'evidence-packet-budget');
    assert.deepEqual(result.receipts, first.receipts);
    assert.deepEqual(result.results[1].receiptIds, first.results[0].receiptIds);
    attest(cwd, binding, result);
});

test('an invalid source binding or failed Git read returns no partial proof', () => {
    const cwd = fixture();
    assert.deepEqual(retrieve(cwd, { ...binding, tree: '0'.repeat(40) }, request(narrow, broad)),
        { status: 'denied', reason: 'revision-tree-mismatch' });
    const auxiliary = { ...target('this.complete'), scope: H1.candidate.path };
    const result = retrieve(cwd, binding, request(narrow, auxiliary), { runGit(...args) {
        if (args[1][0] === 'ls-tree' && args[1].at(-1) === auxiliary.scope) throw Error('bad-object');
        return nativeGit(...args);
    } });
    assert.deepEqual(result, { status: 'unavailable', reason: 'git-read-failed' });
});

test('a tampered second blob invalidates the response after a valid first read', () => {
    const cwd = fixture();
    const auxiliary = { ...target('this.complete'), scope: H1.candidate.path };
    const blob = require('../on-demand/contract.cjs').git(cwd, 'rev-parse', `${binding.head}:${auxiliary.scope}`).trim();
    const result = retrieve(cwd, binding, request(narrow, auxiliary), { runGit(...args) {
        const contents = nativeGit(...args);
        return args[1][0] === 'cat-file' && args[1][1] === 'blob' && args[1][2] === blob
            ? '#' + contents.slice(1) : contents;
    } });
    assert.deepEqual(result, { status: 'unavailable', reason: 'blob-integrity' });
});

test('the verifier contract delivers retained receipts and per-query partial status', async () => {
    const cwd = fixture();
    const first = retrieve(cwd, binding, request(narrow));
    const typed = request(narrow, broad);
    const final = await assess({ binding, receipts: [], arm: 'on-demand',
        acquire: query => retrieve(cwd, binding, query, {
            caps: { ...sourceLimits, evidenceBytes: first.budget.evidenceBytes },
        }),
        ask: ({ receipts, followup }) => {
            if (!followup) return { candidate: binding.candidate, kind: 'request', verdict: null, citations: [],
                reason: 'Request pinned source.', nextStep: null, request: typed };
            assert.deepEqual(receipts, first.receipts);
            assert.equal(followup.status, 'partial');
            assert.equal(followup.results[1].reason, 'evidence-packet-budget');
            assert(byteLength(JSON.stringify({ receipts, followup })) <= limits.packetBytes);
            return { candidate: binding.candidate, kind: 'verdict', verdict: 'refuted', citations: [receipts[0].id],
                reason: 'Simulated disposition on the retained receipt.', nextStep: null, request: null };
        },
    });
    assert.deepEqual(final.citations, [first.receipts[0].id]);
});
