'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scenario } = require('../partial-diagnostic/runner.cjs');
const { git } = require('../on-demand/contract.cjs');
const { limits, receipt } = require('../tree-search/contract.cjs');
const { trial } = require('./runner.cjs');
const locked = require('../module-diagnostic/held-out.lock.json');

const rows = fs.readFileSync(path.join(__dirname, '../module-diagnostic/trials.jsonl'), 'utf8').trim().split('\n')
    .map(JSON.parse).filter(row => row.event === 'evidence-requested' && row.arm === 'on-demand' && Object.hasOwn(locked, row.subject));
const expected = {
    'frontend/src/presentation/domus-tasks.ts': [[6, 6], [20, 27], [115, 127], [129, 129], [139, 145]],
    'frontend/src/domain/tasks.ts': [[28, 30], [109, 109], [114, 116]],
    'frontend/src/adapters/task-values.ts': [[46, 46], [63, 70], [82, 85]],
};

function block(prompt, origin) {
    const marker = `[BEGIN_UNTRUSTED_DATA origin=${origin} length=`;
    const start = prompt.indexOf(marker);
    if (start < 0) return undefined;
    const end = prompt.indexOf('\n', start);
    const tag = prompt.slice(start, end);
    const terminator = / terminator=(\[END_UNTRUSTED_DATA(?:_\d+)?\])\]$/u.exec(tag)?.[1];
    assert(terminator);
    const text = prompt.slice(end + 1, prompt.indexOf('\n' + terminator, end + 1));
    assert.equal(text.length, Number(/^\d+/u.exec(tag.slice(marker.length))[0]));
    return JSON.parse(text);
}

async function simulate(row, fixture, respond, options) {
    const calls = [];
    const result = await trial(row, fixture, (message, mode, cwd, deadline) => {
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        assert(deadline > 0 && deadline <= limits.callWallMs);
        const candidate = block(message.prompt, 'frozen candidate');
        const packet = block(message.prompt, 'application receipts');
        const next = block(message.prompt, 'evidence request result');
        calls.push({ candidate, packet, next });
        const envelope = { candidate: candidate.id, reason: 'Deterministic delivery control.' };
        if (calls.length === 1) {
            assert.equal(next, undefined);
            assert.deepEqual(message.options.schema.properties.kind.enum, ['verdict', 'request']);
            return { ...envelope, kind: 'request', verdict: null, citations: [], request: row.request, nextStep: null };
        }
        assert.equal(calls.length, 2);
        assert.deepEqual(message.options.schema.properties.kind.enum, ['verdict']);
        return { ...envelope, kind: 'verdict', verdict: 'inconclusive', citations: next.receiptIds,
            request: null, nextStep: 'Delivery control only.', ...respond?.(row, calls, message) };
    }, options);
    return { calls, ...result };
}

function attest(fixture, calls, result, request) {
    assert.equal(calls.length, 2);
    const [first, second] = calls;
    assert.deepEqual(first.candidate, second.candidate);
    assert.deepEqual(second.candidate.anchor, fixture.anchor.selected);
    assert.deepEqual(second.packet.slice(0, first.packet.length), first.packet);
    assert.deepEqual(second.next.request, request);
    assert.equal(second.next.chain, 'typescript-form');
    assert.deepEqual(result.writes, []);
    const retrieved = second.packet.slice(first.packet.length);
    assert.deepEqual(second.next.receiptIds, retrieved.map(item => item.id));
    assert.deepEqual(retrieved.map(item => item.path).sort(), Object.keys(expected).sort());
    for (const proof of retrieved) {
        for (const key of ['candidate', 'operation', 'head', 'tree']) assert.equal(proof[key], first.packet[0][key]);
        assert.deepEqual(receipt(proof, proof), proof);
        const locator = fixture.b.head + ':' + proof.path;
        const lines = git(fixture.cwd, 'show', locator).replace(/\r\n/g, '\n').split('\n');
        const ranges = proof.ranges ?? [proof];
        assert.equal(proof.blob, git(fixture.cwd, 'rev-parse', locator).trim());
        assert.equal(proof.text, ranges.map(({ start, end }) => lines.slice(start - 1, end).join('\n')).join('\n\n'));
        assert(expected[proof.path].every(([from, to]) => ranges.some(({ start, end }) => start <= from && end >= to)));
    }
    const budget = second.next.budget;
    for (const [counter, cap] of Object.entries({ openedFiles: 'openedFiles', treeEntries: 'treeEntries',
        sourceBytes: 'scanBytes', evidenceBytes: 'evidenceBytes', matches: 'matches', elapsedMs: 'sourceWallMs' })) {
        assert(budget[counter] <= limits[cap], counter);
    }
    assert(result.packets.every(item => item.packetBytes <= limits.packetBytes && item.promptBytes <= limits.promptBytes));
    return retrieved.map(({ text: _text, ...proof }) => proof);
}

async function replay(directory) {
    assert.equal(rows.length, 10);
    const fixtures = Object.fromEntries(Object.keys(locked).map(subject => [subject, scenario(subject, directory, locked)]));
    for (const [index, row] of rows.entries()) {
        const fixture = fixtures[row.subject];
        const { calls, ...result } = await simulate(row, fixture);
        assert.ifError(result.error);
        const proofs = attest(fixture, calls, result, row.request);
        const { status, results, budget } = result.lookup;
        console.log(JSON.stringify({ order: index + 1, trial: row.trial, subject: row.subject, head: fixture.b.head, tree: fixture.b.tree,
            request: row.request, status, results, budget, anchor: fixture.anchor.selected, proofs, packets: result.packets,
            simulatedCalls: calls.length, realModelCalls: 0, writes: result.writes }));
    }
}

if (require.main === module) replay(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { attest, locked, rows, simulate };
