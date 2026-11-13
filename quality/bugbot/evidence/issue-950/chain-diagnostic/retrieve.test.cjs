'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { scenario } = require('../partial-diagnostic/runner.cjs');
const { nativeGit, sourceLimits } = require('../tree-search/git-evidence.cjs');
const { locked, rows, simulate } = require('./replay.cjs');
const { retrieve } = require('./retrieve.cjs');

const directory = process.env.BUGBOT_CHAIN_SUBJECTS;
const row = rows.find(item => item.subject === 'H1' && item.request.targets.length === 2);
const fixture = scenario('H1', directory, locked);
const anchor = fixture.anchor.selected;
const binding = { ...fixture.b, scopes: [''], candidate: 'quantity-candidate', operation: 'quantity-operation' };
const options = { anchor };

test('scope denial happens before any tree read and another revision cannot mint receipts', () => {
    const restricted = { ...binding, scopes: ['frontend/src/presentation'] };
    assert.deepEqual(retrieve(fixture.cwd, restricted, row.request, { ...options, runGit: () => assert.fail('Git read') }),
        { status: 'denied', reason: 'scope-denied' });
    const stale = retrieve(fixture.cwd, { ...binding, tree: locked.H2.binding.tree }, row.request, options);
    assert.deepEqual(stale, { status: 'denied', reason: 'revision-tree-mismatch' });
});

test('file and time ceilings stop expansion without providing a chain', () => {
    const files = retrieve(fixture.cwd, binding, row.request, { ...options, caps: { ...sourceLimits, openedFiles: 1 } });
    assert.equal(files.reason, 'opened-file-budget');
    assert.equal(files.budget.openedFiles, 1);
    assert.equal(files.receipts, undefined);
    let ticks = 0;
    const time = retrieve(fixture.cwd, binding, row.request, { ...options, clock: () => ticks++ * sourceLimits.sourceWallMs });
    assert.equal(time.reason, 'source-deadline');
    assert.equal(time.budget.gitCalls, 0);
    assert.equal(time.receipts, undefined);
});

test('corrupted Git blob data fails the whole lookup', () => {
    const result = retrieve(fixture.cwd, binding, row.request, { ...options, runGit(cwd, args, timeout, bytes) {
        const raw = nativeGit(cwd, args, timeout, bytes);
        return args[0] === 'cat-file' ? raw.replace(/^[\s\S]/u, 'x') : raw;
    } });
    assert.equal(result.reason, 'blob-integrity');
    assert.equal(result.receipts, undefined);
});

test('a competing typed producer is not attributed and ordinary Git lookup still works', t => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbot-chain-ambiguity-'));
    t.after(() => fs.rmSync(cwd, { recursive: true }));
    const git = (...args) => execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null',
        '-c', 'commit.gpgsign=false', '-c', 'user.email=pilot@example.invalid', '-c', 'user.name=Pilot', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('clone', '-q', '--shared', fixture.cwd, '.');
    const decoder = 'frontend/src/adapters/task-values.ts';
    fs.appendFileSync(path.join(cwd, decoder),
        '\nexport function alternateDetail(value: unknown, occurrenceId: string, householdId: string): TaskDetail {\n'
        + '  return taskDetail(value, occurrenceId, householdId);\n}\n');
    git('add', '--', decoder);
    git('commit', '-qm', 'Add a second candidate producer');
    const pinned = { ...binding, head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') };
    const result = retrieve(cwd, pinned, { ...row.request, targets: [row.request.targets[0]] }, options);
    assert.equal(result.status, 'provided');
    assert.equal(result.chain, undefined);
    assert.equal(result.chainReason, 'ambiguous-decoder');
    assert(result.receipts.length > 0);
    assert(result.receipts.every(proof => proof.path === 'frontend/src/domain/tasks.ts'));
    assert(result.budget.openedFiles > 1 && result.budget.openedFiles <= sourceLimits.openedFiles);
});

test('the successor rejects foreign citations and second requests at the delivery boundary', async () => {
    const citation = await simulate(row, fixture, () => ({ citations: ['r-foreign'] }));
    assert.equal(citation.error.code, 'citation-integrity');
    assert.equal(citation.calls.length, 2);
    assert.deepEqual(citation.writes, []);
    const repeated = await simulate(row, fixture, () => ({ kind: 'request', request: row.request,
        nextStep: null, verdict: null, citations: [] }));
    assert.equal(repeated.error.code, 'second-request');
    assert.equal(repeated.calls.length, 2);
    assert.deepEqual(repeated.writes, []);
});

test('the simulator fails closed if publication is attempted', async () => {
    const result = await simulate(row, fixture, undefined, { publicationMode: 'live' });
    assert.equal(result.error.message, 'dry-run-write-port');
    assert.equal(result.calls.length, 0);
    assert.deepEqual(result.writes, ['publishReview']);
});
