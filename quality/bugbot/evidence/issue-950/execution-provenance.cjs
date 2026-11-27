'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { devNull, release } = require('node:os');
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

/** Git data transport only: no loader, scope or model admission is granted.
 * The immutable image already has implementation; carry only later plan data. */
function materializePlanBundle(root, implementation, planCommit, destination) {
    assert.match(implementation ?? '', /^[a-f0-9]{40}$/u);
    assert.match(planCommit ?? '', /^[a-f0-9]{40}$/u);
    assert.notEqual(implementation, planCommit, 'the plan must follow implementation');
    assert(typeof destination === 'string' && path.isAbsolute(destination) && path.resolve(destination) === destination);
    const parent = path.dirname(destination), stat = fs.lstatSync(parent);
    assert(fs.realpathSync(parent) === parent && stat.isDirectory() && !stat.isSymbolicLink()
        && stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'private owned bundle staging required');
    let occupied = false;
    try { fs.lstatSync(destination); occupied = true; } catch (error) { assert.equal(error.code, 'ENOENT'); }
    assert(!occupied, 'bundle destination already exists');
    const git = pinnedGit(root);
    assert.equal(git('rev-parse', '--verify', 'HEAD').toString('utf8').trim(), planCommit, 'reviewed plan HEAD changed');
    git('merge-base', '--is-ancestor', implementation, planCommit);
    // A raw SHA alone advertises no ref and Git refuses an empty bundle.
    // HEAD is accepted only after exact identity validation, never as a mutable
    // substitute for the independently reviewed commit. Exclude image objects.
    git('bundle', 'create', destination, 'HEAD', '^' + implementation);
    fs.chmodSync(destination, 0o600);
    assert.equal(git('bundle', 'list-heads', destination).toString('utf8').trim(), planCommit + ' HEAD');
    return hash(fs.readFileSync(destination));
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

function dependencyIdentity(root) {
    root = fs.realpathSync(root);
    const directory = path.join(root, 'node_modules');
    assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(),
        'qualification dependencies must have a physical installation');
    const rows = [];
    function visit(relative) {
        const file = path.join(directory, relative), stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) {
            const link = fs.readlinkSync(file), lexical = path.relative(directory, path.resolve(path.dirname(file), link));
            if (relative === path.join('.pnpm', 'node_modules', '@vypdev', 'copilot-browser-extension')
                && fs.realpathSync(file) === path.join(root, 'extension')) {
                // Normal pnpm workspaces expose this unused portal. Its code is
                // outside admission and the entrypoint loader fence forbids it.
                rows.push([relative, 'unadmitted-workspace', link, 'extension']);
                return;
            }
            assert(lexical && !path.isAbsolute(lexical) && !lexical.split(path.sep).includes('..'),
                'dependency symlink escapes the admitted installation');
            let target;
            try { target = path.relative(directory, fs.realpathSync(file)); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            assert(target === undefined || target && !path.isAbsolute(target) && !target.split(path.sep).includes('..'),
                'dependency symlink escapes the admitted installation');
            // pnpm can retain links to platform-excluded optional packages.
            // Bind the missing target as well; materializing it changes this proof.
            rows.push([relative, 'link', link, target ?? 'missing:' + lexical]);
        } else if (stat.isDirectory()) {
            for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
        } else {
            assert(stat.isFile(), 'dependency must be a regular file or internal symlink');
            rows.push([relative, 'file', stat.mode & 0o777, hash(fs.readFileSync(file))]);
        }
    }
    visit('');
    // These ancestors could otherwise shadow the admitted root dependencies.
    for (const relative of ['quality', 'quality/bugbot', 'quality/bugbot/evidence',
        'quality/bugbot/evidence/issue-950', 'quality/bugbot/evidence/issue-950/ev07-shadow',
        'quality/bugbot/evidence/issue-950/normal-flow-shadow', 'quality/bugbot/evidence/issue974']) {
        assert(!fs.existsSync(path.join(root, relative, 'node_modules')), 'unadmitted qualification dependency shadow');
    }
    assert(!process.env.NODE_PATH && !process.env.NODE_OPTIONS, 'qualification requires a clean Node loader environment');
    assert(!process.execArgv.some(arg => /^(?:--require|--import|--loader|--experimental-loader)(?:=|$)|^-r/u.test(arg)),
        'qualification Node preload is not admitted');
    return { dependencyTreeSha256: hash(JSON.stringify(rows)), dependencyEntries: rows.length };
}

