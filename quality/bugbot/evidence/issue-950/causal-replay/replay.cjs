'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { retrieve } = require('./retrieve.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { sourceLimits } = require('../tree-search/git-evidence.cjs');
const { digest, diffExcerpt } = require('../v4/verification.cjs');
const locked = require('../tree-search/held-out.lock.json');
const oracle = require('../tree-search/oracle.json');

const jsonl = file => readFileSync(path.join(__dirname, file), 'utf8').trim().split('\n').map(JSON.parse);
const baseline = jsonl('before.jsonl');
const recorded = jsonl('../tree-search/trials.jsonl')
    .filter(row => row.event === 'result' && row.arm === 'on-demand' && Object.hasOwn(locked, row.subject));

function covers(ranges, start, end) {
    return ranges.some(range => range.start <= start && range.end >= end);
}

function attest(cwd, binding, proof) {
    assert.equal(proof.kind, 'git');
    for (const key of ['head', 'tree', 'candidate', 'operation']) assert.equal(proof[key], binding[key]);
    assert.equal(git(cwd, 'rev-parse', binding.head + ':' + proof.path).trim(), proof.blob);
    const lines = git(cwd, 'cat-file', 'blob', proof.blob).replace(/\r\n/g, '\n').split('\n');
    let last = 0, count = 0;
    const text = proof.ranges.map(({ start, end }) => {
        assert(start > last && end >= start && end <= lines.length);
        last = end;
        count += end - start + 1;
        return lines.slice(start - 1, end).join('\n');
    }).join('\n\n');
    assert(count <= sourceLimits.lines && Buffer.byteLength(text) <= sourceLimits.fragmentBytes);
    assert.equal(proof.text, text);
    assert.deepEqual(receipt(binding, proof), proof);
}

