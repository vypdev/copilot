'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { fixtures } = require('../detector-verifier-diagnostic/runner.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');
const { makeSession, message, bindReply, verify } = require('./runner.cjs');
const plan = require('./manifest.json');

const priorMatched = () => fs.readFileSync(path.join(__dirname, '../detector-verifier-diagnostic/trials.jsonl'), 'utf8')
    .trim().split('\n').map(line => JSON.parse(line)).filter(row => row.event === 'result' && row.mode === 'matched');

async function control(sessions) {
    const result = { cases: {}, checks: {} };
    const historical = priorMatched();
    assert.equal(historical.length, 4);
    for (const [subject, session] of Object.entries(sessions)) {
        const [first, second] = plan.verifier.models.map(model => message(model, session, session.packet));
        assert(Buffer.from(first.request.prompt).equals(Buffer.from(second.request.prompt)));
        assert.deepEqual(first.request.options.schema, second.request.options.schema);
        assert.deepEqual(first.facts, second.facts);
        const matches = historical.filter(row => row.subject === subject);
        assert.equal(matches.length, 2);
        for (const prior of matches) {
            assert.deepEqual(Object.values(first.facts.citations), prior.evidence.filter(proof => proof.kind === 'git').map(proof => proof.id));
        }
        result.cases[subject] = {
            ...session.identity, ...first.facts,
            sources: session.packet.map(({ alias, proof: { text, ...proof } }) => ({ alias, ...proof })),
        };
    }
    const { N1, N2 } = sessions;
    const row = plan.slots[0];
    const verdict = (value, links, reason, missing = null, citations = ['S1', 'S2', 'S3', 'S4']) =>
        ({ verdict: value, links, reason, missing, citations });
    const refuted = verdict('refuted', { drag: 'retained', freshClick: 'clears', dispatch: 'emits' },
        'The fresh pointerdown clears suppression before tabs handles the click.');
    const confirmed = verdict('confirmed', { drag: 'retained', freshClick: 'keeps', dispatch: 'blocked' },
        'The fresh pointerdown leaves suppression set, so tabs returns without emitting.');
    const inconclusive = verdict('inconclusive', { drag: 'retained', freshClick: 'unknown', dispatch: 'unknown' },
        'The suppression after drag is established.', 'Whether the fresh pointerdown clears suppression.', ['S2']);
    const mock = (response, expected, alterFact) => async (request, mode, checkout, deadline) => {
        assert.equal(mode, 'closed');
        assert.equal(checkout, null);
        assert.equal(deadline, plan.verifier.callMs);
        assert.equal(digest(request.prompt), expected.promptSha256);
        assert.deepEqual(request.options.schema.properties.citations.items.enum, Object.keys(expected.citations));
        const fact = { promptSha256: digest(request.prompt), schemaSha256: digest(JSON.stringify(request.options.schema)),
            toolTypes: [], turnCompletions: 1, usage: { input_tokens: 2500, output_tokens: 100 } };
        return { response, fact: { ...fact, ...alterFact } };
    };
    for (const [subject, response, failure, field, alterFact] of [
        ['N1', refuted], ['N2', confirmed], ['N1', inconclusive],
        ['N1', { ...refuted, request: null }, 'response-shape', 'fields'],
        ['N1', { ...refuted, links: { ...refuted.links, dispatch: 'maybe' } }, 'response-shape', 'dispatch'],
        ['N1', { ...refuted, citations: ['S1', 'S1'] }, 'citation-duplicate', 'citations'],
        ['N1', { ...refuted, citations: ['S5'] }, 'citation-foreign', 'citations'],
        ['N1', { ...inconclusive, missing: '' }, 'response-shape', 'missing'],
        ['N1', refuted, 'session-identity', 'promptSha256', { promptSha256: result.cases.N2.promptSha256 }],
    ]) {
        const events = [];
        const slot = { ...row, subject };
        const session = sessions[subject];
        const actual = await verify(slot, session, event => events.push(event), mock(response, result.cases[subject], alterFact));
        assert.deepEqual(events.map(event => event.event), ['attempt-started', 'attempt-finished']);
        assert.deepEqual(actual.writeAttempts, []);
        assert.equal(actual.budget, 'within');
        if (failure) assert.deepEqual(actual.failure, { code: failure, field });
        else {
            assert.equal(actual.failure, null);
            assert.equal(actual.answer.verdict, response.verdict);
            for (const [key, value] of Object.entries(session.identity)) assert.deepEqual(actual.answer[key], value);
        }
        result.checks[failure ? failure + '/' + field : response.verdict] = 'passed';
    }
    const replace = proof => [{ alias: 'S1', proof }, ...N1.packet.slice(1)];
    const { proof } = N1.packet[0];
    const { operation, candidate, head, tree, artifact, id, ...source } = proof;
    for (const [code, packet] of [
        ['receipt-revision', replace(receipt({ ...N1.identity, head: N2.identity.head, tree: N2.identity.tree }, source))],
        ['receipt-candidate', replace(receipt({ ...N1.identity, candidate: N2.identity.candidate }, source))],
        ['receipt-operation', replace(receipt({ ...N1.identity, operation: N2.identity.operation }, source))],
        ['receipt-integrity', replace({ ...proof, text: proof.text + '\n' })],
    ]) {
        assert.throws(() => bindReply(refuted, N1, packet), { code, field: 'S1' });
        result.checks[code] = 'passed';
    }
    const shifted = { ...N1, identity: { ...N1.identity, anchor: { ...N1.identity.anchor, line: 108 } } };
    assert.throws(() => bindReply(refuted, shifted, N1.packet), { code: 'session-identity', field: 'anchor' });
    result.checks['session-identity/anchor'] = 'passed';

    const trap = await verify(row, N1, () => assert.fail('no attempt should be recorded'),
        () => assert.fail('no provider dispatch'), 'publish');
    assert.deepEqual(trap.writeAttempts, ['publishReview']);
    assert.equal(trap.failure.code, 'dry-run-write-port');
    result.checks['write-trap'] = 'passed';
    result.checks['paired-prompt-and-schema-bytes'] = 'passed';
    return result;
}

