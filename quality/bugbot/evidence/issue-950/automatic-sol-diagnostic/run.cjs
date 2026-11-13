'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { trial } = require('../prepared-diagnostic/run.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { schema } = require('../tree-search/contract.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const protocol = require('./manifest.json');
const reference = require('../prepared-diagnostic/manifest.json');

function preflight() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    for (const key of ['sdk', 'cli', 'modelProvider', 'effort', 'ceiling', 'publicationMode']) {
        assert.deepEqual(protocol[key], reference[key]);
    }
    assert.equal(protocol.publicationMode, 'dry-run');
    assert.equal(protocol.concurrency, reference.concurrencyPerModel);
    assert.equal(protocol.model, 'gpt-6.1-sol');
    assert.equal(protocol.rows.length, 6);
    assert.equal(new Set(protocol.rows.map(row => row.trial)).size, 6);
    assert.deepEqual(protocol.subjects, ['H1', 'H2']);
    const baselineRows = require('../prepared-diagnostic/order.json').filter(row => row.model === protocol.model
        && row.arm === 'complete' && protocol.subjects.includes(row.subject));
    assert.deepEqual(protocol.rows.map(({ referenceTrial, model, subject, repetition, arm, trial: id }) => {
        assert.equal(arm, 'automatic');
        assert.equal(id, digest('automatic-sol/' + referenceTrial).slice(0, 16));
        return { trial: referenceTrial, model, subject, repetition, arm: 'complete' };
    }), baselineRows);

    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), protocol.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), protocol.cli);
    const packets = require('./packets.json');
    assert.deepEqual(Object.keys(packets), protocol.subjects);
    for (const revision of Object.values(packets)) {
        assert.equal(revision.control.simulatedCalls, 2);
        assert.equal(revision.control.realModelCalls, 0);
        assert.deepEqual(revision.control.writes, []);
        const packet = revision.automatic;
        assert.deepEqual(packet.receipts.map(proof => proof.kind), ['diff', ...revision.control.proofs.map(() => 'git')]);
        assert.deepEqual(packet.receipts.slice(1).map(proof => proof.id), revision.control.proofs.map(proof => proof.id));
        const payload = JSON.stringify({ receipts: packet.receipts, followup: packet.followup });
        assert.equal(packet.packetSha256, digest(payload));
        assert.equal(packet.packetBytes, byteLength(payload));
        assert.equal(packet.promptSha256, digest(packet.prompt));
        assert.equal(packet.promptBytes, byteLength(packet.prompt));
        assert.equal(packet.schemaSha256, digest(JSON.stringify(schema(false))));
        assert(packet.packetBytes <= protocol.ceiling.packetBytes && packet.promptBytes <= protocol.ceiling.promptBytes);
        for (const proof of packet.receipts) assert.deepEqual(proof, receipt(revision.binding, proof));
    }
    return packets;
}

async function main() {
    const [journalPath, freeze] = process.argv.slice(2);
    const packets = preflight();
    if (!journalPath) {
        console.log('Automatic packet hashes, six slots, SDK and CLI validated without model calls.');
        return;
    }
    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    fs.writeFileSync(journalPath, '', { flag: 'wx', mode: 0o600 });
    const journal = event => fs.appendFileSync(journalPath, JSON.stringify(event) + '\n');
    const queue = [...protocol.rows];
    journal({ event: 'plan', freeze, rows: queue });
    await Promise.all(Array.from({ length: protocol.concurrency }, async () => {
        let row;
        while ((row = queue.shift())) {
            const result = await trial(row, packets[row.subject], journal);
            journal(result);
            console.log(row.trial, row.subject, row.repetition, result.verdict ?? result.reason);
        }
    }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