function admitQualificationModules(root) {
    root = fs.realpathSync(root);
    const { registerHooks } = require('node:module'), { fileURLToPath } = require('node:url');
    assert.equal(typeof registerHooks, 'function', 'qualification requires synchronous Node module hooks');
    const admitted = ['src', 'node_modules', 'quality/bugbot/evidence/issue-950']
        .map(relative => path.join(root, relative) + path.sep);
    const exactFiles = new Set();
    // New evaluator helpers are outside the historical directory. Only the
    // authenticated public bootstrap's committed v2 plan can admit these two
    // exact files; neither an environment switch nor a directory-wide grant can.
    const proof = bootstrapAdmission(root);
    if (proof) {
        const bytes = fs.readFileSync(path.join(root, proof.planPath));
        assert.equal(hash(bytes), proof.planSha256, 'admitted qualification plan changed');
        const selected = JSON.parse(bytes);
        if (selected.schemaVersion === 2) {
            for (const name of ['corpus-selection.cjs', 'attempt-ledger.cjs', ...(selected.containment
                ? ['operation-containment.cjs', 'qualification-seccomp.cjs', 'qualification-supervisor.cjs', 'qualification-runtime.Dockerfile', 'qualification-requirements.toml', 'containment-native-fixture.cjs', 'sdk-runtime-admission.cjs'] : [])]) {
                const file = path.join(root, 'quality/bugbot/evidence/issue974', name);
                const expected = selected.inspectedArtifacts?.['../../issue974/' + name];
                assert.match(expected ?? '', /^[a-f0-9]{64}$/u, 'v2 helper is absent from the reviewed closure');
                assert.equal(hash(fs.readFileSync(file)), expected, 'v2 helper differs from the reviewed closure');
                exactFiles.add(file);
            }
        }
    }
    return registerHooks({ resolve(specifier, context, nextResolve) {
        const result = nextResolve(specifier, context);
        if (!result.url.startsWith('node:')) {
            assert(result.url.startsWith('file:'), 'qualification module must have a physical admitted path');
            const file = fs.realpathSync(fileURLToPath(result.url));
            assert(admitted.some(prefix => file.startsWith(prefix)) || exactFiles.has(file),
                'module is outside the admitted qualification closure');
        }
        return result;
    } });
}

function runtimeIdentity(root, expected) {
    const dependencies = dependencyIdentity(root);
    if (expected) for (const [name, value] of Object.entries(dependencies)) {
        assert.equal(value, expected[name], 'preregistered runtime differs before probes: ' + name);
    }
    const typescript = require.resolve('typescript', { paths: [root] });
    assert(fs.realpathSync(typescript).startsWith(fs.realpathSync(path.join(root, 'node_modules')) + path.sep),
        'compiler is outside the admitted dependency tree');
    const gitExecutable = trustedGitExecutable();
    const actual = { ...dependencies, os: process.platform, arch: process.arch, kernel: release(),
        node: process.version, nodeSha256: hash(fs.readFileSync(process.execPath)),
        gitExecutable, gitSha256: hash(fs.readFileSync(gitExecutable)),
        typescript: JSON.parse(fs.readFileSync(require.resolve('typescript/package.json', { paths: [root] }))).version,
        typescriptSha256: hash(fs.readFileSync(typescript)) };
    if (expected) for (const [name, value] of Object.entries(actual)) {
        assert.equal(value, expected[name], 'preregistered runtime differs before probes: ' + name);
    }
    return { ...actual, git: execFileSync(gitExecutable, ['--version'], { env: gitEnvironment(), encoding: 'utf8' }).trim() };
}

