'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { fixtures, lineRead } = require('../detector-verifier-diagnostic/runner.cjs');
const { bindReply } = require('../complete-verdict-diagnostic/runner.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');
const { seed, requestFor, trial } = require('./runner.cjs');
const plan = require('./manifest.json');
const prior = require('../complete-verdict-diagnostic/manifest.json');
const expanded = require('../viewport-sol-diagnostic/runner-control.json');

const slots = plan.subjects.flatMap(subject => plan.repetitions.flatMap(repetition => {
    // Rotate arm order to spread time-of-run effects across arms.
    const offset = (repetition - 1) % plan.arms.length;
    return [...plan.arms.slice(offset), ...plan.arms.slice(0, offset)].map(arm =>
        ({ trial: [subject, repetition, arm].join('-'), subject, repetition, arm, model: plan.model }));
}));

function mock(responses, messages) {
    return async (request, mode, cwd) => {
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        const response = responses[messages.length];
        assert(response, 'unexpected-provider-call');
        messages.push(request);
        return { response, fact: { promptSha256: digest(request.prompt), schemaSha256: digest(JSON.stringify(request.options.schema)),
            toolTypes: [], turnCompletions: 1, inspections: 0, usage: { input_tokens: 4000, output_tokens: 100 } } };
    };
}

async function control(fixed, sessions) {
    const cases = {};
    for (const subject of plan.subjects) {
        const session = sessions[subject];
        const initial = requestFor(session);
        const target = expanded[subject].sources[0];
        const blob = git(fixed[subject].cwd, 'show', session.identity.head + ':' + target.path).split(/\r?\n/u);
        // These hidden assertions inspect the exact missing source and never reach a model or the adapter.
        for (const line of [23, 29]) assert(!initial.request.prompt.includes(blob[line - 1].trim()));
        assert(!initial.request.prompt.includes('querySelector'));
        assert.deepEqual(Object.keys(initial.facts.citations), ['S2', 'S3', 'S4']);
        assert.deepEqual(session.packet.map(({ proof }) => proof.id), expanded[subject].sources.slice(1).map(item => item.id));
        const requested = lineRead(target.path, target.start, target.end);
        const first = { request: requested, decision: null };
        const reply = { verdict: 'inconclusive', citations: ['S3'], links: { drag: 'unknown', freshClick: 'unknown', dispatch: 'unknown' },
            reason: 'Simulated verdict.', missing: 'Inspect the missing route.' };
        const byArm = {};
        for (const arm of plan.arms) {
            const messages = [];
            const events = [];
            const row = slots.find(slot => slot.subject === subject && slot.arm === arm);
            const result = await trial(row, session, fixed[subject], event => events.push(event), mock([first, reply], messages));
            assert.equal(messages[0].prompt, initial.request.prompt);
            assert.deepEqual(messages[0].options, initial.request.options);
            assert.equal(messages.length, arm === 'fixed' ? 1 : 2);
            assert.equal(result.failure, null);
            assert.deepEqual(result.writeAttempts, []);
            assert.equal(result.budget, 'within');
            assert.deepEqual(result.requested, requested);
            const last = result.calls.at(-1).sent;
            assert.deepEqual(Object.keys(last.citations), arm === 'on-demand' ? ['S2', 'S3', 'S4', 'S5'] : ['S2', 'S3', 'S4']);
            assert.equal(result.deliveryStatus, { fixed: 'initial-only', repeat: 'no-new-source', 'on-demand': 'new-source' }[arm]);
            if (arm !== 'fixed') {
                assert.equal(messages[1].prompt.includes(blob[22].trim()), arm === 'on-demand');
                assert.deepEqual(messages[1].options.schema.required, ['verdict', 'citations', 'links', 'reason', 'missing']);
                assert(!Object.hasOwn(messages[1].options.schema.properties, 'request'));
                const lookup = events.find(event => event.event === 'lookup');
                assert.equal(lookup.newProofs.length, arm === 'on-demand' ? 1 : 0);
                assert.equal(lookup.lookup.status, arm === 'on-demand' ? 'provided' : 'withheld');
                if (arm === 'on-demand') assert.deepEqual(lookup.newProofs[0], Object.fromEntries(
                    Object.entries(target).filter(([key]) => key !== 'alias')));
            }
            byArm[arm] = { first: result.calls[0].sent.promptSha256, schema: result.calls[0].sent.schemaSha256,
                calls: result.calls.length, lastReceipts: last.citations, status: result.lookup.status };
        }
        const row = slots.find(slot => slot.subject === subject && slot.arm === 'on-demand');
        const rejected = await trial(row, session, fixed[subject], () => {}, mock([first, { ...reply, citations: ['S1'] }], []));
        assert.equal(rejected.failure.code, 'citation-foreign');
        assert.deepEqual(rejected.writeAttempts, []);
        const secondRequest = await trial(row, session, fixed[subject], () => {}, mock([first, first], []));
        assert.equal(secondRequest.failure.code, 'response-shape');
        assert.equal(secondRequest.calls.length, 2);
        const direct = await trial(row, session, fixed[subject], () => {}, mock([{ decision: reply, request: null }], []));
        assert.equal(direct.calls.length, 1);
        assert.equal(direct.lookup, null);
        assert.equal(direct.answer.verdict, 'inconclusive');
        for (const arm of ['repeat', 'on-demand']) {
            const denied = await trial({ ...row, arm }, session, fixed[subject], () => {},
                mock([{ ...first, request: { ...requested, revision: 'base' } }, reply], []));
            assert.deepEqual(denied.lookup, { status: 'denied', reason: 'revision-not-authorized' });
            assert.equal(denied.sourceUsage.openedFiles, 0);
            assert.deepEqual(denied.calls[1].sent.citations, initial.facts.citations);
        }
        const other = sessions[subject === 'N1' ? 'N2' : 'N1'].packet[0].proof;
        const foreignTree = { ...session, packet: [{ alias: 'S2', proof: { ...other, candidate: session.identity.candidate } },
            ...session.packet.slice(1)] };
        assert.throws(() => bindReply({ ...reply, citations: ['S2'] }, foreignTree, foreignTree.packet), { code: 'receipt-revision' });
        const trap = await trial(row, session, fixed[subject], () => assert.fail('unexpected call'),
            () => assert.fail('unexpected provider'), 'publish');
        assert.equal(trap.failure.code, 'dry-run-write-port');
        assert.deepEqual(trap.writeAttempts, ['publishReview']);

        cases[subject] = { ...session.identity, initial: initial.facts,
            sources: session.packet.map(({ alias, proof: { text, ...proof } }) => ({ alias, ...proof })),
            arms: byArm, guards: ['selector-withheld', 'foreign-citation', 'wrong-tree', 'second-request', 'direct-verdict',
                'same-revision-denial', 'dry-run-write-trap'] };
    }
    return { slots, cases };
}

