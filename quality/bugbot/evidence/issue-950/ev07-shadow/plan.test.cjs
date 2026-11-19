'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

for (const mode of ['committed', 'nested-committed', 'alternate-profile', 'outside-git', 'untracked', 'modified', 'staged',
    'weaker-precision', 'weaker-latency', 'omitted-positives', 'duplicate-subject', 'foreign-corpus']) {
    test(`plan admission requires committed, complete EV-07 policy: ${mode}`, t => {
        const directory = mkdtempSync(path.join(tmpdir(), 'ev07-plan-control-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const selected = JSON.parse(readFileSync(path.join(__dirname, 'plan.json')));
        if (mode === 'alternate-profile') selected.detector.model = 'gpt-6.1-sol';
        if (mode === 'weaker-precision') selected.corpus.gates.precision = 0.1;
        if (mode === 'weaker-latency') selected.repositoryCohort.maximumAddedP95Ms *= 100;
        if (mode === 'omitted-positives') selected.repositoryCohort.order = selected.repositoryCohort.order.filter(id => id.endsWith('1'));
        if (mode === 'duplicate-subject') selected.repositoryCohort.order[1] = selected.repositoryCohort.order[0];
        if (mode === 'foreign-corpus') selected.corpus.sha256 = 'f'.repeat(64);
        const planDirectory = mode === 'nested-committed' ? path.join(directory, 'protocol') : directory;
        mkdirSync(planDirectory, { recursive: true });
        const file = path.join(planDirectory, 'plan.json');
        writeFileSync(file, JSON.stringify(selected));
        const git = (...args) => execFileSync('git', ['-C', directory, ...args], {
            encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null',
                GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
                GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
        }).trim();
        if (mode !== 'outside-git') {
            git('init', '--quiet', '--template=');
            writeFileSync(path.join(directory, 'README'), 'Synthetic evaluator control; no model calls.\n');
            git('add', 'README', ...(mode === 'untracked' ? [] : [path.relative(directory, file)]));
            const commit = git('commit-tree', git('write-tree'), '-m', 'preregister synthetic control');
            git('update-ref', 'HEAD', commit);
        }
        if (mode === 'modified' || mode === 'staged') {
            selected.detector.model = 'gpt-6.1-sol';
            writeFileSync(file, JSON.stringify(selected));
            if (mode === 'staged') git('add', 'plan.json');
        }
        const run = spawnSync(process.execPath, ['-e',
            'process.stdout.write(require(process.argv[1]).selectedPlanSha256())', path.join(__dirname, 'implementation.cjs')], {
            encoding: 'utf8', env: { ...process.env, COPILOT_EV07_PLAN: file },
        });
        if (['committed', 'nested-committed', 'alternate-profile'].includes(mode)) {
            assert.equal(run.status, 0, run.stderr);
            assert.match(run.stdout, /^[a-f0-9]{64}$/u);
        } else {
            assert.notEqual(run.status, 0, 'an unregistered or weakened plan must not be admitted');
            assert.equal(run.stdout, '');
        }
    });
}
