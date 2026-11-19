'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

for (const mode of ['valid', 'missing-start', 'duplicate-start', 'changed-threshold', 'foreign-slot',
    'foreign-slot-subject', 'foreign-slot-repetition', 'valid-interrupted-slot',
    'missing-preregistration', 'foreign-preregistration', 'foreign-slot-preregistration']) {
    test(`the actual full-review scorer binds its selected plan before scoring: ${mode}`, t => {
        const directory = mkdtempSync(path.join(tmpdir(), 'ev07-score-plan-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const plan = JSON.parse(readFileSync(path.join(__dirname, 'campaign-provenance.json')));
        const planFile = path.join(directory, 'plan.json');
        writeFileSync(planFile, JSON.stringify(plan));
        const hash = createHash('sha256').update(readFileSync(planFile)).digest('hex');
        const git = (...args) => execFileSync('git', ['-C', directory, ...args], {
            encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null',
                GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
                GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
        }).trim();
        git('init', '--quiet', '--template='); git('add', 'plan.json');
        const commit = git('commit-tree', git('write-tree'), '-m', 'Preregister synthetic score control');
        git('update-ref', 'HEAD', commit);
        const preregistration = { commit, path: 'plan.json', blob: git('rev-parse', commit + ':plan.json'), sha256: hash };
        const start = { event: 'start', implementation: plan.implementation, plan: hash, preregistration };
        const ledger = mode === 'missing-start' ? [] : [start];
        if (mode === 'missing-preregistration') delete start.preregistration;
        if (mode === 'foreign-preregistration') start.preregistration = { ...preregistration, commit: 'f'.repeat(40) };
        if (mode === 'duplicate-start') ledger.push(start);
        if (mode === 'changed-threshold') {
            plan.repositoryCohort.maximumAddedP95Ms *= 10;
            writeFileSync(planFile, JSON.stringify(plan));
        }
        if (mode.startsWith('foreign-slot') || mode === 'valid-interrupted-slot') {
            const id = plan.repositoryCohort.order[0];
            const manifest = JSON.parse(readFileSync(path.join(__dirname, '../v4/manifest.json')));
            ledger.push({ event: 'slot-start', id, repetition: 1 });
            writeFileSync(path.join(directory, id + '-1.jsonl'), JSON.stringify({ ...start,
                preregistration: mode === 'foreign-slot-preregistration' ? { ...preregistration, blob: 'f'.repeat(40) } : preregistration,
                plan: mode === 'foreign-slot' ? 'f'.repeat(64) : hash,
                subject: { ...manifest.subjects.find(row => row.id === id),
                    ...(mode === 'foreign-slot-subject' ? { head: 'f'.repeat(40) } : {}) },
                repetition: mode === 'foreign-slot-repetition' ? 2 : 1 }) + '\n');
        }
        writeFileSync(path.join(directory, 'slots.jsonl'), ledger.map(row => JSON.stringify(row)).join('\n') + (ledger.length ? '\n' : ''));
        const run = spawnSync('python3', [path.join(__dirname, 'score-review.py'), directory], {
            encoding: 'utf8', env: { ...process.env, COPILOT_EV07_PLAN: planFile },
        });
        if (mode === 'valid' || mode === 'valid-interrupted-slot') {
            assert.equal(run.status, 0, run.stderr);
            const result = JSON.parse(run.stdout);
            assert.equal(result.passed, false);
            assert.equal(result.rows.length, 42);
            if (mode === 'valid-interrupted-slot') assert.equal(result.rows[0].status, 'missing-terminal');
        } else {
            assert.notEqual(run.status, 0, 'foreign or missing plan provenance cannot be scored');
            assert.match(run.stderr, /plan provenance/u);
            assert.equal(run.stdout, '');
        }
    });
}
