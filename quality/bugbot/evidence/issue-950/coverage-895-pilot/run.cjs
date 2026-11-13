'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { fixtures } = require('./fixture.cjs');
const { requestFor, trial, bindReply } = require('./runner.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { lineRead } = require('../detector-verifier-diagnostic/runner.cjs');
const { digest } = require('../v4/verification.cjs');
const prior = require('../coverage-895-reserved/dependency-control.json');
const plan = require('./manifest.json');

function schedule() {
    const batches = [];
    for (let repetition = 1; repetition <= plan.repetitions; repetition++) {
        const arms = [...plan.arms.slice(repetition - 1), ...plan.arms.slice(0, repetition - 1)];
        for (const subject of plan.subjects) for (const arm of arms) {
            batches.push(plan.models.map(model => ({ trial: [subject, repetition, arm, model].join('/'),
                subject, repetition, arm, model })));
        }
    }
    return batches;
}

const measure = ({ text, ...proof }) => proof;
const decision = citations => ({ verdict: 'inconclusive', citations, reason: 'Simulated receipt delivery.',
    missing: 'Run a separate model diagnostic.' });

function mock(requested, calls, replaceFinal) {
    return async (request, mode, cwd, deadline) => {
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        assert(deadline <= plan.callMs);
        calls.push(request);
        const schema = request.options.schema;
        const response = calls.length === 1 ? { request: requested, decision: null }
            : replaceFinal ?? decision(schema.properties.citations.items.enum);
        return { response, fact: { outcome: 'completed', turnCompletions: 1, inspections: 0,
            toolTypes: [], turnStartedMs: 1, usage: { input_tokens: 5000, output_tokens: 150 },
            promptSha256: digest(request.prompt), schemaSha256: digest(JSON.stringify(schema)) } };
    };
}

async function controls(sessions) {
    const cases = {};
    for (const [subject, session] of Object.entries(sessions)) {
        const requested = lineRead('vitest.config.ts', 1, subject === 'original' ? 15 : 24);
        const slot = { subject, model: plan.models[0], arm: 'on-demand' };
        const first = requestFor(slot.model, session, session.initial);
        assert(!first.request.prompt.includes('vitest.config.ts'));
        assert(!first.request.prompt.includes('coverage-summary.json generated'));
        assert.equal(session.initial.filter(p => p.kind === 'dependency').length, 10);
        const arms = {};
        for (const model of plan.models) for (const arm of plan.arms) {
            const calls = [];
            const result = await trial({ ...slot, model, arm }, session, () => {}, mock(requested, calls));
            assert.equal(result.failure, null);
            assert.deepEqual(result.admission, { status: 'admitted' });
            assert.equal(result.calls.length, arm === 'fixed' ? 1 : 2);
            assert.equal(result.budget, 'within');
            assert.deepEqual(result.writeAttempts, []);
            assert.equal(calls[0].prompt, first.request.prompt);
            assert.deepEqual(calls[0].options.schema, first.request.options.schema);
            if (arm === 'on-demand') assert.deepEqual(result.retrieved.map(p => p.id), [prior.cases[subject].recoveredSource]);
            else assert.deepEqual(result.retrieved, []);
            if (arm !== 'fixed') {
                const expectedIds = [...session.initial.map(p => p.id), ...result.retrieved.map(p => p.id)];
                const final = result.calls[1].sent;
                assert.deepEqual(Object.values(final.aliases), expectedIds);
                assert.deepEqual(calls[1].options.schema.properties.citations.items.enum, Object.keys(final.aliases));
                assert.deepEqual(result.answer.receiptIds, expectedIds);
                assert.deepEqual(result.answer.anchor, session.identity.anchor);
                assert.equal(result.answer.lockBlob, session.identity.lockBlob);
                arms[arm] ??= { first: first.facts, second: final };
                // The deadline may depend on measured runtime, so attest only deterministic facts.
                delete arms[arm].second.deadline;
                const { deadline, ...actual } = final;
                assert.deepEqual(arms[arm].second, actual);
            } else arms[arm] = { first: first.facts, second: null };
        }
        const foreign = await trial(slot, session, () => {}, mock(requested, [], decision(['E99'])));
        assert.deepEqual(foreign.failure, { stage: 'verdict', code: 'citation-foreign' });
        const another = await trial(slot, session, () => {}, mock(requested, [], { decision: null, request: requested }));
        assert.deepEqual(another.failure, { stage: 'verdict', code: 'final-response-shape' });
        const revision = sessions[subject === 'original' ? 'mutant' : 'original'].initial[0];
        assert.throws(() => bindReply(decision(['E1']), session, [revision]), /receipt-revision/u);
        const badVersion = receipt(session.identity, { ...session.initial[0], version: '0.0.0' });
        assert.throws(() => bindReply(decision(['E1']), session, [badVersion]), /dependency-version/u);
        const badLock = receipt(session.identity, { ...session.initial[0], lockBlob: '0'.repeat(40) });
        assert.throws(() => bindReply(decision(['E1']), session, [badLock]), /dependency-lock/u);
        const trap = await trial(slot, session, () => assert.fail('unexpected call'), () => assert.fail('unexpected provider'), 'publish');
        assert.equal(trap.failure.code, 'dry-run-write-port');
        assert.deepEqual(trap.writeAttempts, ['publishReview']);
        cases[subject] = { identity: session.identity, initial: first.facts, initialSources: session.initial.map(measure), arms };
    }
    return { cases, guards: ['prompt-equality', 'withheld-config', 'one-real-git-round', 'dynamic-aliases', 'foreign-citation',
        'foreign-revision', 'foreign-version', 'foreign-lock', 'second-request', 'write-trap'], modelCalls: 0 };
}

function checkFrozen() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
}

