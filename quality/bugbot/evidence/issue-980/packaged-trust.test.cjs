'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { test } = require('node:test');

test('packaged approval consumer preserves all fourteen producer-trust boundaries', t => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'packaged-trust-control-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const output = path.join(directory, 'attempt.jsonl');
    try {
        execFileSync(process.execPath, [path.join(__dirname, 'packaged-trust.cjs'),
            path.resolve(__dirname, '../../../../build/github_action/index.js'), output], { encoding: 'utf8' });
    } catch (error) {
        if (fs.existsSync(output)) process.stderr.write(fs.readFileSync(output));
        throw error;
    }
    const rows = fs.readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(rows.at(-1).passed, 14);
    assert.equal(rows.at(-1).realGitHubWriteAttempts, 0);
    for (const row of rows.filter(row => row.id?.startsWith('protected-'))) {
        assert.equal(row.decision, 'recommend (protected-path)');
        assert.equal(row.fakeApprovalWriteAttempts, 0);
        assert.equal(row.currentHeadOnEveryRead, true);
    }
});
