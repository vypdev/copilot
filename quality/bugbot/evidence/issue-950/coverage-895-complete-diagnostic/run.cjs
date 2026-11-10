'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { fixtures } = require('../coverage-895-pilot/fixture.cjs');
const { validateProof } = require('../coverage-895-pilot/runner.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');
const { assertStrictOutputSchema } = require('../../../../../src/application/policies/agent_execution/strict_output_schema_policy.ts');
const { finalRequest, trial } = require('./runner.cjs');
const { prepared } = require('./prepared.cjs');
const plan = require('./manifest.json');

const decide = (verdict, citations) => ({ verdict, citations, reason: 'Simulated receipt contract.', missing: verdict === 'inconclusive' ? 'Fixture premise.' : null });

function mock(calls, reply) {
    return async (request, mode, cwd, deadline) => {
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        assert(deadline <= plan.callMs);
        calls.push(request);
        const schema = request.options.schema;
        return { response: reply ?? decide('inconclusive', schema.properties.citations.items.enum),
            fact: { outcome: 'completed', turnCompletions: 1, inspections: 0, toolTypes: [],
                turnStartedMs: 1, usage: { input_tokens: 5000, output_tokens: 150 },
                promptSha256: digest(request.prompt), schemaSha256: digest(JSON.stringify(schema)) } };
    };
}

async function controls(sessions, experiment) {
    const cases = {};
    for (const [subject, session] of Object.entries(sessions)) {
        const { proofs, status } = experiment.select({ subject }, session);
        const first = finalRequest(plan.models[0], session, proofs, status);
        assert.equal(proofs.filter(p => p.kind === 'dependency').length, 10);
        assert.equal(proofs.length, 16);
        assert(!first.request.prompt.includes('Unexpected coverage file: /'));
        assertStrictOutputSchema(first.request.options.schema);
        const schema = new Ajv().compile(first.request.options.schema);
        for (const model of plan.models) for (const verdict of ['confirmed', 'refuted', 'inconclusive']) {
            const calls = [], answer = decide(verdict, first.request.options.schema.properties.citations.items.enum);
            assert(schema(answer));
            const result = await trial({ subject, model, arm: 'complete' }, session, () => {}, mock(calls, answer), experiment);
            assert.equal(result.failure, null);
            assert.equal(result.budget, 'within');
            assert.deepEqual(result.writeAttempts, []);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].prompt, first.request.prompt);
            assert.deepEqual(calls[0].options.schema, first.request.options.schema);
            assert.deepEqual(result.answer.anchor, session.identity.anchor);
            assert.deepEqual(result.answer.receiptIds, proofs.map(p => p.id));
        }
        const slot = { subject, model: plan.models[0], arm: 'complete' };
        for (const [reply, code] of [[decide('confirmed', ['E99']), 'citation-foreign'],
            [decide('confirmed', ['E1', 'E1']), 'citation-duplicate'],
            [{ request: null, decision: null }, 'final-response-shape']]) {
            const result = await trial(slot, session, () => {}, mock([], reply), experiment);
            assert.equal(result.failure.code, code);
        }
        const other = sessions[subject === 'original' ? 'mutant' : 'original'].initial[0];
        assert.throws(() => validateProof(session, other), /receipt-revision/u);
        assert.throws(() => validateProof(session, receipt({ ...session.identity, candidate: 'other' }, proofs.at(-1))), /receipt-identity/u);
        const trap = await trial(slot, session, () => assert.fail('unexpected journal'), () => assert.fail('unexpected provider'), experiment, 'publish');
        assert.equal(trap.failure.code, 'dry-run-write-port');
        assert.deepEqual(trap.writeAttempts, ['publishReview']);
        cases[subject] = { identity: session.identity, message: first.facts, sources: proofs.map(({ text, ...proof }) => proof) };
    }
    return { cases, modelCalls: 0 };
}

function checkFrozen(directory) {
    for (const line of fs.readFileSync(path.join(directory, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(directory, file))), hash, file);
    }
}

function checkTransport(directory, manifest, freeze) {
    assert.equal(git(directory, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(directory, 'status', '--porcelain'), '');
    git(directory, 'merge-base', '--is-ancestor', manifest.reference, freeze);
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), manifest.transport.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), manifest.transport.cli);
}

async function measure(output, freeze, slots, sessions, experiment, control) {
    const { ask } = require('../v4/run-pilot.cjs');
    fs.mkdirSync(output, { mode: 0o700 });
    const file = path.join(output, 'trials.jsonl');
    fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
    const log = row => fs.appendFileSync(file, JSON.stringify(row) + '\n');
    log({ event: 'plan', freeze, slots, control });
    // Concurrent models within each fixed tree/repetition pair.
    for (let i = 0; i < slots.length; i += 2) await Promise.all(slots.slice(i, i + 2).map(async slot => {
        const result = await trial(slot, sessions[slot.subject], log, ask, experiment);
        log(result);
        console.log(slot.trial, result.answer?.verdict ?? result.failure?.code ?? 'unresolved', result.budget);
    }));
}

async function main() {
    const [lab, archives, mode, output, freeze] = process.argv.slice(2);
    assert(lab && archives);
    const sessions = fixtures(path.resolve(lab), path.resolve(archives));
    const packets = Object.fromEntries(Object.entries(sessions).map(([subject, session]) => [subject, prepared(session)]));
    const experiment = { select: ({ subject }) => packets[subject] };
    const control = await controls(sessions, experiment);
    if (mode === '--write-controls') return console.log(JSON.stringify(control, null, 2));
    checkFrozen(__dirname);
    assert.deepEqual(control, require('./runner-control.json'));
    if (mode === '--check') return console.log('Both complete packages passed simulated citation and isolation checks.');
    assert.equal(mode, '--run');
    const slots = require('./slots.json');
    assert.equal(slots.length, 12);
    checkTransport(__dirname, plan, freeze);
    await measure(output, freeze, slots, sessions, experiment,
        Object.fromEntries(Object.entries(control.cases).map(([subject, row]) => [subject, row.message])));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { checkFrozen, checkTransport, measure };
