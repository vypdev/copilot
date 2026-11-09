'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { assess, dryRunPorts, receipt, retrieve, selectAnchor, limits } = require('./contract.cjs');

const prior = require('../on-demand/contract.cjs');
const location = (line, side = 'RIGHT') => ({ path: 'fixture.py', side, line });
const patch = '@@ -1,2 +1,4 @@\n def fixture(\n+    *,\n+    expected_schema_fixture: int,\n ):';
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const binding = (cwd, scopes = ['']) => ({ head: git(cwd, 'rev-parse', 'HEAD'), tree: git(cwd, 'rev-parse', 'HEAD^{tree}'),
    operation: 'test-operation', candidate: 'frozen-candidate', scopes });
const target = (match, scope, query, workspace = null) => ({ scope, query, workspace, match, start: null, end: null });
const search = (...targets) => ({ kind: 'searchTree', targets });
const req = (scope, start = 1, end = 1) => ({ kind: 'readBlob', targets: [{ ...target('lines', scope, null), start, end }] });

test('the old line 9 escaped its block, the fixed one remains unresolved', () => {
    const diff = '@@ -10 +10,2 @@\n old\n+causal';
    assert.deepEqual(prior.selectAnchor(location(9), diff).selected, location(11));
    assert.deepEqual(selectAnchor(location(9), diff), { original: location(9), selected: null, reason: 'outside-change-block' });
    assert.equal(selectAnchor(location(10), diff).reason, 'outside-change-block');
});
test('the pytest separator selects a unique causal line in the same block', () => {
    assert.deepEqual(selectAnchor(location(2), patch).selected, location(3));
    assert.deepEqual(selectAnchor(location(3), patch).selected, location(3));
    assert.equal(selectAnchor(location(2), patch.replace('+    expected', ' \n+    expected')).reason, 'original-only-change');
});
test('two eligible additions in the same block are ambiguous', () => {
    const diff = patch.replace('+    expected_schema_fixture: int,', '+    expected_schema_fixture: int,\n+    second: int,');
    assert.deepEqual(selectAnchor(location(2), diff), { original: location(2), selected: null, reason: 'ambiguous' });
});
test('existing left deletion and surviving right neighbor are preserved', () => {
    const diff = '@@ -9,3 +9,2 @@\n context\n-removed\n survives';
    assert.equal(selectAnchor(location(10, 'LEFT'), diff).reason, 'original-deletion');
    assert.deepEqual(selectAnchor(location(10), diff).selected, location(10));
    assert.equal(selectAnchor(location(10), diff).reason, 'deletion-neighbor');
});

const withGit = fn => async t => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), '950-tree-test-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    git(cwd, 'init', '-q');
    for (const [name, text] of Object.entries({
        'src/a/config.ts': 'const token = 1;',
        'src/b/config.ts': 'const token = 2;',
        'other/outside.ts': 'token',
        'package.json': '{"workspaces":["src/*"]}',
        'src/a/package.json': '{"name":"@local/a"}',
        'src/b/package.json': '{"name":"@local/b"}',
        'other/package.json': '{"name":"@local/a"}',
    })) {
        mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
        writeFileSync(path.join(cwd, name), text);
    }
    git(cwd, 'add', '.');
    git(cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Pilot',
        '-c', 'user.email=pilot@example.invalid', 'commit', '-qm', 'immutable evidence fixture');
    await fn(cwd);
};

test('scope and filename ambiguity are explicit and ordered', withGit(cwd => {
    const result = retrieve(cwd, binding(cwd, ['src']), search(target('name', 'src', 'config.ts')));
    assert.equal(result.status, 'ambiguous');
    assert.deepEqual(result.results[0].paths, ['src/a/config.ts', 'src/b/config.ts']);
    assert.deepEqual(result.receipts, []);
    assert.equal(retrieve(cwd, binding(cwd, ['src']), search(target('literal', 'src', 'token'))).status, 'ambiguous');
}));
test('declared package workspaces disambiguate repeated names', withGit(cwd => {
    const result = retrieve(cwd, binding(cwd), search(target('name', '', 'config.ts', '@local/a')));
    assert.equal(result.status, 'provided');
    assert.equal(result.results[0].workspace, 'src/a');
    assert.equal(result.receipts[0].path, 'src/a/config.ts');
}));
test('absence and unsafe scope fail without fabricated evidence', withGit(cwd => {
    const b = binding(cwd, ['src']);
    assert.equal(retrieve(cwd, b, search(target('name', 'src', 'missing.ts'))).status, 'absent');
    assert.equal(retrieve(cwd, b, search(target('literal', 'other', 'token')), { runGit: assert.fail }).reason, 'scope-denied');
    assert.equal(retrieve(cwd, b, req('src/../other/outside.ts'), { runGit: assert.fail }).reason, 'scope-denied');
    assert.equal(retrieve(cwd, b, req('src-other/a.ts'), { runGit: assert.fail }).reason, 'scope-denied');
}));
test('file, match, byte and deadline ceilings cannot return partial receipts', withGit(cwd => {
    const b = binding(cwd);
    const query = search(target('name', 'src/a', 'config.ts'), target('literal', 'src', 'token'));
    for (const [caps, reason] of [
        [{ openedFiles: 1 }, 'search-file-budget'], [{ matches: 2 }, 'match-budget'],
        [{ scanBytes: 4 }, 'scan-byte-budget'], [{ treeEntries: 1 }, 'tree-entry-budget'],
    ]) assert.deepEqual(retrieve(cwd, b, query, { caps: { ...limits, ...caps } }), { status: 'budget', reason });
    let tick = 0;
    assert.deepEqual(retrieve(cwd, b, query, { clock: () => (tick += 4500) }), { status: 'expired', reason: 'source-deadline' });
}));
test('identical clauses reuse a receipt and the pinned tree outranks dirty files', withGit(cwd => {
    writeFileSync(path.join(cwd, 'src/a/config.ts'), 'uncommitted');
    const hit = target('literal', 'src/a/config.ts', 'token');
    const result = retrieve(cwd, binding(cwd), search(hit, hit));
    assert.equal(result.receipts.length, 1);
    assert.equal(result.receipts[0].text, 'const token = 1;');
    assert.equal(result.results[0].receiptIds[0], result.results[1].receiptIds[0]);
}));
test('foreign head and substituted tree are refused', withGit(cwd => {
    const b = binding(cwd);
    assert.equal(retrieve(cwd, { ...b, tree: 'b'.repeat(40) }, req('src/a/config.ts')).reason, 'revision-tree-mismatch');
}));

