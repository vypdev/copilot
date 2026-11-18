'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { implementation } = require('./configuration.cjs');

function requirePinnedImplementation(root = path.resolve(__dirname, '../../../../..'), pin = implementation) {
    assert.match(pin, /^[a-f0-9]{40}$/u, 'invalid implementation pin');
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    assert.equal(git('rev-parse', '--verify', pin + '^{commit}'), pin,
        'preregistered implementation commit unavailable');
    const source = ['src', 'pnpm-lock.yaml', 'tsconfig.json'];
    assert.equal(git('diff', '--no-ext-diff', '--no-textconv', '--name-only', pin, '--', ...source), '',
        'application source or lockfile does not match the preregistered implementation');
    assert.equal(git('diff', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', pin, '--', ...source), '',
        'staged application source or lockfile differs from the preregistered implementation');
    assert.equal(git('ls-files', '--others', '--', ...source), '',
        'untracked application source or lockfile');
    return pin;
}

function requirePinnedRuntime(cli, runtime = require('./configuration.cjs').runtime) {
    assert.equal(typeof runtime?.codex, 'string', 'preregistered CLI version unavailable');
    assert.equal(cli, runtime.codex, 'CLI version differs from the preregistered runtime');
    return cli;
}

module.exports = { requirePinnedImplementation, requirePinnedRuntime };
