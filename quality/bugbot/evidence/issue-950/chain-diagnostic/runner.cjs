'use strict';

const assert = require('node:assert/strict');
const { buildRequest } = require('../tree-search/run.cjs');
const { assess, dryRunPorts, limits, receipt } = require('../tree-search/contract.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const { retrieve } = require('./retrieve.cjs');

async function trial(row, fixture, send, { publicationMode = 'dry-run' } = {}) {
    assert.equal(typeof send, 'function', 'An explicit verifier transport is required.');
    const writes = [];
    const ports = dryRunPorts(name => writes.push(name));
    const anchor = fixture.anchor.selected;
    const binding = {
        operation: digest('chain-diagnostic/' + row.trial),
        candidate: fixture.c.id + '-' + digest(JSON.stringify([fixture.c, anchor, fixture.b.diffSha256])).slice(0, 12),
        head: fixture.b.head, tree: fixture.b.tree, scopes: [''],
    };
    const receipts = [...fixture.initial, { kind: 'diff', path: fixture.c.path, text: fixture.excerpt,
        comparison: fixture.b.diffSha256 }].map(source => receipt(binding, source));
    const packets = [];
    const start = performance.now();
    let lookup;
    try {
        if (publicationMode !== 'dry-run') ports.publishReview();
        const decision = await assess({ binding, receipts, arm: row.arm,
            acquire: request => retrieve(fixture.cwd, binding, request, { anchor }),
            onEvidence: result => { lookup = result; },
            ask: async ({ receipts: proofs, followup }) => {
                const packetBytes = byteLength(JSON.stringify({ receipts: proofs, followup }));
                if (packetBytes > limits.packetBytes) throw Error('packet-byte-budget');
                const message = buildRequest(row, fixture, binding, proofs, followup);
                const deadline = Math.min(limits.callWallMs, Math.floor(limits.subjectWallMs - (performance.now() - start)));
                if (deadline < limits.minRetryMs) throw Error('subject-wall-budget');
                packets.push({ packetBytes, promptBytes: byteLength(message.prompt) });
                return send(message, 'closed', null, deadline);
            },
        });
        if (performance.now() - start > limits.subjectWallMs) throw Error('subject-wall-budget');
        return { decision, lookup, packets, writes };
    } catch (error) {
        return { error, lookup, packets, writes };
    }
}

module.exports = { trial };