async function main() {
    const [lab, archives, mode, output, freeze] = process.argv.slice(2);
    assert(lab && archives);
    const sessions = fixtures(path.resolve(lab), path.resolve(archives));
    const control = await controls(sessions);
    if (mode === '--write-controls') {
        console.log(JSON.stringify(control, null, 2));
        return;
    }
    checkFrozen();
    assert.deepEqual(control, require('./runner-control.json'));
    if (!mode || mode === '--check') {
        console.log('Both subjects, both turns and all six model/arm combinations passed simulated controls. Zero model calls.');
        return;
    }
    assert.equal(mode, '--run');
    const batches = schedule();
    const slots = batches.flat();
    assert.equal(slots.length, 36);
    assert.equal(new Set(slots.map(slot => slot.trial)).size, slots.length);
    assert.deepEqual(slots, require('./slots.json'));
    assert.equal(plan.publicationMode, 'dry-run');
    assert.equal(plan.retries, 0);
    assert.equal(plan.readRounds, 1);
    assert.equal(plan.maxCallsPerTrial, 2);
    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    assert.equal(git(__dirname, 'merge-base', '--is-ancestor', plan.reference, freeze), '');
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), plan.transport.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), plan.transport.cli);

    const { ask } = require('../v4/run-pilot.cjs');
    fs.mkdirSync(output, { mode: 0o700 });
    const file = path.join(output, 'trials.jsonl');
    fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
    const journal = row => fs.appendFileSync(file, JSON.stringify(row) + '\n');
    journal({ event: 'plan', freeze, slots, initial: Object.fromEntries(Object.entries(control.cases).map(([name, { initial }]) => [name, initial])) });
    for (const batch of batches) await Promise.all(batch.map(async slot => {
        const result = await trial(slot, sessions[slot.subject], journal, ask);
        journal(result);
        console.log(slot.trial, result.lookup?.status ?? 'no-lookup', result.answer?.verdict ?? result.failure?.code ?? 'unresolved', result.budget);
    }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { schedule };