function verifyChain(cwd, binding, result, fixture, subject) {
    assert.equal(result.status, 'provided', result.reason);
    const { path: callerPath, line } = fixture.candidate;
    const anchor = { path: callerPath, line, side: 'RIGHT' };
    assert.deepEqual(result.anchor, anchor);
    const decisive = oracle[subject].decisive;
    assert(result.receipts.length <= sourceLimits.receiptCount);
    for (const proof of result.receipts) attest(cwd, binding, proof);
    const byId = new Map(result.receipts.map(item => [item.id, item]));
    assert.equal(byId.size, result.receipts.length);
    for (const { witnesses } of result.links) for (const witness of witnesses) {
        const proof = byId.get(witness.receiptId);
        assert.equal(proof?.path, witness.path);
        assert(covers(proof.ranges, witness.start, witness.end));
    }
    const text = role => result.links.find(link => link.role === role).witnesses
        .map(witness => byId.get(witness.receiptId).text).join('\n');
    assert.match(text('caller'), /class RecurrenceReview[\s\S]*transactions: Transactions[\s\S]*with self\.transactions\.read\(\) as unit:[\s\S]*return review_target\(\s+unit,/u);
    assert.match(text('wiring'), /RecurrenceReview\(store,/u);
    assert.match(text('wiring'), /store = SQLiteDatabase\(database, installation\)/u);
    assert.match(text('wiring'), /return _compose_business\(identity, store, origins\)/u);
    assert.match(text('wiring'), /tasks = task_contexts\(store, store\.installation\)/u);
    assert.match(text('unit'), /yield SQLiteUnit\(connection, self\.installation\)/u);
    assert.match(text('unit'), /return self\._transaction\(write=False\)/u);
    assert.match(text('unit'), /self\.recurrence = SQLiteRecurrences\(connection, installation\)/u);
    const method = result.receipts.find(proof => proof.path === decisive.path);
    assert(covers(method.ranges, decisive.start, decisive.end));
    assert.match(method.text, /def current_schedule_id[\s\S]*SELECT schedule_id[\s\S]*return None[\s\S]*return schedule_id/u);
    assert.equal(method.text.includes("AND state!='retired'"), subject === 'T1');
    assert.match(method.text, /def schedule[\s\S]*WHERE household_id=\? AND schedule_id=\?[\s\S]*timing_kind='fixed_calendar'/u);

    // Verify the material pre-existing caller receipt and the exact hunk shown
    // in the earlier replay. The evaluator reads the whole action branch too.
    const caller = fixture.evidence.find(item => item.path === callerPath);
    const lines = git(cwd, 'show', binding.head + ':' + callerPath).split('\n');
    assert.equal(git(cwd, 'rev-parse', binding.head + ':' + callerPath).trim(), caller.blob);
    assert.equal(lines.slice(caller.start - 1, caller.end).join('\n'), caller.text);
    const flow = result.callerFlow;
    assert.equal(flow.path, callerPath);
    assert(covers([caller], flow.callLine, flow.branchLine));
    assert.match(lines[flow.callLine - 1], /schedule_id = unit\.recurrence\.current_schedule_id\(/u);
    assert.match(lines[flow.exitStart - 1], /if schedule_id is None:/u);
    assert.match(lines[flow.exitEnd - 1], /\("attachment",\) if slot is None else \(\)/u);
    assert.match(lines[flow.consumerLine - 1], /fixed = unit\.recurrence\.schedule\(scope\.household_id, schedule_id\)/u);
    assert.match(lines[flow.branchLine - 1], /if fixed is not None:/u);
    const patch = git(cwd, 'diff', '--no-ext-diff', '--no-textconv', fixture.binding.base, binding.head, '--', callerPath);
    assert.match(diffExcerpt({ file: callerPath, line }, [{ filename: callerPath, patch: patch.slice(patch.indexOf('@@ ')) }]),
        /"fixed-state",[\s\S]*"fixed-pattern",[\s\S]*"fixed-replacement"/u);
    assert.match(lines.slice(line - 1, 103).join('\n'), /return ReviewTarget\([\s\S]*actions,/u);
    assert.equal(result.budget.gitCalls, 3 + 2 * result.budget.openedFiles);
    assert(result.budget.openedFiles <= sourceLimits.openedFiles);
    assert(result.budget.sourceBytes + result.budget.discoveryBytes <= sourceLimits.scanBytes);
    assert(result.budget.treeEntries + result.budget.diffEntries <= sourceLimits.treeEntries);
    assert(result.budget.elapsedMs < sourceLimits.sourceWallMs);
    assert(result.budget.evidenceBytes <= sourceLimits.evidenceBytes);
    assert(result.budget.matches <= sourceLimits.matches);
    return true;
}

function run(fixtures, onResult) {
    assert.equal(recorded.length, 12);
    assert.equal(baseline.length, 12);
    for (const [i, row] of recorded.entries()) {
        const before = baseline[i];
        assert.equal(before.trial, row.trial);
        assert.deepEqual(before.request, row.evidenceRequest);
        const fixture = locked[row.subject];
        const cwd = path.resolve(fixtures, row.subject);
        assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), fixture.binding.head);
        assert.equal(git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), fixture.binding.tree);
        const diff = git(cwd, '-c', 'core.quotePath=true', 'diff', '--no-ext-diff', '--no-textconv',
            '--no-renames', '--unified=3', fixture.binding.base, fixture.binding.head, '--', ...fixture.binding.paths);
        assert.equal(digest(diff), fixture.binding.diffSha256);
        const { operation, candidate, head, tree } = before;
        const binding = { operation, candidate, head, tree, scopes: [''] };
        const result = retrieve(cwd, binding, row.evidenceRequest, {
            context: { base: fixture.binding.base, anchor: row.anchor.selected },
        });
        let sufficient = false, failure;
        try { sufficient = verifyChain(cwd, binding, result, fixture, row.subject); }
        catch (error) { failure = error.message; }
        onResult({ ...before, result: before.result, after: result, sufficient, ...(failure && { failure }) });
    }
}

if (require.main === module) {
    run(process.argv[2], row => {
        console.log(JSON.stringify(row));
        if (!row.sufficient) process.exitCode = 1;
    });
}

module.exports = { run };
