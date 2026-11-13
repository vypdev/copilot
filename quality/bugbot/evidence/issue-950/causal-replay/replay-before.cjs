'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.dirname(__dirname);
const baseline = 'f1b782117b9cb02aa80a0cb9a237425bfb04df23';
const fixtureRoot = path.resolve(process.argv[2]);
const source = 'quality/bugbot/evidence/issue-950/tree-search/git-evidence.cjs';
assert.deepEqual(fs.readFileSync(path.join(root, 'tree-search/git-evidence.cjs')),
    execFileSync('git', ['-C', root, 'show', baseline + ':' + source]));
const { retrieve, nativeGit, sourceLimits } = require(path.join(root, 'tree-search/git-evidence.cjs'));
const { digest } = require(path.join(root, 'v4/verification.cjs'));
const locked = require(path.join(root, 'tree-search/held-out.lock.json'));
const rows = fs.readFileSync(path.join(root, 'tree-search/trials.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    .filter(row => row.event === 'result' && row.arm === 'on-demand' && Object.hasOwn(locked, row.subject));
assert.equal(rows.length, 12);
assert.equal(new Set(rows.map(row => row.trial)).size, 12);

for (const row of rows) {
    const f = locked[row.subject];
    const cwd = path.join(fixtureRoot, row.subject);
    const read = (...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
    assert.equal(read('rev-parse', 'HEAD').trim(), f.binding.head);
    assert.equal(read('rev-parse', 'HEAD^{tree}').trim(), f.binding.tree);
    assert.equal(read('status', '--porcelain'), '');
    const diff = read('-c', 'core.quotePath=true', 'diff', '--no-ext-diff', '--no-textconv',
        '--no-renames', '--unified=3', f.binding.base, f.binding.head, '--', ...f.binding.paths);
    assert.equal(digest(diff), f.binding.diffSha256);
    assert.equal(row.head, f.binding.head);
    const binding = { head: f.binding.head, tree: f.binding.tree, scopes: [''],
        operation: digest(`tree-search/${row.model}/${row.subject}/${row.repetition}`),
        candidate: f.candidate.id + '-' + digest(JSON.stringify([f.candidate, row.anchor.selected, f.binding.diffSha256])).slice(0, 12) };
    const budget = { gitCalls: 0, treeEntries: 0, openedFiles: 0, sourceBytes: 0 };
    const start = performance.now();
    const result = retrieve(cwd, binding, row.evidenceRequest, { caps: sourceLimits, runGit: (repo, args, timeout, bytes) => {
        budget.gitCalls++;
        const data = nativeGit(repo, args, timeout, bytes);
        if (args[0] === 'ls-tree') budget.treeEntries += data.split('\0').filter(Boolean).length;
        if (args[0] === 'cat-file' && args[1] === 'blob') {
            budget.openedFiles++;
            budget.sourceBytes += Buffer.byteLength(data);
        }
        return data;
    } });
    budget.elapsedMs = Math.round(performance.now() - start);
    assert.deepEqual(result, { status: 'budget', reason: 'search-file-budget' });
    console.log(JSON.stringify({ trial: row.trial, subject: row.subject, model: row.model, repetition: row.repetition,
        head: binding.head, tree: binding.tree, operation: binding.operation, candidate: binding.candidate,
        anchor: row.anchor.selected, request: row.evidenceRequest, result, budget }));
}
