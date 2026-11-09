'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { trial, scenario } = require('../causal-replay/runner.cjs');
const { ask } = require('../v4/run-pilot.cjs');
const { diffExcerpt, digest } = require('../v4/verification.cjs');
const { selectAnchor } = require('../tree-search/contract.cjs');
const { git } = require('../on-demand/contract.cjs');
const manifest = require('./manifest.json');
const heldOut = require('./held-out.lock.json');

function reservedScenario(subject, directory) {
    const cwd = path.join(directory, subject);
    const { binding: b, candidate: c, evidence: initial } = heldOut[subject];
    assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), b.head);
    assert.equal(git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), b.tree);
    assert.equal(git(cwd, 'remote'), '');
    assert.equal(git(cwd, 'status', '--porcelain'), '');
    const diff = (...paths) => git(cwd, '-c', 'core.quotePath=true', 'diff', '--no-ext-diff', '--no-textconv',
        '--no-renames', '--unified=3', b.base, b.head, '--', ...paths);
    assert.equal(digest(diff(...b.paths)), b.diffSha256);
    const fileDiff = diff(c.path);
    const patch = fileDiff.slice(fileDiff.indexOf('@@ '));
    const anchor = selectAnchor({ path: c.path, side: 'RIGHT', line: c.line }, patch);
    assert(anchor.selected);
    const excerpt = diffExcerpt({ file: c.path, line: anchor.selected.line }, [{ filename: c.path, patch }]);
    assert(excerpt);
    for (const item of initial) {
        const locator = b.head + ':' + item.path;
        assert.equal(item.head, b.head);
        assert.equal(git(cwd, 'rev-parse', locator).trim(), item.blob);
        assert.equal(git(cwd, 'show', locator).split('\n').slice(item.start - 1, item.end).join('\n'), item.text);
    }
    return { cwd, b, c, anchor, excerpt, initial };
}

function preflight() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    assert.equal(manifest.publicationMode, 'dry-run');
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), manifest.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), manifest.cli);
}

function plan() {
    const rows = manifest.models.flatMap(model => manifest.subjects.flatMap(subject =>
        manifest.arms.flatMap(arm => manifest.repetitions.map(repetition => ({
            trial: digest(`module-diagnostic/${model}/${subject}/${arm}/${repetition}`).slice(0, 16),
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
        manifest.heldOut.includes(subject) ? reservedScenario(subject, reserved) : scenario(subject, null, known)]));
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
                    commonGitOnly: manifest.commonGitOnly.includes(row.subject),
                    comparison: `module-diagnostic/${row.model}/${row.subject}/${row.repetition}`,
                });
                journal({ ...result, event: 'result' });
                console.log(row.model, row.subject, row.arm, row.repetition, result.verdict ?? result.reason);
            }
        });
    }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