function auditReceipts(fixed, sessions, file) {
    const events = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    const checked = new Map();
    for (const event of events) {
        const proofs = event.sent?.sources ?? event.newProofs ?? [];
        if (!proofs.length) continue;
        const { identity } = sessions[event.subject];
        for (const { alias, ...proof } of proofs) {
            if (checked.has(proof.id)) {
                assert.deepEqual(proof, checked.get(proof.id));
                continue;
            }
            const locator = identity.head + ':' + proof.path;
            const args = ['--no-replace-objects', '--literal-pathspecs'];
            const cwd = fixed[event.subject].cwd;
            const blob = git(cwd, ...args, 'rev-parse', locator).trim();
            const lines = git(cwd, ...args, 'show', locator).replace(/\r\n/gu, '\n').replace(/\n$/u, '').split('\n');
            assert(proof.start >= 1 && proof.end >= proof.start && proof.end <= lines.length);
            const source = { kind: 'git', path: proof.path, blob, start: proof.start, end: proof.end,
                text: lines.slice(proof.start - 1, proof.end).join('\n') };
            const { text, ...attestation } = receipt(identity, source);
            assert.deepEqual(proof, attestation);
            checked.set(proof.id, proof);
        }
    }
    console.log(JSON.stringify({ distinctReceipts: checked.size, checked: [...checked.keys()] }, null, 2));
}

function preflight() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    assert.equal(plan.publicationMode, 'dry-run');
    assert.equal(plan.attemptsPerCase, 2);
    assert.equal(plan.readRounds, 1);
    assert.equal(plan.retries, 0);
    assert.equal(slots.length, 18);
    assert.equal(new Set(slots.map(row => row.trial)).size, slots.length);
}

async function main() {
    const [directory, output, freeze] = process.argv.slice(2);
    assert(directory);
    const fixed = fixtures(directory);
    const sessions = Object.fromEntries(Object.entries(fixed).map(([subject, fixture]) => [subject, seed(subject, fixture)]));
    const attestation = await control(fixed, sessions);
    if (output === '--write-controls') {
        console.log(JSON.stringify(attestation, null, 2));
        return;
    }
    preflight();
    assert.deepEqual(attestation, require('./runner-control.json'));
    if (output === '--audit-receipts') {
        auditReceipts(fixed, sessions, freeze);
        return;
    }
    if (!output) {
        console.log('Three-arm prompt, omission, retrieval, receipts and write-trap controls passed. Zero provider calls.');
        return;
    }

    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    assert.equal(git(__dirname, 'merge-base', '--is-ancestor', plan.reference, freeze), '');
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), prior.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), prior.cli);

    const { ask } = require('../v4/run-pilot.cjs');
    fs.mkdirSync(output, { mode: 0o700 });
    const file = path.join(output, 'trials.jsonl');
    fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
    const journal = row => fs.appendFileSync(file, JSON.stringify(row) + '\n');
    journal({ event: 'plan', freeze, slots, initial: Object.fromEntries(Object.entries(attestation.cases)
        .map(([subject, row]) => [subject, row.initial])) });
    for (const row of slots) {
        const result = await trial(row, sessions[row.subject], fixed[row.subject], journal, ask);
        journal(result);
        console.log(row.trial, result.lookup?.status ?? 'no-lookup', result.answer?.verdict ?? result.failure?.code ?? 'unresolved', result.budget);
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