function preflight() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    assert.equal(plan.publicationMode, 'dry-run');
    assert.equal(plan.verifier.retries, 0);
    assert.equal(plan.verifier.readRounds, 0);
    assert.equal(plan.ceiling.calls, 1);
    assert.equal(plan.slots.length, 12);
    assert.equal(new Set(plan.slots.map(row => row.trial)).size, 12);
    assert.deepEqual(plan.slots, plan.subjects.flatMap(subject => [1, 2, 3].flatMap(repetition =>
        plan.verifier.models.map(model => ({ trial: [subject, model, repetition].join('-'), subject, model, repetition })))));
}

async function main() {
    const [directory, output, freeze] = process.argv.slice(2);
    assert(directory);
    const sessions = Object.fromEntries(Object.entries(fixtures(directory)).map(([subject, fixture]) => [subject, makeSession(subject, fixture)]));
    const controls = await control(sessions);
    if (output === '--write-controls') {
        console.log(JSON.stringify(controls, null, 2));
        return;
    }
    preflight();
    assert.deepEqual(controls, require('./runner-control.json'));
    if (!output) {
        console.log('Complete verdict controls passed. Zero provider calls.');
        return;
    }

    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    assert.equal(git(__dirname, 'merge-base', '--is-ancestor', plan.reference, freeze), '');
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), plan.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), plan.cli);

    const { ask } = require('../v4/run-pilot.cjs');
    fs.mkdirSync(output, { mode: 0o700 });
    const file = path.join(output, 'trials.jsonl');
    fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
    const journal = row => fs.appendFileSync(file, JSON.stringify(row) + '\n');
    journal({ event: 'plan', freeze, slots: plan.slots, hashes: Object.fromEntries(Object.entries(controls.cases)
        .map(([subject, { promptSha256, schemaSha256, packetSha256 }]) => [subject, { promptSha256, schemaSha256, packetSha256 }])) });
    for (let start = 0; start < plan.slots.length; start += plan.verifier.models.length) {
        await Promise.all(plan.slots.slice(start, start + plan.verifier.models.length).map(async row => {
            const result = await verify(row, sessions[row.subject], journal, ask);
            journal(result);
            console.log(row.subject, row.model, row.repetition, result.answer?.verdict ?? result.failure?.code, result.budget);
        }));
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
