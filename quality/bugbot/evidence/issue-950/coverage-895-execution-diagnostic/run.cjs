'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { fixtures } = require('../coverage-895-pilot/fixture.cjs');
const { checkFrozen, checkTransport } = require('../coverage-895-complete-diagnostic/run.cjs');
const { digest } = require('../v4/verification.cjs');
const { assertStrictOutputSchema } = require('../../../../../src/application/policies/agent_execution/strict_output_schema_policy.ts');
const { buildExecution, loadExecutions, proofFor, readPinned } = require('./execution.cjs');
const { preparePackets, message, trial } = require('./runner.cjs');
const plan = require('./manifest.json');

const measure = ({ text, ...proof }) => proof;
const verdict = citations => ({ verdict: 'confirmed', citations, reason: 'Simulated citation.', missing: null });
function mock(response, requests) {
    return async (request, mode, cwd, deadline) => {
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        assert.equal(deadline, plan.callMs);
        requests.push(request);
        return { response, fact: { outcome: 'completed', turnCompletions: 1, inspections: 0, toolTypes: [],
            turnStartedMs: 1, usage: { input_tokens: 5000, output_tokens: 150 },
            promptSha256: digest(request.prompt), schemaSha256: digest(JSON.stringify(request.options.schema)) } };
    };
}

async function controls(packets, sessions) {
    const cases = {};
    for (const [subject, arms] of Object.entries(packets)) {
        const slot = { subject, model: plan.models[0] };
        const saved = {};
        for (const [arm, packet] of Object.entries(arms)) {
            const current = message(slot.model, packet);
            assertStrictOutputSchema(current.request.options.schema);
            const validate = new Ajv().compile(current.request.options.schema);
            const aliases = Object.keys(current.facts.aliases);
            const reply = verdict(aliases);
            assert(validate(reply));
            const requests = [];
            const result = await trial({ ...slot, arm }, packet, () => {}, mock(reply, requests));
            assert.deepEqual(requests, [current.request]);
            assert.equal(result.failure, null);
            assert.equal(result.budget, 'within');
            assert.deepEqual(result.answer.receiptIds, packet.proofs.map(p => p.id));
            assert.deepEqual(result.answer.anchor, packet.session.identity.anchor);
            assert.deepEqual(result.writeAttempts, []);
            saved[arm] = { message: current.facts, sources: packet.proofs.map(measure) };
        }
        const source = JSON.parse(message(slot.model, arms.source).request.prompt.split('\n').at(-1));
        const enhanced = JSON.parse(message(slot.model, arms.execution).request.prompt.split('\n').at(-1));
        assert(!Object.hasOwn(source, 'execution'));
        const { execution: observation, ...same } = enhanced;
        assert.deepEqual(same, source);
        assert.equal(observation.receipt, arms.execution.proofs.at(-1).id);
        assert.deepEqual(observation.observation, arms.execution.execution.observation);
        const blocked = await trial({ ...slot, arm: 'source' }, arms.source, () => {}, mock(verdict([observation.alias]), []));
        assert.deepEqual(blocked.failure, { stage: 'verdict', code: 'citation-foreign', field: 'citations[0]' });
        assert.deepEqual(blocked.writeAttempts, []);
        const shape = await trial({ ...slot, arm: 'execution' }, arms.execution, () => {}, mock({ ...verdict([observation.alias]), reason: 'é'.repeat(701) }, []));
        assert.deepEqual(shape.failure, { stage: 'verdict', code: 'byte-limit', field: 'reason', bytes: 1402, limit: 1400 });
        const tamperCases = [
            ['altered', 'execution-integrity', 'execution.observation.summaryKeyPresent', artifact => {
                artifact.observation.summaryKeyPresent = !artifact.observation.summaryKeyPresent;
            }],
            ['incomplete', 'execution-incomplete', 'execution.observation.inventoryExit', artifact => {
                delete artifact.observation.inventoryExit;
            }],
            ['head', 'execution-head', 'execution.binding.head', artifact => { artifact.binding.head = '0'.repeat(40); }],
            ['tree', 'execution-tree', 'execution.binding.tree', artifact => { artifact.binding.tree = '0'.repeat(40); }],
            ['lock', 'execution-lockfile', 'execution.binding.lockBlob', artifact => { artifact.binding.lockBlob = '0'.repeat(40); }],
            ['command', 'execution-command', 'execution.binding.command', artifact => { artifact.binding.command = 'changed'; }],
            ['hash', 'execution-integrity', 'execution.hashes.baseline.summarySha256', artifact => {
                artifact.hashes.baseline.summarySha256 = '0'.repeat(64);
            }],
        ];
        const rejected = {};
        for (const [label, code, field, alter] of tamperCases) {
            const packet = arms.execution;
            const execution = structuredClone(packet.execution);
            alter(execution);
            const forged = { ...packet, execution, proofs: [...packet.proofs.slice(0, -1), proofFor(packet.session, execution)] };
            const journal = [];
            const result = await trial({ ...slot, arm: 'execution' }, forged, event => journal.push(event),
                () => assert.fail('rejected evidence reached the provider'));
            assert.deepEqual(result.failure, { stage: 'selection', code, field });
            assert.deepEqual(journal, [{ event: 'rejected', failure: result.failure }]);
            assert.deepEqual(result.writeAttempts, []);
            rejected[label] = result.failure;
        }
        const auditCase = JSON.parse(readPinned('audit.json')).cases[subject];
        assert.throws(() => buildExecution(subject, sessions[subject], arms.execution.execution.producer, auditCase, file => {
            const bytes = readPinned('execution/' + file);
            return file.endsWith('-baseline-summary.json') ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes;
        }), error => {
            assert.deepEqual(error.diagnostic, { code: 'execution-artifact-hash', field: 'artifacts.baseline.summary' });
            rejected.rawBytes = error.diagnostic;
            return true;
        });
        cases[subject] = { identity: arms.source.session.identity, arms: saved, executionAlias: observation.alias, rejected,
            foreignCitation: blocked.failure, byteLimit: shape.failure };
    }
    return { cases, modelCalls: 0, writeAttempts: 0 };
}

