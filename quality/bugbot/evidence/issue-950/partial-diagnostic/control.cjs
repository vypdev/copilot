'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { scenario, trial } = require('./runner.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { limits } = require('../tree-search/contract.cjs');
const known = require('../module-diagnostic/held-out.lock.json');
const expected = require('../module-diagnostic/oracle.json');
const rows = readFileSync(path.join(__dirname, '../module-diagnostic/trials.jsonl'), 'utf8').trim().split('\n')
    .map(JSON.parse).filter(row => row.event === 'evidence-requested' && row.arm === 'on-demand' && Object.hasOwn(known, row.subject));

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

async function control(directory) {
    const fixtures = Object.fromEntries(Object.keys(known).map(subject => [subject, scenario(subject, directory, known)]));
    assert.equal(rows.length, 10);
    let partial = 0;
    for (const [index, row] of rows.entries()) {
        const f = fixtures[row.subject];
        const decisive = expected[row.subject].decisive;
        const calls = [];
        const result = await trial({ model: row.model, subject: row.subject, arm: 'on-demand', repetition: row.repetition, trial: row.trial },
            f, () => {}, (message, mode, cwd, deadline) => {
                assert.equal(mode, 'closed');
                assert.equal(cwd, null);
                assert(deadline > 0 && deadline <= limits.callWallMs);
                const candidate = block(message.prompt, 'frozen candidate');
                const packet = block(message.prompt, 'application receipts');
                const next = block(message.prompt, 'evidence request result');
                const envelope = { candidate: candidate.id, reason: 'Deterministic adapter delivery control.' };
                const fact = { outcome: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, toolTypes: [] };
                calls.push({ candidate, packet, next });
                if (!next) return { fact, response: { ...envelope, kind: 'request', verdict: null, citations: [],
                    request: row.request, nextStep: null } };
                assert.deepEqual(next.request, row.request);
                assert.deepEqual(calls[0].packet, packet.slice(0, calls[0].packet.length));
                const retrieved = packet.slice(calls[0].packet.length);
                assert.deepEqual(next.receiptIds, retrieved.map(item => item.id));
                const proof = retrieved.find(item => item.path === decisive.path && item.start <= decisive.start && item.end >= decisive.end);
                assert(proof, 'decisive receipt must reach the second prompt');
                assert.equal(proof.head, f.b.head);
                assert.equal(proof.tree, f.b.tree);
                assert.equal(proof.operation, calls[0].packet[0].operation);
                assert.equal(proof.candidate, candidate.id);
                assert.equal(proof.blob, git(f.cwd, 'rev-parse', proof.head + ':' + proof.path).trim());
                assert.equal(proof.text, git(f.cwd, 'show', proof.head + ':' + proof.path).split('\n').slice(proof.start - 1, proof.end).join('\n'));
                assert.deepEqual(proof, receipt(proof, proof));
                if (next.status === 'partial') {
                    partial++;
                    assert(next.results.some(item => item.reason));
                }
                return { fact, response: { ...envelope, kind: 'verdict', verdict: 'inconclusive',
                    citations: [proof.id], request: null, nextStep: 'Use this control only to verify delivery.' } };
            });
        assert.equal(result.status, 'completed', result.reason);
        assert.equal(calls.length, 2);
        assert.deepEqual(calls[0].candidate, calls[1].candidate);
        assert.deepEqual(result.anchor.selected, f.anchor.selected);
        assert.deepEqual(result.writeAttempts, []);
        assert(result.packets.every(packet => packet.packetBytes <= limits.packetBytes && packet.promptBytes <= limits.promptBytes));
        console.log(JSON.stringify({ order: index + 1, ...result, decisiveDelivered: true }));
    }
    assert.equal(partial, 6);
}

if (require.main === module) control(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
