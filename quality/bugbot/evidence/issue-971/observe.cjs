'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const root = path.resolve(__dirname, '../../../..');
require('../issue-950/ev07-shadow/load.cjs');
const fixture = name => require(path.join(root, 'src/tooling/__tests__/fixtures', name));
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'quality/bugbot/corpus.v1.json')));
const item = id => corpus.cases.find(row => row.id === id);
const { observeCallPathFixture } = fixture('bugbot_call_path_oracles');
const { observeRequestTransform } = fixture('bugbot_request_transform_oracles');
const { observeInitialSessionSource } = fixture('bugbot_initial_session_oracles');
const observations = {
    'test-delegate-bypasses-stub': observeCallPathFixture(item('test-delegate-bypasses-stub')),
    'request-transform-write': observeRequestTransform(item('request-transform-write')),
    'session-source-opaque-bootstrap': observeInitialSessionSource(item('session-source-opaque-bootstrap')),
    'session-source-expired-refresh': observeInitialSessionSource(item('session-source-expired-refresh')),
};
assert.deepEqual(observations['test-delegate-bypasses-stub'], { passes: false, calls: 0 });
assert.equal(observations['request-transform-write'].productionHeaderPasses, false);
assert.equal(observations['session-source-opaque-bootstrap'].assertionPassed, false);
assert.equal(observations['session-source-expired-refresh'].assertionPassed, false);

// Authored primitive controls; never execute arbitrary corpus or consumer text.
const python = execFileSync('python3', [path.join(__dirname, 'short-circuit-probe.py')], { encoding: 'utf8' });
observations.python = JSON.parse(python);
const workflow = require('js-yaml').load(item('actions-readonly-metadata').diff.split('\n').map(line => line.slice(1)).join('\n'));
assert(Array.isArray(workflow.steps) && workflow.jobs === undefined);
observations['actions-readonly-metadata'] = { rootSteps: workflow.steps.length, jobsPresent: false,
    contract: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps',
    scope: 'parsed supplied fragment and official syntax; no native GitHub run' };
const directory = fs.mkdtempSync(path.join(tmpdir(), 'bugbot-971-shell-'));
try {
    fs.mkdirSync(path.join(directory, 'owned dir'));
    fs.writeFileSync(path.join(directory, 'owned dir/source file.txt'), 'owned fixture');
    const env = { PATH: '/usr/bin:/bin', UPLOAD_PATH: 'owned dir/source file.txt' };
    const unsafe = spawnSync('/bin/sh', ['-c', 'tar -czf backup.tgz $UPLOAD_PATH'], { cwd: directory, env, encoding: 'utf8' });
    const quoted = spawnSync('/bin/sh', ['-c', 'tar -czf fixed.tgz -- "$UPLOAD_PATH"'], { cwd: directory, env, encoding: 'utf8' });
    assert.notEqual(unsafe.status, 0); assert.equal(quoted.status, 0, quoted.stderr);
    observations['shell-unquoted-path'] = { unquotedExit: unsafe.status, quotedExit: quoted.status,
        archived: execFileSync('/usr/bin/tar', ['-tzf', 'fixed.tgz'], { cwd: directory, encoding: 'utf8' }).trim() };
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
const sources = ['bugbot_call_path_oracles.ts', 'bugbot_request_transform_oracles.ts', 'bugbot_initial_session_oracles.ts'];
const result = { node: process.version, method: 'immutable owned oracles and separately authored primitives; no consumer execution',
    sources: Object.fromEntries(sources.map(file => [file, createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'src/tooling/__tests__/fixtures', file))).digest('hex')])),
    observations, modelCalls: 0, evaluatedPrWriteAttempts: 0 };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
