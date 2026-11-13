'use strict';

const { spawnSync } = require('node:child_process');
const { devNull } = require('node:os');
const { hash } = require('./hash.cjs');

// eslint-disable-next-line no-control-regex -- Only ordinary relative Git paths are accepted.
const safePath = value => typeof value === 'string' && value.length <= 300 && !/[\\\u0000-\u001f\u007f]/u.test(value)
    && value.split('/').every(part => part && !['.', '..', '.git'].includes(part.toLowerCase()));

function git(repo, args, exits = [0]) {
    const result = spawnSync('git', ['--no-pager', '--no-optional-locks', '--no-replace-objects', '--literal-pathspecs',
        '-c', 'protocol.allow=never', '-C', repo, ...args], {
        encoding: 'utf8', timeout: 4_000, maxBuffer: 4 * 1024 * 1024,
        env: {
            PATH: process.env.PATH ?? process.env.Path, LC_ALL: 'C',
            ...(process.platform === 'win32' && { SystemRoot: process.env.SystemRoot, PATHEXT: process.env.PATHEXT }),
            GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_TERMINAL_PROMPT: '0',
        },
    });
    if (result.error) throw new Error('git-budget', { cause: result.error });
    if (!exits.includes(result.status)) throw new Error('git-unavailable');
    return result.stdout;
}

function blob(repo, sha, file) {
    if (!safePath(file)) throw new Error('path-denied');
    const row = git(repo, ['ls-tree', '-z', sha, '--', file]);
    // eslint-disable-next-line no-control-regex -- Git ls-tree -z terminates each record with NUL.
    const entry = /^(100644|100755) blob ([a-f0-9]{40,64})\t([^\u0000]+)\u0000$/u.exec(row);
    if (!entry || entry[3] !== file) throw new Error('no-file');
    const source = git(repo, ['cat-file', 'blob', entry[2]]);
    if (source.includes('\u0000') || source.includes('\uFFFD')) throw new Error('non-text');
    return { blob: entry[2], lines: source.replace(/\n$/u, '').split(/\r?\n/u) };
}

module.exports = { git, blob, safePath, hash };
