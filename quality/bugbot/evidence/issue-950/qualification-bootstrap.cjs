'use strict';

// Trust begins OUTSIDE the checkout: materialize this file from an independently
// reviewed Git revision, compare its reviewed SHA-256, then start trusted Node
// with NODE_OPTIONS/NODE_PATH unset. See issue-970/README.md. This file uses only
// Node core until the immutable verifier and every driver have been admitted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, fork } = require('node:child_process');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = 'quality/bugbot/evidence/issue-950/';
const ev07 = ['configuration.cjs', 'implementation.cjs', 'load.cjs', 'corpus.cjs', 'review.cjs',
    'full-review.cjs', 'launch-full-review.cjs', 'score-review.py', '../execution-provenance.cjs', '../qualification-bootstrap.cjs'];
const normal = ['run.cjs', '../execution-provenance.cjs', '../ev07-shadow/load.cjs',
    '../ev07-shadow/implementation.cjs', '../ev07-shadow/configuration.cjs', '../qualification-bootstrap.cjs'];
const entries = Object.freeze({ corpus: 'ev07-shadow/corpus.cjs',
    'full-review': 'ev07-shadow/launch-full-review.cjs', 'normal-flow': 'normal-flow-shadow/run.cjs',
    'full-review-runner': 'ev07-shadow/full-review.cjs', review: 'ev07-shadow/review.cjs' });

function safePath(value) {
    assert(typeof value === 'string' && value.length && !path.isAbsolute(value)
        && !value.includes('\\') && !value.split('/').some(part => ['', '.', '..', '.git'].includes(part)),
    'unsafe committed artifact path');
    return value;
}

function physical(root, relative) {
    let file = root;
    for (const part of safePath(relative).split('/')) {
        file = path.join(file, part);
        assert(!fs.lstatSync(file).isSymbolicLink(), 'qualification artifact symlink refused');
    }
    assert(fs.lstatSync(file).isFile(), 'qualification artifact must be a regular file');
    return file;
}

