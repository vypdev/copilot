'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { makeSession, message, bindReply, verify } = require('../complete-verdict-diagnostic/runner.cjs');
const { fixtures, sourceReader, lineRead } = require('../detector-verifier-diagnostic/runner.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');
const oldPlan = require('../complete-verdict-diagnostic/manifest.json');
const historical = require('../complete-verdict-diagnostic/runner-control.json').cases;
const plan = require('./manifest.json');

function expand(subject, fixture) {
    const prior = makeSession(subject, fixture);
    const { alias, start, end } = plan.sourceExpansion;
    const [old, ...other] = prior.packet;
    assert.equal(old.alias, alias);
    assert.equal(old.proof.path, prior.identity.anchor.path);
    assert.equal(old.proof.start, 26);
    assert.equal(old.proof.end, end);
    const reader = sourceReader(fixture, { head: { ...prior.identity, scopes: [''] } });
    const evidence = reader.read(lineRead(old.proof.path, start, end), false);
    assert.equal(evidence.status, 'provided');
    assert.equal(evidence.receipts.length, 1);
    const [proof] = evidence.receipts;

    const locator = prior.identity.head + ':' + old.proof.path;
    const blob = git(fixture.cwd, 'show', locator).split(/\r?\n/u);
    assert.equal(proof.path, old.proof.path);
    assert.equal(proof.blob, git(fixture.cwd, 'rev-parse', locator).trim());
    assert.deepEqual([proof.start, proof.end], [start, end]);
    assert.equal(proof.text, blob.slice(start - 1, end).join('\n'));
    assert.equal(proof.text.split('\n').slice(old.proof.start - start).join('\n'), old.proof.text);
    assert.equal(proof.artifact, digest(proof.text));
    assert.notEqual(proof.id, old.proof.id);
    assert.deepEqual(receipt(prior.identity, proof), proof);

    const expanded = { alias, proof };
    const session = { ...prior, packet: [expanded, ...other] };
    const before = message('gpt-6.1-sol', prior, prior.packet);
    const after = message('gpt-6.1-sol', session, session.packet);
    assert.equal(before.facts.promptSha256, historical[subject].promptSha256);
    assert.deepEqual(before.facts.citations, historical[subject].citations);
    assert.equal(after.facts.schemaSha256, historical[subject].schemaSha256);
    assert.deepEqual(after.request.options, before.request.options);
    assert.deepEqual(after.request.configuration, before.request.configuration);
    assert.equal(after.request.prompt, before.request.prompt.replace(JSON.stringify(old), JSON.stringify(expanded)));

    // Replacing the expanded source with the valid historical receipt is still a packet mismatch.
    const mock = { verdict: 'inconclusive', citations: ['S1'], links: { drag: 'unknown', freshClick: 'unknown', dispatch: 'unknown' },
        reason: 'Test of receipt binding.', missing: 'Test premise.' };
    assert.deepEqual(bindReply(mock, session, session.packet).receiptIds, [proof.id]);
    assert.throws(() => bindReply(mock, session, prior.packet), { code: 'receipt-integrity', field: alias });
    return { session, control: { ...session.identity, ...after.facts, historicalS1: old.proof.id,
        sources: session.packet.map(({ alias: key, proof: { text, ...metadata } }) => ({ alias: key, ...metadata })) } };
}

function verifyFreeze() {
    const freeze = fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8');
    for (const line of freeze.trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    assert.deepEqual(plan.slots, ['N1', 'N2'].flatMap(subject => [1, 2, 3].map(repetition =>
        ({ trial: subject + '-Sol-' + repetition, subject, model: 'gpt-6.1-sol', repetition }))));
    assert.equal(oldPlan.publicationMode, 'dry-run');
    assert.equal(oldPlan.ceiling.calls, 1);
    assert.equal(oldPlan.verifier.readRounds, 0);
    assert.equal(oldPlan.verifier.retries, 0);
}

async function main() {
    const [directory, output, freeze] = process.argv.slice(2);
    assert(directory);
    const fixed = Object.fromEntries(Object.entries(fixtures(directory)).map(([subject, fixture]) => [subject, expand(subject, fixture)]));
    const control = Object.fromEntries(Object.entries(fixed).map(([subject, item]) => [subject, item.control]));
    if (output === '--write-controls') {
        console.log(JSON.stringify(control, null, 2));
        return;
    }

    verifyFreeze();
    assert.deepEqual(control, require('./runner-control.json'));
    if (!output) {
        console.log('Pinned ranges, receipt bindings and the single-fragment prompt delta verified. Zero provider calls.');
        return;
    }
    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    assert.equal(git(__dirname, 'merge-base', '--is-ancestor', plan.reference, freeze), '');
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), oldPlan.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), oldPlan.cli);

    const { ask } = require('../v4/run-pilot.cjs');
    fs.mkdirSync(output, { mode: 0o700 });
    const file = path.join(output, 'trials.jsonl');
    fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
    const journal = row => fs.appendFileSync(file, JSON.stringify(row) + '\n');
    const hashes = Object.fromEntries(Object.entries(control).map(([subject, { promptSha256, schemaSha256, packetSha256 }]) =>
        [subject, { promptSha256, schemaSha256, packetSha256 }]));
    journal({ event: 'plan', freeze, slots: plan.slots, hashes });
    for (const row of plan.slots) {
        const result = await verify(row, fixed[row.subject].session, journal, ask);
        journal(result);
        console.log(row.trial, result.answer?.verdict ?? result.failure?.code, result.budget);
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