const verdict = (b, citations) => ({ candidate: b.candidate, kind: 'verdict', verdict: 'confirmed', citations,
    reason: 'causal premise', nextStep: null, request: null });
const request = (b, evidence) => ({ candidate: b.candidate, kind: 'request', verdict: null, citations: [],
    reason: 'missing source', nextStep: null, request: evidence });
test('model cannot supply a new anchor after freeze', withGit(async cwd => {
    const b = binding(cwd);
    const witness = retrieve(cwd, b, req('src/a/config.ts')).receipts[0];
    await assert.rejects(assess({ binding: b, receipts: [witness], arm: 'on-demand',
        ask: () => ({ ...verdict(b, [witness.id]), anchor: location(99) }), acquire: assert.fail }), { code: 'invalid-response' });
}));
test('foreign revision citation stops the batch before every write port', withGit(async cwd => {
    const b = binding(cwd);
    const initial = receipt(b, { kind: 'diff', text: 'known' });
    const foreign = receipt({ ...b, head: 'd'.repeat(40) }, { kind: 'git', text: 'elsewhere' });
    const writes = [];
    const ports = dryRunPorts(name => writes.push(name));
    const run = async () => {
        await assess({ binding: b, receipts: [initial], arm: 'on-demand',
            ask: ({ followup }) => {
                assert.equal(followup, undefined, 'foreign receipt must not reach the verifier');
                return request(b, req('src/a/config.ts'));
            },
            acquire: () => ({ status: 'provided', receipts: [foreign] }),
        });
        ports.publishFinding();
    };
    await assert.rejects(run, { code: 'citation-integrity' });
    assert.deepEqual(writes, []);
    assert.throws(() => ports.approve(), { code: 'dry-run-write-port' });
}));

const demand = process.env.BUGBOT_TREE_PRIOR_SUBJECTS;
const v4 = process.env.BUGBOT_TREE_V4_SUBJECTS;
test('#869 resolves the scoped package and basename on the actual pinned trees', () => {
    assert(demand, 'BUGBOT_TREE_PRIOR_SUBJECTS is required');
    for (const subject of ['R1', 'R2']) {
        const cwd = path.join(demand, subject);
        const b = binding(cwd);
        const expected = require('../on-demand/held-out.lock.json')[subject].binding;
        assert.deepEqual([b.head, b.tree], [expected.head, expected.tree]);
        const result = retrieve(cwd, b, search(target('name', '', 'playwright.entry.config.ts', '@domus/frontend')));
        assert.equal(result.status, 'provided');
        assert.equal(result.results[0].workspace, 'frontend');
        assert.equal(result.receipts[0].path, 'frontend/playwright.entry.config.ts');
        assert.match(result.receipts[0].text, /url: .*\/__fixture__\/ready/u);
    }
});
test('#875 supplies worker construction and initial sequence in one round', () => {
    assert(v4, 'BUGBOT_TREE_V4_SUBJECTS is required');
    for (const subject of ['J1', 'J2']) {
        const cwd = path.join(v4, subject);
        const b = binding(cwd);
        const expected = require('../v4/subjects.lock.json')[subject];
        assert.deepEqual([b.head, b.tree], [expected.head, expected.tree]);
        const result = retrieve(cwd, b, search(
            target('literal', 'tests/python/test_image_channel.py', 'def worker('),
            target('literal', 'tests/browser/image_channel.py', 'self.sequence = 0'),
        ));
        assert.equal(result.status, 'provided');
        assert.equal(result.receipts.length, 2);
        assert.match(result.receipts[0].text, /return ImageChannel\(/u);
        assert.match(result.receipts[1].text, /self\.sequence = 0[\s\S]*self\.sequence \+= 1/u);
        for (const proof of result.receipts) {
            assert.deepEqual([proof.operation, proof.candidate, proof.head, proof.tree], [b.operation, b.candidate, b.head, b.tree]);
        }
    }
});