function gitFor(root) {
    const file = process.platform === 'darwin' ? execFileSync('/usr/bin/xcrun', ['--find', 'git'],
        { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' }).trim()
        : process.platform === 'linux' ? '/usr/bin/git' : undefined;
    assert(file && path.isAbsolute(file), 'trusted Git requires Linux or macOS');
    const executable = fs.realpathSync(file), marker = path.join(root, '.git');
    assert(!fs.lstatSync(marker).isSymbolicLink(), 'Git identity symlink refused');
    let directory = marker;
    if (fs.lstatSync(marker).isFile()) {
        const match = /^gitdir: (.+)\r?\n?$/u.exec(fs.readFileSync(marker, 'utf8'));
        assert(match, 'invalid worktree Git identity');
        directory = path.resolve(root, match[1]);
    }
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
    Object.assign(env, { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1' });
    const git = (...args) => execFileSync(executable, ['--no-pager', '--no-replace-objects', '--literal-pathspecs',
        '--git-dir=' + directory, '--work-tree=' + root, '-C', root,
        '-c', 'core.hooksPath=' + os.devNull, '-c', 'core.fsmonitor=false', ...args],
    { env, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
    return { git, executable, env, directory };
}

function committed(git, revision, relative) {
    safePath(relative);
    const rows = git('ls-tree', '-z', revision, '--', relative).toString('utf8').split('\0').filter(Boolean);
    assert.equal(rows.length, 1, 'committed artifact unavailable');
    const [header, name] = rows[0].split('\t'), [mode, type, blob] = header.split(' ');
    assert(['100644', '100755'].includes(mode) && type === 'blob' && name === relative,
        'committed artifact must be a regular blob');
    return git('cat-file', 'blob', blob);
}

function reviewedPlan(repository, revision, planPath, planSha256, bootstrapSha256, mode) {
    assert(!process.env.NODE_OPTIONS && !process.env.NODE_PATH && process.execArgv.length === 0,
        'bootstrap requires trusted Node without preloads or loader overrides');
    assert.match(revision ?? '', /^[a-f0-9]{40}$/u, 'reviewed plan commit required');
    assert.match(planSha256 ?? '', /^[a-f0-9]{64}$/u, 'independently reviewed plan digest required');
    assert.match(bootstrapSha256 ?? '', /^[a-f0-9]{64}$/u, 'independently reviewed bootstrap digest required');
    assert.equal(sha256(fs.readFileSync(__filename)), bootstrapSha256, 'reviewed bootstrap differs');
    assert(Object.hasOwn(entries, mode), 'unsupported qualification entrypoint');
    const root = fs.realpathSync(repository), trust = gitFor(root), { git } = trust;
    assert.equal(git('rev-parse', '--verify', revision + '^{commit}').toString('utf8').trim(), revision);
    assert.equal(sha256(committed(git, revision, prefix + 'qualification-bootstrap.cjs')), bootstrapSha256,
        'plan revision does not contain the independently reviewed bootstrap');
    const bytes = committed(git, revision, planPath);
    assert.equal(sha256(bytes), planSha256, 'reviewed committed plan differs');
    assert(fs.readFileSync(physical(root, planPath)).equals(bytes), 'working plan differs from reviewed commit');
    const plan = JSON.parse(bytes);
    assert.equal(plan.publication, 'dry-run', 'qualification must remain dry-run');
    assert.match(plan.implementation ?? '', /^[a-f0-9]{40}$/u);
    git('merge-base', '--is-ancestor', plan.implementation, revision);
    const base = prefix + (mode === 'normal-flow' ? 'normal-flow-shadow/' : 'ev07-shadow/');
    const inventory = mode === 'normal-flow' ? normal : ev07;
    const expected = mode === 'normal-flow' ? plan.drivers : plan.inspectedArtifacts;
    const admitted = [];
    for (const driver of inventory) {
        const relative = path.posix.normalize(base + driver), trusted = committed(git, revision, relative);
        assert.equal(sha256(trusted), expected?.[driver], 'committed driver differs from reviewed plan: ' + driver);
        assert(fs.readFileSync(physical(root, relative)).equals(trusted), 'working driver differs: ' + driver);
        admitted.push([relative, trusted]);
    }
    return { root, trust, bytes, plan, admitted };
}

function spawnAdmitted(request, env, options = {}) {
    assert(Object.keys(options).every(key => key === 'stdio'), 'unsupported qualification child options');
    assert.equal(sha256(fs.readFileSync(__filename)), request.proof.bootstrapSha256, 'executing bootstrap changed');
    const io = options.stdio ?? 'inherit';
    const stdio = Array.isArray(io) ? [...io, 'ipc'] : [io, io, io, 'ipc'];
    const child = fork(__filename, ['--admitted-worker'], { env, stdio, execArgv: [], cwd: process.cwd() });
    child.send(request, error => { if (error) child.emit('error', error); });
    return child;
}

async function executeAdmitted(request) {
    assert(request && Array.isArray(request.args) && request.args.every(arg => typeof arg === 'string'),
        'invalid admitted invocation');
    const { root: repository, proof, mode } = request;
    const { root, plan } = reviewedPlan(repository, proof.planCommit, proof.planPath,
        proof.planSha256, proof.bootstrapSha256, mode);
    // The executing file is still the externally materialized bootstrap. Repeat
    // private-byte/source/runtime checks before loading any private driver in
    // each child. No receipt in this checkout is read as execution authority.
    const verifier = require(path.join(root, prefix, 'execution-provenance.cjs'));
    verifier.attestSource(root, plan.implementation);
    verifier.attestRuntime(root, plan.runtime);
    verifier.initializeBootstrapContext(root, proof, (nextMode, args, options) => {
        assert(mode === 'full-review' && nextMode === 'full-review-runner'
            || mode === 'full-review-runner' && nextMode === 'review', 'unadmitted qualification child route');
        const corpusCampaign = mode === 'full-review' ? request.args[0] : request.corpusCampaign;
        return spawnAdmitted({ root, proof, mode: nextMode, args, corpusCampaign }, process.env, options);
    });
    if (mode === 'review') {
        assert(typeof request.corpusCampaign === 'string', 'paired review requires its passing corpus');
        require(path.join(root, prefix, entries['full-review'])).requirePassingCorpus(request.corpusCampaign);
    }
    const driver = require(path.join(root, prefix, entries[mode]));
    assert.equal(typeof driver.run, 'function', 'admitted driver entry is unavailable');
    return driver.run(...request.args);
}

async function launch(repository, revision, planPath, planSha256, bootstrapSha256, mode, ...args) {
    assert(['corpus', 'full-review', 'normal-flow'].includes(mode), 'unsupported public qualification entrypoint');
    assert(mode === 'normal-flow' ? args.length === 3 : mode === 'full-review' ? args.length === 1
        : args.length === 1 || args.length === 2 && args[1] === '--preflight', 'invalid qualification arguments');
    const { root, trust, bytes, plan, admitted } = reviewedPlan(repository, revision,
        planPath, planSha256, bootstrapSha256, mode);
    assert(!fs.realpathSync(__filename).startsWith(root + path.sep), 'materialize the reviewed bootstrap outside the checkout');
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bugbot-qualified-source-')));
    fs.chmodSync(scratch, 0o700);
    const isolated = path.join(scratch, 'source');
    try {
        // A fresh local clone does not copy source repository hooks/configuration.
        execFileSync(trust.executable, ['-c', 'core.hooksPath=' + os.devNull, 'clone', '--quiet', '--shared',
            '--no-checkout', '--template=', trust.directory, isolated], { env: trust.env });
        const isolatedGit = gitFor(isolated).git;
        isolatedGit('checkout', '--quiet', '--detach', revision);
        isolatedGit('remote', 'remove', 'origin');
        // Git attributes can transform checkout bytes even without external
        // filters. Recheck the materialized closure before requiring its helper.
        for (const [relative, trusted] of admitted) assert(
            fs.readFileSync(physical(isolated, relative)).equals(trusted), 'materialized driver differs: ' + relative);
        assert(fs.readFileSync(physical(isolated, planPath)).equals(bytes), 'materialized plan differs');
        // The helper is now the immutable blob already checked above, not a
        // working-tree verifier asked to authenticate itself after execution.
        const verifier = require(path.join(isolated, prefix, 'execution-provenance.cjs'));
        verifier.attestSource(root, plan.implementation);
        verifier.attestRuntime(root, plan.runtime);
        assert(!fs.existsSync(path.join(isolated, 'node_modules')), 'tracked dependency installation refused');
        fs.cpSync(path.join(root, 'node_modules'), path.join(isolated, 'node_modules'),
            { recursive: true, verbatimSymlinks: true, dereference: false, mode: fs.constants.COPYFILE_FICLONE });
        verifier.attestSource(isolated, plan.implementation);
        verifier.attestRuntime(isolated, plan.runtime);
        const proof = { bootstrapSha256, planCommit: revision, planPath, planSha256 };
        // The application evidence adapter also invokes the bare Git command.
        // Bind that lookup to the admitted OS executable without changing how
        // Node/Codex or any other normal detector executable is selected.
        const gitBin = path.join(scratch, 'git-bin');
        fs.mkdirSync(gitBin, { mode: 0o700 });
        fs.symlinkSync(trust.executable, path.join(gitBin, 'git'));
        const env = { ...trust.env, COPILOT_EV07_PLAN: path.join(isolated, planPath),
            PATH: gitBin + path.delimiter + (trust.env.PATH ?? '/usr/bin:/bin'),
            BUGBOT_VERIFICATION_MODE: 'disabled',
            COPILOT_QUALIFICATION_MANIFEST_SHA256: planSha256,
            COPILOT_QUALIFICATION_PLAN_COMMIT: revision };
        delete env.NODE_OPTIONS;
        delete env.NODE_PATH;
        // Old diagnostic plans may select an auxiliary executable from the
        // environment. A future reviewed plan must bind it before any probe.
        if (plan.workflowInputs) {
            assert(path.isAbsolute(plan.runtime.pythonExecutable ?? ''), 'pinned auxiliary Python required');
            assert.equal(sha256(fs.readFileSync(plan.runtime.pythonExecutable)), plan.runtime.pythonSha256,
                'auxiliary Python differs from reviewed runtime');
            env.PILOT_LOCAL_PYTHON = plan.runtime.pythonExecutable;
        }
        const childArgs = mode === 'normal-flow' ? [...args, path.join(isolated, planPath)] : args;
        const child = spawnAdmitted({ root: isolated, proof, mode, args: childArgs }, env);
        const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM');
        process.once('SIGINT', interrupt);
        process.once('SIGTERM', terminate);
        try {
            return await new Promise((resolve, reject) => {
                child.once('error', reject);
                child.once('close', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)));
            });
        } finally {
            process.removeListener('SIGINT', interrupt);
            process.removeListener('SIGTERM', terminate);
        }
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

module.exports = { launch };
if (require.main === module) {
    const fail = error => { console.error(error.message); process.exitCode = 1; };
    if (process.argv[2] === '--admitted-worker') {
        if (!process.send || !process.connected) fail(new Error('admitted worker requires the external bootstrap IPC channel'));
        else process.once('message', request => {
            process.disconnect();
            executeAdmitted(request).then(code => {
                process.exitCode = Number.isInteger(code) ? code : code?.status === 'interrupted' ? 130 : 0;
            }).catch(fail);
        });
    } else launch(...process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(fail);
}
