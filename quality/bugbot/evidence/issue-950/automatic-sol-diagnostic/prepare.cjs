'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { attest, locked, simulate } = require('../chain-diagnostic/replay.cjs');
const { scenario } = require('../partial-diagnostic/runner.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const reference = require('../prepared-diagnostic/packets.json');
const baseline = require('../prepared-diagnostic/manifest.json');

async function prepare(directory) {
    const ledger = fs.readFileSync(path.join(__dirname, '../partial-diagnostic/trials.jsonl'), 'utf8')
        .trim().split('\n').map(JSON.parse);
    const packets = {};
    for (const subject of ['H1', 'H2']) {
        const pinned = reference[subject];
        const [historical] = ledger.filter(row => row.trial === pinned.trial && row.event === 'evidence-requested');
        assert.equal(ledger.filter(row => row.trial === pinned.trial && row.event === 'evidence-requested').length, 1);
        assert.equal(historical.subject, subject);
        assert.equal(historical.arm, 'on-demand');
        assert.equal(historical.model, 'gpt-6.1-sol');
        const prior = ledger.find(row => row.trial === pinned.trial && row.event === 'result');
        assert.deepEqual(prior.evidenceRequest, historical.request);
        const row = { trial: historical.trial, subject, model: historical.model, arm: historical.arm, request: historical.request };
        const fixture = { ...scenario(subject, directory, locked), initial: [] };
        let second;
        const { calls, ...result } = await simulate(row, fixture, (_row, _calls, message) => { second = message; });
        assert.ifError(result.error);
        const proofs = attest(fixture, calls, result, row.request);
        assert.deepEqual(calls[0].packet.map(proof => proof.kind), ['diff']);
        const { candidate, packet: receipts, next: followup } = calls[1];
        assert.deepEqual(candidate.anchor, pinned.anchor.selected);
        assert.equal(candidate.id, pinned.binding.candidate);
        assert.equal(candidate.head, pinned.binding.head);
        assert.equal(fixture.b.tree, pinned.binding.tree);
        assert.equal(second.agentId, 'tree-followup');
        assert.deepEqual(second.configuration, { provider: 'codex', modelProvider: baseline.modelProvider,
            model: row.model, effort: baseline.effort });
        const schemaSha256 = digest(JSON.stringify(second.options.schema));
        assert.equal(schemaSha256, pinned.complete.schemaSha256);
        const payload = JSON.stringify({ receipts, followup });
        const packetBytes = byteLength(payload);
        const promptBytes = byteLength(second.prompt);
        assert.deepEqual(result.packets[1], { packetBytes, promptBytes });
        assert(packetBytes <= baseline.ceiling.packetBytes && promptBytes <= baseline.ceiling.promptBytes);
        const binding = { operation: receipts[0].operation, candidate: candidate.id,
            head: candidate.head, tree: fixture.b.tree, scopes: [''] };
        packets[subject] = { pair: 'quantity', trial: row.trial, anchor: fixture.anchor, binding, candidate,
            control: { simulatedCalls: calls.length, realModelCalls: 0, writes: result.writes, proofs },
            automatic: { prompt: second.prompt, promptSha256: digest(second.prompt), schemaSha256,
                packetSha256: digest(payload), packetBytes, promptBytes, receipts, followup } };
    }
    return packets;
}

if (require.main === module) prepare(process.argv[2]).then(packets => {
    process.stdout.write(JSON.stringify(packets, null, 2) + '\n');
}).catch(error => { console.error(error); process.exitCode = 1; });