function attestRuntime(root, selected) {
    assert(selected && typeof selected === 'object', 'preregistered runtime required before probes');
    const actual = runtimeIdentity(root, selected);
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

function attestCommittedArtifact(root, file, expectedSha256, commit) {
    assert.match(expectedSha256 ?? '', /^[a-f0-9]{64}$/u, 'reviewed committed artifact digest required');
    assert.match(commit ?? '', /^[a-f0-9]{40}$/u, 'reviewed artifact commit required');
    const requestedRoot = path.resolve(root);
    root = fs.realpathSync(root);
    const requestedFile = path.resolve(file);
    const canonicalFile = requestedFile.startsWith(requestedRoot + path.sep)
        ? root + requestedFile.slice(requestedRoot.length) : requestedFile;
    const relative = path.relative(root, canonicalFile).split(path.sep).join('/');
    assert(relative && !path.isAbsolute(relative) && !relative.split('/').some(part => ['', '..', '.git'].includes(part)),
        'committed artifact must be inside the reviewed repository');
    let current = root;
    for (const part of relative.split('/')) {
        current = path.join(current, part);
        assert(!fs.lstatSync(current).isSymbolicLink(), 'committed artifact symlink refused');
    }
    assert(fs.lstatSync(current).isFile(), 'committed artifact must be regular');
    const git = pinnedGit(root), rows = git('ls-tree', '-z', commit, '--', relative).toString('utf8').split('\0').filter(Boolean);
    assert.equal(rows.length, 1, 'reviewed committed artifact unavailable');
    const [header, name] = rows[0].split('\t'), [mode, type, blob] = header.split(' ');
    assert(['100644', '100755'].includes(mode) && type === 'blob' && name === relative,
        'reviewed committed artifact must be a regular blob');
    const bytes = fs.readFileSync(current);
    assert.equal(hash(bytes), expectedSha256, 'reviewed committed artifact digest differs');
    assert(git('cat-file', 'blob', blob).equals(bytes), 'reviewed committed artifact bytes differ');
    return { bytes, provenance: { commit, path: relative, blob, sha256: expectedSha256 } };
}

// Process-local transport installed only after the external bootstrap admits
// this immutable module. A checkout file is never execution authority. This
// context is not an independent attestation of the host or of human review.
let bootstrapContext;
function initializeBootstrapContext(root, proof, spawnDriver, operation, campaign) {
    assert(!bootstrapContext, 'bootstrap context is already installed');
    root = fs.realpathSync(root);
    const main = fs.realpathSync(require.main.filename);
    assert(!main.startsWith(root + path.sep), 'bootstrap must execute outside the admitted checkout');
    assert.equal(hash(fs.readFileSync(main)), proof.bootstrapSha256, 'executing bootstrap identity differs');
    assert.equal(hash(fs.readFileSync(path.join(root, 'quality/bugbot/evidence/issue-950/qualification-bootstrap.cjs'))),
        proof.bootstrapSha256, 'admitted bootstrap identity differs');
    assert.equal(typeof spawnDriver, 'function');
    if (operation) {
        assert(operation.signal instanceof AbortSignal && typeof operation.abort === 'function', 'live private operation required');
        assert.match(operation.scopeId, /^[a-f0-9]{64}$/u);
        assert(operation.identity && Object.isFrozen(operation.identity), 'immutable operation correlation required');
    }
    assert(campaign === undefined || typeof campaign === 'string', 'invalid admitted corpus campaign');
    bootstrapContext = Object.freeze({ root, proof: Object.freeze({ ...proof }), spawnDriver, scopes: new Map(), campaign,
        ...(operation && { operation: Object.freeze({ ...operation }) }) });
}
function bootstrapAdmission(root) {
    return bootstrapContext?.root === fs.realpathSync(root) ? bootstrapContext.proof : undefined;
}
function requireBootstrapAdmission(root) {
    const proof = bootstrapAdmission(root);
    assert(proof, 'qualification requires the independently reviewed immutable bootstrap');
    return proof;
}
function bootstrapOperation(root) {
    return bootstrapContext?.root === fs.realpathSync(root) ? bootstrapContext.operation : undefined;
}
function bootstrapCampaign(root) {
    requireBootstrapAdmission(root);
    return bootstrapContext.campaign;
}
function selectedQualificationRuntime(root, plan) {
    return plan.containment && !bootstrapOperation(root) ? plan.hostRuntime : plan.runtime;
}
function retainBootstrapScope(root, identity, scopeId) {
    requireBootstrapAdmission(root);
    const key = identity.ownerId + ':' + identity.operationId;
    const previous = bootstrapContext.scopes.get(key);
    assert(!previous || previous === scopeId, 'owned scope correlation changed');
    bootstrapContext.scopes.set(key, scopeId ?? null);
}
function confirmBootstrapScopeStopped(root, identity, scopeId) {
    requireBootstrapAdmission(root);
    const key = identity.ownerId + ':' + identity.operationId;
    assert.equal(bootstrapContext.scopes.get(key), scopeId, 'owned scope stop correlation differs');
    bootstrapContext.scopes.delete(key);
}
function bootstrapCleanupAllowed(root) {
    return bootstrapAdmission(root) !== undefined && bootstrapContext.scopes.size === 0;
}
function spawnQualificationDriver(mode, args, options) {
    assert(bootstrapContext, 'qualification requires the independently reviewed immutable bootstrap');
    return bootstrapContext.spawnDriver(mode, args, options);
}

module.exports = { attestSource, attestRuntime, attestDrivers, runtimeIdentity, dependencyIdentity, admitQualificationModules,
    pinnedGit, materializePlanBundle, gitEnvironment, trustedGitExecutable, attestCommittedArtifact, requireBootstrapAdmission,
    bootstrapAdmission, initializeBootstrapContext, spawnQualificationDriver, bootstrapOperation, selectedQualificationRuntime,
    retainBootstrapScope, confirmBootstrapScopeStopped, bootstrapCleanupAllowed, bootstrapCampaign };
