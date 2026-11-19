'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

test('the actual runner resolves a relative lab before entering its private checkout, without model calls', t => {
    const directory = mkdtempSync(path.join(tmpdir(), 'bugbot-relative-lab-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const source = path.join(directory, 'lab', 'project.git'), bin = path.join(directory, 'bin');
    mkdirSync(source, { recursive: true });
    mkdirSync(bin);
    const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet', '--template=');
    writeFileSync(path.join(source, 'index.ts'), 'export const answer = 42;\n');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixed source');
    const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
    writeFileSync(path.join(directory, 'subjects.json'), JSON.stringify({ publication: 'dry-run', effort: 'xhigh',
        subjects: [{ repository: 'owner/project', number: 1, baseRef: 'master', headRef: 'review', head, base: head,
            tree, baseTree: tree, model: 'gpt-6-luna' }] }));
    const forbidden = path.join(directory, 'model-invoked');
    writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli fixture"; exit 0; fi\n'
        + 'touch "$MODEL_FORBIDDEN"\nexit 91\n', { mode: 0o700 });
    const run = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), 'lab', '1', 'result.jsonl', 'subjects.json'], {
        cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
            MODEL_FORBIDDEN: forbidden },
    });
    assert.equal(run.status, 0, run.stderr);
    const rows = readFileSync(path.join(directory, 'result.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const result = rows.find(row => row.event === 'workflow-result');
    assert.deepEqual(result.writes, []);
    assert.equal(result.checkoutUnchanged, true);
    assert.equal(result.peakVerifierConcurrency, 0);
    assert.equal(rows.filter(row => row.event === 'detector-start').length, 0);
    assert.equal(existsSync(forbidden), false);
});