async function main() {
    const [lab, archives, mode, output, freeze] = process.argv.slice(2);
    assert(lab && archives);
    const archiveDir = path.resolve(archives);
    const sessions = fixtures(path.resolve(lab), archiveDir);
    const executions = loadExecutions(sessions);
    if (mode === '--write-execution') return console.log(JSON.stringify(executions, null, 2));
    const packets = Object.fromEntries(Object.entries(sessions).map(([subject, session]) =>
        [subject, preparePackets(subject, session, archiveDir, executions[subject])]));
    const control = await controls(packets, sessions);
    if (mode === '--write-controls') return console.log(JSON.stringify(control, null, 2));
    checkFrozen(__dirname);
    assert.deepEqual(executions, require('./execution-artifacts.json'));
    assert.deepEqual(control, require('./runner-control.json'));
    if (mode === '--check') return console.log('The two arms passed simulated delivery, provenance and budget checks.');
    assert.equal(mode, '--run');
    assert.equal(plan.publicationMode, 'dry-run');
    assert.equal(plan.maxCallsPerTrial, 1);
    assert.equal(plan.retries, 0);
    const slots = require('./slots.json');
    assert.equal(slots.length, 12);
    checkTransport(__dirname, plan, freeze);
    const { ask } = require('../v4/run-pilot.cjs');
    fs.mkdirSync(output, { mode: 0o700 });
    const file = path.join(output, 'trials.jsonl');
    fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
    const append = row => fs.appendFileSync(file, JSON.stringify(row) + '\n');
    append({ event: 'plan', freeze, slots, controls: Object.fromEntries(Object.entries(control.cases)
        .map(([subject, value]) => [subject, Object.fromEntries(Object.entries(value.arms).map(([arm, data]) => [arm, data.message]))])) });
    for (const slot of slots) {
        const result = await trial(slot, packets[slot.subject][slot.arm], event => append({ ...slot, ...event }), ask);
        append({ ...slot, event: 'result', ...result });
        console.log(slot.trial, result.answer?.verdict ?? result.failure?.code, result.budget);
    }
}

if (require.main === module) main().catch(error => {
    console.error(error.diagnostic ?? error.message);
    process.exitCode = 1;
});
