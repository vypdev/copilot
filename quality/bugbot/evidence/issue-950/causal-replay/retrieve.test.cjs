'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { retrieve } = require('./retrieve.cjs');
const { assess, limits } = require('../tree-search/contract.cjs');
const { anchor, fixture, lateAssignment, request } = require('./inspection-fixture.cjs');

test('an assignment after the constructor call cannot identify its parameter', t => {
    const { cwd, binding, options } = fixture(t, lateAssignment);
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.reason, 'effective-constructor-unproven');
    assert.deepEqual(result.receipts, []);
});

test('the last prior assignment wins and a later overwrite cannot change the passed instance', t => {
    const { cwd, binding, options } = fixture(t, [
        'def create():',
        '    store = AlphaDatabase()',
        '    store = BetaDatabase()',
        '    inspection = Inspection(store)',
        '    store = AlphaDatabase()',
        '    return inspection',
    ].join('\n'));
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'provided', result.reason);
    assert.deepEqual(result.anchor, anchor);
    assert.equal(result.links.find(link => link.role === 'implementation').symbol, 'BetaRepo.active_key');
    const proof = result.receipts.find(item => item.path.endsWith('/runtime.py'));
    assert.match(proof.text, /store = BetaDatabase\(\)/u);
    assert.doesNotMatch(proof.text, /store = AlphaDatabase\(\)/u);
});

test('two writes reaching the same constructor from distinct branches are ambiguous', t => {
    const { cwd, binding, options } = fixture(t, [
        'def create(use_alpha):',
        '    if use_alpha:',
        '        store = AlphaDatabase()',
        '    else:',
        '        store = BetaDatabase()',
        '    return Inspection(store)',
    ].join('\n'));
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.reason, 'wiring-assignment-ambiguous');
    assert.deepEqual(result.receipts, []);
});

test('an exiting branch does not compete with the assignment reaching the constructor', t => {
    const { cwd, binding, options } = fixture(t, [
        'def create(stop):',
        '    if stop:',
        '        store = AlphaDatabase()',
        '        return None',
        '    else:',
        '        store = BetaDatabase()',
        '    return Inspection(store)',
    ].join('\n'));
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'provided', result.reason);
    assert.equal(result.links.find(link => link.role === 'implementation').symbol, 'BetaRepo.active_key');
});

test('a local write later in a closure does not let a prior use resolve to the outer binding', t => {
    const { cwd, binding, options } = fixture(t, [
        'def create():',
        '    store = AlphaDatabase()',
        '    def inner():',
        '        inspection = Inspection(store)',
        '        store = BetaDatabase()',
        '        return inspection',
        '    return inner()',
    ].join('\n'));
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'unresolved');
    assert.deepEqual(result.receipts, []);
});

test('declaration and two implementations without an assembly link remain unresolved', t => {
    const { cwd, binding, options } = fixture(t, 'def create(store):\n    return Inspection(store)\n');
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.reason, 'effective-constructor-unproven');
    assert.deepEqual(result.receipts, []);
});

test('two explicitly wired implementations remain ambiguous', t => {
    const { cwd, binding, options } = fixture(t, 'def first():\n    return Inspection(AlphaDatabase())\n\ndef second():\n    return Inspection(BetaDatabase())\n');
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.reason, 'effective-constructor-ambiguous');
    assert.deepEqual(result.paths, ['pkg/adapters/alpha.py', 'pkg/adapters/beta.py']);
    assert.deepEqual(result.receipts, []);
});

test('an imported concrete binding wins over unbound definitions and keeps the anchor', t => {
    const { cwd, binding, options } = fixture(t, 'def create():\n    return Inspection(BetaDatabase())\n');
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'provided', result.reason);
    assert.deepEqual(result.anchor, anchor);
    assert.equal(result.links.find(item => item.role === 'implementation').symbol, 'BetaRepo.active_key');
    assert(!result.receipts.some(item => item.path.endsWith('/alpha.py')));
});

test('discovery, Git opens and output share one hard budget', t => {
    const { cwd, binding, options } = fixture(t, 'def create():\n    return Inspection(BetaDatabase())\n');
    for (const [cap, reason] of [
        [{ treeEntries: 1 }, 'tree-entry-budget'],
        [{ openedFiles: 1 }, 'opened-file-budget'],
        [{ scanBytes: 200 }, 'scan-byte-budget'],
        [{ evidenceBytes: 400 }, 'evidence-packet-budget'],
    ]) {
        const result = retrieve(cwd, binding, request, { ...options, caps: { ...limits, ...cap } });
        assert.equal(result.status, 'budget');
        assert.equal(result.reason, reason);
        assert(!result.receipts?.length);
    }
});

test('the existing single round validates new receipts and rejects another request', async t => {
    const { cwd, binding, options } = fixture(t, 'def create():\n    return Inspection(BetaDatabase())\n');
    const askForSource = { candidate: binding.candidate, kind: 'request', verdict: null, citations: [],
        reason: 'Need pinned evidence.', nextStep: null, request };
    const acquire = req => retrieve(cwd, binding, req, options);
    const verdict = await assess({ binding, receipts: [], arm: 'on-demand', acquire, ask: ({ receipts, followup }) => {
        if (!followup) return askForSource;
        return { candidate: binding.candidate, kind: 'verdict', verdict: 'refuted',
            citations: [receipts.at(-1).id], reason: 'Deterministic response.', nextStep: null, request: null };
    } });
    assert.equal(verdict.verdict, 'refuted');
    await assert.rejects(assess({ binding, receipts: [], arm: 'on-demand', acquire, ask: () => askForSource }),
        { code: 'second-request' });
});
