'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { git, receipt } = require('../on-demand/contract.cjs');
const { digest, byteLength } = require('../v4/verification.cjs');
const { retrieve: frozen } = require('../tree-search/git-evidence.cjs');
const { retrieve, sourceLimits } = require('./git-evidence.cjs');
const locked = require('../module-diagnostic/held-out.lock.json');
const oracle = require('../module-diagnostic/oracle.json');
const trials = fs.readFileSync(path.join(__dirname, '../module-diagnostic/trials.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

const target = query => ({ scope: 'frontend/src/domain', workspace: null, match: 'literal', query, start: null, end: null });
const request = (...targets) => ({ kind: 'searchTree', targets });

function attest(cwd, binding, result) {
    const receipts = result.receipts ?? [];
    const ids = new Set(receipts.map(item => item.id));
    assert.equal(ids.size, receipts.length);
    for (const item of receipts) {
        assert.equal(item.blob, git(cwd, 'rev-parse', `${binding.head}:${item.path}`).trim());
        const lines = git(cwd, 'cat-file', 'blob', item.blob).replace(/\r\n/g, '\n').split('\n');
        assert(item.start >= 1 && item.end >= item.start && item.end <= lines.length);
        assert(item.end - item.start + 1 <= sourceLimits.lines);
        assert.equal(item.text, lines.slice(item.start - 1, item.end).join('\n'));
        assert(byteLength(item.text) <= sourceLimits.fragmentBytes);
        assert.deepEqual(item, receipt(binding, item));
    }
    assert(result.results.every(row => (row.receiptIds ?? []).every(id => ids.has(id))));
    const { budget } = result;
    assert(budget.openedFiles <= sourceLimits.openedFiles);
    assert(budget.sourceBytes <= sourceLimits.scanBytes);
    assert(budget.treeEntries <= sourceLimits.treeEntries);
    assert(budget.matches <= sourceLimits.matches);
    assert(budget.elapsedMs <= sourceLimits.sourceWallMs);
    assert(receipts.length <= sourceLimits.receiptCount);
    assert.equal(budget.evidenceBytes, receipts.reduce((sum, item) => sum + byteLength(JSON.stringify(item)), 0));
    assert(budget.evidenceBytes <= sourceLimits.evidenceBytes);
}

function replay(fixtures) {
    const requests = trials.filter(row => row.event === 'evidence-requested' && row.arm === 'on-demand'
        && Object.hasOwn(locked, row.subject));
    assert.equal(requests.length, 10);
    for (const [index, row] of requests.entries()) {
        const fixture = locked[row.subject];
        const cwd = path.join(fixtures, row.subject);
        const { head, tree } = fixture.binding;
        assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), head);
        assert.equal(git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), tree);
        const candidate = fixture.candidate.id + '-' + digest(JSON.stringify([fixture.candidate,
            { path: fixture.candidate.path, side: 'RIGHT', line: fixture.candidate.line }, fixture.binding.diffSha256])).slice(0, 12);
        const binding = { head, tree, operation: digest(`module-diagnostic/${row.model}/${row.subject}/${row.repetition}`),
            candidate, scopes: [''] };
        const before = frozen(cwd, binding, row.request);
        const after = retrieve(cwd, binding, row.request);
        attest(cwd, binding, after);
        const decisive = oracle[row.subject].decisive;
        const covers = result => (result.receipts ?? []).some(item => item.path === decisive.path
            && item.start <= decisive.start && item.end >= decisive.end);
        console.log(JSON.stringify({ order: index + 1, ...row, binding, before, after,
            decisiveBefore: covers(before), decisiveAfter: covers(after) }));
    }
}

if (require.main === module) replay(process.argv[2]);
module.exports = { target, request, attest };
