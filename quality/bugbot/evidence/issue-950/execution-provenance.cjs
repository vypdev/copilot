'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { devNull } = require('node:os');
const path = require('node:path');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = Object.freeze(['src', 'pnpm-lock.yaml', 'tsconfig.json', 'package.json']);

function gitEnvironment() {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
    return { ...env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1' };
}

function trustedGitExecutable() {
    // Bootstrap from the operating system, never PATH or a campaign-provided binary.
    // On macOS resolve the actual developer-tools Git rather than hashing its shim.
    const file = process.platform === 'darwin'
        ? execFileSync('/usr/bin/xcrun', ['--find', 'git'], {
            env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        }).trim()
        : process.platform === 'linux' ? '/usr/bin/git' : undefined;
    assert(file && path.isAbsolute(file), 'qualification Git bootstrap supports Linux and macOS only');
    const executable = fs.realpathSync(file);
    assert(fs.lstatSync(executable).isFile(), 'trusted Git executable unavailable');
    return executable;
}

function pinnedGit(root) {
    root = fs.realpathSync(root);
    const marker = path.join(root, '.git');
    const stat = fs.lstatSync(fs.existsSync(marker) ? marker : root);
    assert(!stat.isSymbolicLink(), 'repository Git identity must not be a symlink');
    let directory = fs.existsSync(marker) ? marker : root;
    if (stat.isFile()) {
        const match = /^gitdir: (.+)\r?\n?$/u.exec(fs.readFileSync(marker, 'utf8'));
        assert(match, 'invalid worktree Git identity');
        directory = path.resolve(root, match[1]);
    } else assert(stat.isDirectory(), 'repository Git identity unavailable');
    const env = gitEnvironment();
    const executable = trustedGitExecutable();
    const command = (...args) => execFileSync(executable, ['--no-pager', '--no-replace-objects', '--literal-pathspecs',
        '--git-dir=' + directory, '--work-tree=' + root, '-C', root,
        '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=' + devNull, '-c', 'core.quotePath=false', '-c', 'log.showSignature=false', ...args],
    { env, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
    command.executable = executable;
    return command;
}

function attestSource(root, implementation) {
    assert.match(implementation ?? '', /^[a-f0-9]{40}$/u, 'invalid implementation pin');
    root = fs.realpathSync(root);
    const git = pinnedGit(root);
    const text = (...args) => git(...args).toString('utf8').trim();
    assert.equal(text('rev-parse', '--verify', implementation + '^{commit}'), implementation,
        'preregistered implementation commit unavailable');
    const rows = git('ls-tree', '-r', '-z', '--full-tree', implementation, '--', ...sourcePaths)
        .toString('utf8').split('\0').filter(Boolean).map(row => {
            const tab = row.indexOf('\t');
            const [mode, type, blob] = row.slice(0, tab).split(' ');
            const name = row.slice(tab + 1);
            assert(['100644', '100755'].includes(mode) && type === 'blob', 'source must be a regular committed file');
            assert(!path.isAbsolute(name) && !name.split('/').some(part => ['..', '.git'].includes(part)), 'unsafe source path');
            return { path: name, blob };
        });
    const expected = new Map(rows.map(row => [row.path, row]));
    assert(expected.has('pnpm-lock.yaml') && expected.has('tsconfig.json') && rows.some(row => row.path.startsWith('src/')),
        'preregistered source inventory unavailable');
    // Compare the physical inventory, including ignored files and symlinked parents.
    // Git's assume-unchanged, sparse/skip-worktree and stat cache are not byte evidence.
    const actual = [];
    function visit(relative) {
        const file = path.join(root, relative);
        let stat;
        try { stat = fs.lstatSync(file); }
        catch (error) {
            if (error.code !== 'ENOENT') throw error;
            assert(!expected.has(relative), 'application source or lockfile does not match the preregistered implementation');
            return;
        }
        assert(!stat.isSymbolicLink(), 'application source symlink is not admitted');
        if (stat.isDirectory()) {
            for (const name of fs.readdirSync(file)) visit(relative + '/' + name);
        } else {
            assert(stat.isFile() && expected.has(relative), 'untracked application source or lockfile');
            actual.push(relative);
        }
    }
    for (const name of sourcePaths) visit(name);
    assert.equal(actual.length, expected.size, 'application source or lockfile does not match the preregistered implementation');
    assert.equal(text('diff', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', implementation, '--', ...sourcePaths), '',
        'staged application source or lockfile does not match the preregistered implementation');
    // One batch reads immutable blobs without filters, attributes, textconv or a checkout.
    const contents = execFileSync(git.executable, ['--no-replace-objects', '--git-dir=' + text('rev-parse', '--absolute-git-dir'),
        '-c', 'core.fsmonitor=false', 'cat-file', '--batch'], {
        env: gitEnvironment(), input: rows.map(row => row.blob).join('\n') + '\n', maxBuffer: 256 * 1024 * 1024,
    });
    let offset = 0;
    for (const row of rows) {
        const end = contents.indexOf(10, offset);
        const [blob, type, length] = contents.subarray(offset, end).toString('utf8').split(' ');
        const size = Number(length);
        assert(blob === row.blob && type === 'blob' && Number.isSafeInteger(size) && size >= 0, 'invalid pinned source blob');
        const bytes = contents.subarray(end + 1, end + 1 + size);
        const local = fs.readFileSync(path.join(root, row.path));
        assert(bytes.equals(local), 'application source or lockfile does not match the preregistered implementation: ' + row.path);
        row.sha256 = hash(local);
        offset = end + size + 2;
    }
    assert.equal(offset, contents.length, 'invalid pinned source stream');
    return { implementation, tree: text('rev-parse', implementation + '^{tree}'),
        sourceSha256: hash(JSON.stringify(rows)), dependencyLockSha256: expected.get('pnpm-lock.yaml').sha256,
        compilerConfigurationSha256: expected.get('tsconfig.json').sha256 };
}

function runtimeIdentity(root) {
    const typescript = require.resolve('typescript', { paths: [root] });
    const gitExecutable = trustedGitExecutable();
    return { node: process.version, nodeSha256: hash(fs.readFileSync(process.execPath)),
        gitExecutable, gitSha256: hash(fs.readFileSync(gitExecutable)),
        git: execFileSync(gitExecutable, ['--version'], { env: gitEnvironment(), encoding: 'utf8' }).trim(),
        typescript: JSON.parse(fs.readFileSync(require.resolve('typescript/package.json', { paths: [root] }))).version,
        typescriptSha256: hash(fs.readFileSync(typescript)) };
}

function attestRuntime(root, selected) {
    const actual = runtimeIdentity(root);
    for (const [name, value] of Object.entries(actual)) {
        assert.equal(value, selected?.[name], 'preregistered runtime differs: ' + name);
    }
    return actual;
}

function attestDrivers(directory, expected, files) {
    return Object.fromEntries(files.map(file => {
        const target = path.join(directory, file);
        assert(fs.lstatSync(target).isFile(), 'qualification driver must be a regular file: ' + file);
        const actual = hash(fs.readFileSync(target));
        assert.equal(actual, expected?.[file], 'qualification driver differs from the preregistration: ' + file);
        return [file, actual];
    }));
}

module.exports = { attestSource, attestRuntime, attestDrivers, runtimeIdentity, pinnedGit, gitEnvironment, trustedGitExecutable };
