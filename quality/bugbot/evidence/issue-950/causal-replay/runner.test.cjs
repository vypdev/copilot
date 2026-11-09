'use strict';

const assert = require('node:assert/strict');
const { appendFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { scenario, trial } = require('./runner.cjs');
const { limits, receipt } = require('../tree-search/contract.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');

const prior = process.env.BUGBOT_TREE_PRIOR_SUBJECTS;
const subjects = process.env.BUGBOT_CAUSAL_SUBJECTS;
const records = readFileSync(path.join(__dirname, 'before.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const fact = { outcome: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, toolTypes: [] };

function block(message, origin) {
    const prefix = `[BEGIN_UNTRUSTED_DATA origin=${origin} length=`;
    const start = message.prompt.indexOf(prefix);
    if (start < 0) return undefined;
    const end = message.prompt.indexOf('\n', start);
    const marker = / terminator=(\[END_UNTRUSTED_DATA(?:_\d+)?\])\]$/u.exec(message.prompt.slice(start, end));
    assert(marker);
    const text = message.prompt.slice(end + 1, message.prompt.indexOf('\n' + marker[1], end + 1));
    assert.equal(text.length, Number(/^\d+/u.exec(message.prompt.slice(start + prefix.length))[0]));
    return JSON.parse(text);
}

function observed(packet, next, message) {
    return { packet, ...(next && { followup: next }), packetBytes: byteLength(JSON.stringify({ receipts: packet, followup: next })),
        promptBytes: byteLength(message.prompt), promptSha256: digest(message.prompt) };
}

function fixtureRun(subject) {
    const original = records.find(row => row.subject === subject);
    const row = { model: original.model, subject, repetition: original.repetition, arm: 'on-demand', trial: original.trial };
    return { row, fixture: scenario(subject, prior, subjects), request: original.request };
}

async function simulated({ row, fixture, request }, answer) {
    const calls = [], events = [];
    const result = await trial(row, fixture, event => events.push(event), (message, mode, cwd, deadline) => {
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        assert(deadline > 0 && deadline <= limits.callWallMs);
        const candidate = block(message, 'frozen candidate');
        const packet = block(message, 'application receipts');
        const next = block(message, 'evidence request result');
        calls.push({ ...observed(packet, next, message), candidate });
        if (calls.length === 1) {
            assert.equal(next, undefined);
            assert.deepEqual(message.options.schema.properties.kind.enum, ['verdict', 'request']);
            return { fact, response: { candidate: candidate.id, kind: 'request', verdict: null, citations: [],
                reason: 'Need pinned implementation.', nextStep: null, request } };
        }
        assert.equal(calls.length, 2);
        assert.deepEqual(message.options.schema.properties.kind.enum, ['verdict']);
        return { fact, response: { candidate: candidate.id, kind: 'verdict', verdict: 'refuted',
            citations: [packet.at(-1).id], reason: 'Simulated response.', nextStep: null, request: null,
            ...answer?.(candidate, packet, next) } };
    });
    assert.deepEqual(result.writeAttempts, []);
    return { calls, events, result };
}

for (const subject of ['T1', 'T2']) {
    test(`the next runner sends the exact initial and causal packets for ${subject}`, async () => {
        const run = fixtureRun(subject);
        const { calls, events, result } = await simulated(run, () => ({ verdict: subject === 'T1' ? 'refuted' : 'confirmed' }));
        assert.equal(result.status, 'completed', result.reason);
        assert.equal(result.verdict, subject === 'T1' ? 'refuted' : 'confirmed');
        assert.equal(calls.length, 2);
        assert.deepEqual(result.anchor, run.fixture.anchor);
        const [initial, second] = calls;
        assert.deepEqual(initial.candidate, second.candidate);
        assert.deepEqual(second.candidate.anchor, run.fixture.anchor.selected);
        assert.deepEqual(second.packet.slice(0, initial.packet.length), initial.packet);
        assert.deepEqual(second.followup.request, run.request);
        assert.equal(second.followup.status, 'provided');
        assert.deepEqual(second.followup.anchor, run.fixture.anchor.selected);
        const retrieved = second.packet.slice(initial.packet.length);
        assert.equal(retrieved.length, 5);
        assert.deepEqual(second.followup.receiptIds, retrieved.map(item => item.id));
        assert(second.followup.links.some(link => link.symbol === 'SQLiteRecurrences.current_schedule_id'));
        const binding = { candidate: second.candidate.id, head: run.fixture.b.head, tree: run.fixture.b.tree,
            operation: digest(`causal-runner/${run.row.trial}/${run.row.arm}/${run.row.model}/${subject}/${run.row.repetition}`) };
        for (const proof of second.packet) {
            for (const [key, value] of Object.entries(binding)) assert.equal(proof[key], value);
            assert.deepEqual(receipt(binding, proof), proof);
        }
        assert(retrieved.some(item => item.text.includes('yield SQLiteUnit(connection, self.installation)')));
        const method = retrieved.find(item => item.text.includes('def current_schedule_id('));
        assert(method);
        assert.equal(method.text.includes("AND state!='retired'"), subject === 'T1');
        for (const call of calls) {
            assert(call.packetBytes <= limits.packetBytes);
            assert(call.promptBytes <= limits.promptBytes);
        }
        assert.equal(result.input, 20);
        assert.equal(result.output, 20);
        assert.equal(result.unknown, 0);
        assert.equal(events.filter(item => item.event === 'evidence-response').length, 1);
        if (process.env.BUGBOT_CAUSAL_RUNNER_REPORT) {
            appendFileSync(process.env.BUGBOT_CAUSAL_RUNNER_REPORT, JSON.stringify({
                subject, trial: run.row.trial, simulated: true, realModelCalls: 0, calls,
                writeAttempts: result.writeAttempts, verdict: result.verdict,
            }) + '\n');
        }
    });
}

test('runner rejects another request and a receipt bound to another operation', async () => {
    const run = fixtureRun('T1');
    const requestAgain = candidate => ({ candidate: candidate.id, kind: 'request', request: run.request,
        verdict: null, citations: [], reason: 'Second request is forbidden.' });
    const foreignCitation = (_candidate, packet) => {
        const foreign = receipt({ ...packet.at(-1), operation: 'different-operation' }, packet.at(-1));
        return { citations: [foreign.id] };
    };
    for (const [answer, reason] of [[requestAgain, 'second-request'], [foreignCitation, 'citation-integrity']]) {
        const { calls, events, result } = await simulated(run, answer);
        assert.equal(result.status, 'failed');
        assert.equal(result.reason, reason);
        assert.equal(calls.length, 2);
        assert.equal(events.filter(item => item.event === 'evidence-response').length, 1);
    }
});

test('runner refuses an oversized combined packet before the second transport call', async () => {
    const run = fixtureRun('T1');
    run.fixture.initial = [...run.fixture.initial, { kind: 'budget-fixture', text: 'x'.repeat(9500) }];
    const { calls, events, result } = await simulated(run);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'packet-byte-budget');
    assert.equal(calls.length, 1);
    assert(calls[0].packetBytes < limits.packetBytes);
    assert.equal(events.filter(item => item.event === 'evidence-response').length, 1);
});

test('runner still uses pinned legacy retrieval for a non-causal literal', async () => {
    const run = fixtureRun('T1');
    run.request = { kind: 'searchTree', targets: [{ scope: run.fixture.c.path, workspace: null,
        match: 'literal', query: 'fixed-state', start: null, end: null }] };
    const { calls, result } = await simulated(run);
    assert.equal(result.status, 'completed', result.reason);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].followup.status, 'provided');
    assert.equal(calls[1].followup.links, undefined);
    assert(calls[1].packet.at(-1).text.includes('"fixed-state"'));
    assert.equal(calls[1].packet.at(-1).path, run.fixture.c.path);
});
