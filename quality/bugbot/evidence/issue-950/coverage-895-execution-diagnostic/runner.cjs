'use strict';

const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { read } = require('../git-path-pattern/adapter.cjs');
const { prepare } = require('../coverage-895-lifecycle-diagnostic/prepared.cjs');
const { message: baseMessage, trial: baseTrial } = require('../coverage-895-contract-audit/runner.cjs');
const { schema, bindReply, VerdictFailure } = require('../coverage-895-contract-audit/verdict.cjs');
const { validateProof } = require('../coverage-895-pilot/runner.cjs');
const { digest, byteLength, requireFact } = require('../v4/verification.cjs');
const { proofFor, validateExecution } = require('./execution.cjs');
const plan = require('./manifest.json');

function preparePackets(subject, original, archives, execution) {
    const prepared = prepare(subject, original, archives);
    const response = read(original.cwd, original.identity, { revision: 'head', kind: 'readBlob',
        targets: [{ scope: execution.observation.target, workspace: null, match: 'lines', query: null, start: 9, end: 13 }] });
    assert.equal(response.result?.status, 'provided');
    assert.equal(response.result.receipts.length, 1);
    const story = response.result.receipts[0];
    assert(story.text.includes('export default meta;') && story.text.includes('export const Default:Story='));
    const proofs = [...prepared.proofs, story];
    return { source: { session: prepared.session, proofs }, execution: { session: prepared.session,
        proofs: [...proofs, proofFor(prepared.session, execution)], execution, expectedExecution: execution } };
}

function message(model, packet) {
    if (packet.execution !== undefined || packet.expectedExecution !== undefined) validateExecution(packet.execution, packet.expectedExecution);
    const { session, proofs } = packet;
    const sourceProofs = proofs.filter(p => p.kind !== 'execution');
    const { request, facts } = baseMessage(model, { session, proofs: sourceProofs });
    const lines = request.prompt.split('\n');
    lines[2] += ' If a local execution record is supplied, cite its alias for any claim about its observed output and connect it to the source. Source-only claims must be supported by the supplied code.';
    const source = JSON.parse(lines[3]);
    const aliases = { ...facts.aliases };
    if (packet.execution) {
        const proof = proofs.at(-1);
        if (!isDeepStrictEqual(proof, proofFor(session, packet.execution))) throw new VerdictFailure('execution-receipt', 'execution.receipt');
        const alias = 'E' + proofs.length;
        aliases[alias] = proof.id;
        const { runId, producer, observation } = packet.execution;
        source.execution = { alias, receipt: proof.id, runId, producer: producer.kind,
            producerCommit: producer.commit, artifactSha256: proof.artifact, observation };
    } else if (sourceProofs.length !== proofs.length) throw new VerdictFailure('execution-undelivered', 'execution');
    lines[3] = JSON.stringify(source);
    const prompt = lines.join('\n');
    const output = schema(Object.keys(aliases));
    const delivered = { ...facts, aliases, packetBytes: byteLength(lines[3]), packetSha256: digest(lines[3]),
        promptBytes: byteLength(prompt), promptSha256: digest(prompt), schemaSha256: digest(JSON.stringify(output)) };
    requireFact(delivered.packetBytes <= plan.packetBytes && delivered.promptBytes <= plan.promptBytes, 'full-packet-budget');
    return { request: { ...request, prompt, options: { schema: output } }, facts: delivered };
}

function trial(slot, packet, journal, send) {
    const verify = (session, proof) => {
        if (proof.kind !== 'execution') return validateProof(session, proof);
        if (!packet.expectedExecution || !isDeepStrictEqual(proof, proofFor(session, packet.expectedExecution))) {
            throw new VerdictFailure('execution-receipt', 'execution.receipt');
        }
    };
    return baseTrial(slot.model, packet, journal, send, plan.publicationMode, {
        message, bindReply: (reply, session, proofs) => bindReply(reply, session, proofs, verify),
    });
}

module.exports = { preparePackets, message, trial };
