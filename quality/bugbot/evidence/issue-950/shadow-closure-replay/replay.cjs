'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createShadowVerifier } = require('../shadow-verification/adapter.cjs');
const { git } = require('../shadow-real-prs/broker.cjs');
const { hash } = require('../shadow-real-prs/session.cjs');
const plan = require('../shadow-verification/plan.json');

async function replay(lab, subjectNumber, output, localPython) {
    const subjects = { 24: 'domus-24-luna.jsonl', 29: 'domus-29-sol.jsonl' };
    assert(Object.hasOwn(subjects, subjectNumber), 'unknown frozen subject');
    const file = path.join(__dirname, '../normal-flow-shadow', subjects[subjectNumber]);
    const input = fs.readFileSync(file, 'utf8');
    const rows = input.trim().split('\n').map(line => JSON.parse(line));
    const { subject, configuration } = rows.find(row => row.event === 'plan');
    const [entry] = rows.find(row => row.event === 'workflow-result').results[0].payload.bugbotShadowVerification.candidates;
    const { id, hypothesis, anchor, repository, pullRequest, headSha } = entry.candidate;
    assert.equal(pullRequest, Number(subjectNumber));
    assert.equal(headSha, subject.head);
    assert.equal(configuration.model, subject.model);
    const repo = path.join(lab, repository.name + '.git');
    assert.equal(git(repo, ['remote']), '');
    assert.equal(git(repo, ['rev-parse', headSha + '^{tree}']).trim(), subject.tree);
    assert.equal(git(repo, ['rev-parse', subject.base + '^{tree}']).trim(), subject.baseTree);
    assert.equal(plan.publication, 'dry-run');
    const cli = execFileSync(configuration.executable || 'codex', ['--version'], { encoding: 'utf8' }).trim();
    assert.equal(cli, plan.cli);
    const runtime = localPython ? execFileSync(localPython, ['-c',
        'import platform, sqlite3; print(platform.python_version(), sqlite3.sqlite_version)'], { encoding: 'utf8' }).trim() : null;
    if (runtime) assert.equal(runtime, plan.localRuntime.python + ' ' + plan.localRuntime.sqlite);
    const root = path.join(__dirname, '../shadow-verification');
    const protocol = Object.fromEntries(['prompt.txt', 'plan.json', 'schema.cjs', 'run.cjs', 'broker.cjs', 'adapter.cjs', 'session.cjs']
        .map(name => [name, hash(fs.readFileSync(path.join(root, name)))]));
    const candidate = { id, hypothesis, anchor, repository, pullRequest, headSha, baseSha: subject.base,
        allowBase: entry.candidate.allowBase ?? false };

    fs.writeFileSync(output, '', { flag: 'wx', mode: 0o600 });
    const log = event => fs.appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
    log({ event: 'replay-plan', publication: plan.publication, candidate, configuration, cli, runtime, protocol,
        frozenLedger: subjects[subjectNumber], frozenLedgerSha256: hash(input) });
    let investigation;
    const verifier = createShadowVerifier(lab, event => {
        if (event.event === 'finding-result') investigation = event;
        log(event);
    });
    const result = await verifier.verify({ candidate, configuration });
    assert(investigation, 'missing-verification-ledger');
    assert.deepEqual(investigation.writes, []);
    assert.deepEqual(investigation.anchor, candidate.anchor);
    assert(investigation.turns.every(turn => turn.resolvedModel === configuration.model), 'model-drift');
    log({ event: 'replay-completed', status: result.status, reportedModel: result.reportedModel ?? null,
        verdict: result.verdict ?? null, writes: investigation.writes });
    console.log(JSON.stringify({ candidate: id, status: result.status, verdict: result.verdict ?? null,
        technicalFailure: result.status === 'technical-failure' ? result.reason : null, turns: investigation.turns.length,
        wallMs: investigation.wallMs, writes: investigation.writes }));
}

replay(...process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
