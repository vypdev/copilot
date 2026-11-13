'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { fixtures } = require('../coverage-895-pilot/fixture.cjs');
const { validateProof } = require('../coverage-895-pilot/runner.cjs');
const { receipt } = require('../on-demand/contract.cjs');
const { checkFrozen, checkTransport } = require('../coverage-895-complete-diagnostic/run.cjs');
const { digest } = require('../v4/verification.cjs');
const { assertStrictOutputSchema } = require('../../../../../src/application/policies/agent_execution/strict_output_schema_policy.ts');
const { prepare } = require('./prepared.cjs');
const { message, trial } = require('./runner.cjs');
const plan = require('./manifest.json');

const decide = (verdict, citations) => ({ verdict, citations, reason: 'Simulated receipt contract.',
    missing: verdict === 'inconclusive' ? 'Fixture premise.' : null });

function mock(calls, reply) {
    return async (request, mode, cwd, deadline) => {
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        assert.equal(deadline, plan.callMs);
        calls.push(request);
        return { response: reply, fact: { outcome: 'completed', turnCompletions: 1, inspections: 0, toolTypes: [],
            turnStartedMs: 1, usage: { input_tokens: 5000, output_tokens: 150 },
            promptSha256: digest(request.prompt), schemaSha256: digest(JSON.stringify(request.options.schema)) } };
    };
}

async function controls(packets) {
    const cases = {};
    for (const [subject, packet] of Object.entries(packets)) {
        const { session, proofs } = packet;
        const model = plan.models[0];
        const { request, facts } = message(model, packet);
        const wire = JSON.parse(request.prompt.split('\n').at(-1));
        assert.deepEqual(wire.candidate.anchor, session.identity.anchor);
        assert.deepEqual(wire.provenance.resolutions, session.resolutions);
        assert.equal(wire.provenance.lockBlob, session.identity.lockBlob);
        assert(!request.prompt.includes('Unexpected coverage file: /'));
        assertStrictOutputSchema(request.options.schema);
        const validate = new Ajv().compile(request.options.schema);
        const aliases = Object.keys(facts.aliases);
        assert.deepEqual(request.options.schema.properties.citations.items.enum, aliases);
        assert.deepEqual(Object.values(facts.aliases), proofs.map(p => p.id));
        for (const [i, proof] of proofs.entries()) {
            const [file, start, end, text] = wire.sources[aliases[i]];
            assert.deepEqual([start, end, text], [proof.start, proof.end, proof.text]);
            assert.deepEqual(wire.files[file], proof.kind === 'git' ? ['git', proof.path, proof.blob]
                : ['dependency', proof.package, proof.file]);
        }
        const slot = { subject, model, arm: 'complete' };
        for (const verdict of ['confirmed', 'refuted', 'inconclusive']) {
            const response = decide(verdict, aliases);
            assert(validate(response));
            const calls = [];
            const result = await trial(slot, packet, () => {}, mock(calls, response));
            assert.equal(result.failure, null);
            assert.equal(result.budget, 'within');
            assert.deepEqual(result.writeAttempts, []);
            assert.deepEqual(calls, [request]);
            assert.deepEqual(result.answer.anchor, session.identity.anchor);
            assert.deepEqual(result.answer.receiptIds, proofs.map(p => p.id));
        }
        for (const [response, error] of [[decide('confirmed', ['E99']), 'citation-foreign'],
            [decide('confirmed', ['E1', 'E1']), 'citation-duplicate'],
            [{ request: null, decision: null }, 'final-response-shape']]) {
            const result = await trial(slot, packet, () => {}, mock([], response));
            assert.equal(result.failure.code, error);
        }
        const lifecycle = proofs.find(p => p.link === 'project-attachment-dispatches-configureVitest');
        assert(lifecycle);
        const other = packets[subject === 'original' ? 'mutant' : 'original'].proofs.find(p => p.link === lifecycle.link);
        assert.throws(() => validateProof(session, other), /receipt-revision/u);
        const wrongOperation = receipt({ ...session.identity, operation: 'other' }, lifecycle);
        assert.throws(() => validateProof(session, wrongOperation), /receipt-identity/u);
        const wrongCandidate = receipt({ ...session.identity, candidate: 'other' }, lifecycle);
        assert.throws(() => validateProof(session, wrongCandidate), /receipt-identity/u);
        for (const [key, value, code] of [['version', '0.0.0', 'dependency-version'],
            ['lockBlob', '0'.repeat(40), 'dependency-lock'], ['text', 'altered', 'dependency-artifact']]) {
            assert.throws(() => validateProof(session, receipt(session.identity, { ...lifecycle, [key]: value })), new RegExp(code, 'u'));
        }
        const trap = await trial(slot, packet, () => assert.fail('unexpected journal'), () => assert.fail('unexpected provider'), 'publish');
        assert.equal(trap.failure.code, 'dry-run-write-port');
        assert.deepEqual(trap.writeAttempts, ['publishReview']);
        cases[subject] = { identity: session.identity, message: facts, sources: proofs.map(({ text, ...proof }) => proof) };
    }
    return { cases, modelCalls: 0, guards: ['all-serialized-aliases', 'source-exactness', 'foreign-and-duplicate-citations',
        'revision', 'candidate', 'operation', 'version', 'lock', 'artifact', 'full-budget', 'dry-run-write-port'] };
}

async function main() {
    const [lab, archives, mode, output, freeze] = process.argv.slice(2);
    assert(lab && archives);
    const directory = path.resolve(archives);
    const packets = Object.fromEntries(Object.entries(fixtures(path.resolve(lab), directory))
        .map(([subject, session]) => [subject, prepare(subject, session, directory)]));
    const control = await controls(packets);
    if (mode === '--write-controls') return console.log(JSON.stringify(control, null, 2));
    checkFrozen(__dirname);
    assert.deepEqual(control, require('./runner-control.json'));
    if (mode === '--check') return console.log('Both lifecycle packets passed simulated citation, integrity, and budget checks.');
    assert.equal(mode, '--run');
    const slots = require('./slots.json');
    assert.deepEqual(plan.models, ['gpt-6.1-sol']);
    assert.equal(plan.publicationMode, 'dry-run');
    assert.equal(plan.retries, 0);
    assert.equal(plan.maxCallsPerTrial, 1);
    assert.deepEqual(slots, require('../coverage-895-complete-diagnostic/slots.json').filter(slot => slot.model === plan.models[0]));
    assert.equal(slots.length, 6);
    checkTransport(__dirname, plan, freeze);
    const { ask } = require('../v4/run-pilot.cjs');
    fs.mkdirSync(output, { mode: 0o700 });
    const file = path.join(output, 'trials.jsonl');
    fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
    const log = row => fs.appendFileSync(file, JSON.stringify(row) + '\n');
    log({ event: 'plan', freeze, slots, control: Object.fromEntries(Object.entries(control.cases).map(([subject, row]) => [subject, row.message])) });
    for (const slot of slots) {
        const result = await trial(slot, packets[slot.subject], log, ask);
        log(result);
        console.log(slot.trial, result.answer?.verdict ?? result.failure?.code ?? 'unresolved', result.budget);
    }
}

if (require.main === module) main().catch(error => {
    if (error.facts) console.error('Rejected before provider call.', error.facts.packetBytes, error.facts.promptBytes, error.facts.dependencyBytes);
    console.error(error.message);
    process.exitCode = 1;
});
