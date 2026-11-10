'use strict';

const assert = require('node:assert/strict');
const { requestFor, validateProof, bindReply } = require('../coverage-895-pilot/runner.cjs');
const { dryRunPorts } = require('../on-demand/contract.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const { packetBytes, promptBytes } = require('../coverage-895-pilot/manifest.json');
const adapter = require('./adapter.cjs');

function initialRequest(model, session) {
    const initial = requestFor(model, session, session.initial);
    const lines = initial.request.prompt.split('\n');
    assert.equal(lines.length, 4);
    lines[2] = adapter.instructions;
    const prompt = lines.join('\n');
    const schema = initial.request.options.schema;
    schema.properties.request = adapter.requestSchema;
    const facts = { ...initial.facts, promptSha256: digest(prompt), promptBytes: byteLength(prompt),
        schemaSha256: digest(JSON.stringify(schema)) };
    assert(facts.packetBytes <= packetBytes && facts.promptBytes <= promptBytes, 'full-packet-budget');
    return { request: { ...initial.request, prompt, options: { schema } }, facts };
}

const sourceSummary = ({ text, ...proof }) => ({ ...proof, bytes: byteLength(text) });
const stableBudget = budget => {
    if (!budget) return null;
    const { elapsedMs, ...stable } = budget;
    return stable;
};
const statusFields = ({ status, reason }) => ({ status, ...(reason ? { reason } : {}) });

function replay(row, session, simulatedVerifier) {
    const writeAttempts = [];
    const ports = dryRunPorts(operation => writeAttempts.push(operation));
    const first = initialRequest(row.model, session);
    const decision = simulatedVerifier(first.request, ports);
    assert.deepEqual(decision, { decision: null, request: row.requested });
    const { normalized, admission, result, usage } = adapter.read(session.cwd, session.identity, decision.request);
    const output = { original: decision.request, normalized, admission, git: null, delivery: null, writeAttempts };
    if (!result) return output;

    const { receipts = [], budget, ...outcome } = result;
    output.git = { ...outcome, budget: stableBudget(budget), usage: stableBudget(usage), receipts: receipts.map(sourceSummary) };
    const known = new Set(session.initial.map(proof => proof.id));
    const proofs = [...session.initial];
    for (const proof of receipts) {
        assert.equal(proof.kind, 'git');
        validateProof(session, proof);
        if (!known.has(proof.id)) {
            known.add(proof.id);
            proofs.push(proof);
        }
    }
    const retrieval = { ...statusFields(result), ...(result.results ? { targets: result.results.map(statusFields) } : {}) };
    let final;
    try {
        final = requestFor(row.model, session, proofs, retrieval);
    } catch (error) {
        if (error.code !== 'full-packet-budget') throw error;
        output.delivery = { status: error.code };
        return output;
    }
    const response = bindReply(simulatedVerifier(final.request, ports), session, proofs);
    assert.deepEqual(response.anchor, session.identity.anchor);
    output.delivery = { status: 'delivered', ...final.facts, citedReceiptIds: response.receiptIds };
    return output;
}

module.exports = { initialRequest, replay };
