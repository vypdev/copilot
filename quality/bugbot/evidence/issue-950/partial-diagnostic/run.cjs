'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { trial, scenario } = require('./runner.cjs');
const { ask } = require('../v4/run-pilot.cjs');
const { digest } = require('../v4/verification.cjs');
const { git } = require('../on-demand/contract.cjs');
const manifest = require('./manifest.json');
const heldOut = require('./held-out.lock.json');
const knownFixtures = require('../module-diagnostic/held-out.lock.json');

function preflight() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    assert.equal(manifest.publicationMode, 'dry-run');
    assert.deepEqual(manifest.commonGitOnly, manifest.subjects);
    const controls = fs.readFileSync(path.join(__dirname, 'runner-controls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(controls.length, 10);
    assert.equal(controls.filter(row => row.lookup.status === 'partial').length, 6);
    assert(controls.every(row => row.decisiveDelivered && row.rounds === 2 && row.writeAttempts.length === 0
        && row.packets.every(packet => packet.packetBytes <= manifest.packetCeiling.packetBytes
            && packet.promptBytes <= manifest.packetCeiling.promptBytes)));
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), manifest.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), manifest.cli);
}

function plan() {
    const rows = manifest.models.flatMap(model => manifest.subjects.flatMap(subject =>
        manifest.arms.flatMap(arm => manifest.repetitions.map(repetition => ({
            trial: digest(`partial-diagnostic/${model}/${subject}/${arm}/${repetition}`).slice(0, 16),
            model, subject, arm, repetition,
        })))));
    assert.equal(rows.length, manifest.plannedTrials);
    return rows.sort((left, right) => left.trial.localeCompare(right.trial));
}

async function main() {
    const [known, reserved, log, freeze] = process.argv.slice(2);
    assert(known && reserved, 'Usage: node run.cjs KNOWN_SUBJECTS RESERVED_SUBJECTS [NEW_JOURNAL FREEZE_COMMIT]');
    preflight();
    const fixtures = Object.fromEntries(manifest.subjects.map(subject => [subject,
        manifest.heldOut.includes(subject) ? scenario(subject, reserved, heldOut) : scenario(subject, known, knownFixtures)]));
    if (!log) {
        console.log('Frozen cohort, packets, SDK and CLI validated without model calls.');
        return;
    }
    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    fs.writeFileSync(log, '', { flag: 'wx', mode: 0o600 });
    const journal = row => fs.appendFileSync(log, JSON.stringify(row) + '\n');
    const rows = plan();
    journal({ event: 'plan', freeze, rows });
    await Promise.all(manifest.models.flatMap(model => {
        const queue = rows.filter(row => row.model === model);
        return Array.from({ length: manifest.concurrencyPerModel }, async () => {
            let row;
            while ((row = queue.shift())) {
                const result = await trial(row, fixtures[row.subject], journal, ask, {
                    publicationMode: manifest.publicationMode,
                    comparison: `partial-diagnostic/${row.model}/${row.subject}/${row.repetition}`,
                });
                journal({ ...result, event: 'result' });
                console.log(row.model, row.subject, row.arm, row.repetition, result.verdict ?? result.reason);
            }
        });
    }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
