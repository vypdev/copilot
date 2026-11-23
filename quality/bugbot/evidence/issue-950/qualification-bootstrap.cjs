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
const { execFileSync, spawn } = require('node:child_process');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = 'quality/bugbot/evidence/issue-950/';
const ev07 = ['configuration.cjs', 'implementation.cjs', 'load.cjs', 'corpus.cjs', 'review.cjs',
    'full-review.cjs', 'launch-full-review.cjs', 'score-review.py', '../execution-provenance.cjs', '../qualification-bootstrap.cjs'];
const normal = ['run.cjs', '../execution-provenance.cjs', '../ev07-shadow/load.cjs',
    '../ev07-shadow/implementation.cjs', '../ev07-shadow/configuration.cjs', '../qualification-bootstrap.cjs'];
const entries = Object.freeze({ corpus: 'ev07-shadow/corpus.cjs',
    'full-review': 'ev07-shadow/launch-full-review.cjs', 'normal-flow': 'normal-flow-shadow/run.cjs',
    'full-review-runner': 'ev07-shadow/full-review.cjs', review: 'ev07-shadow/review.cjs',
    'native-control': '../issue974/containment-native-fixture.cjs',
    'runtime-admission': '../issue974/sdk-runtime-admission.cjs' });

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

function admitCliBytes(runtime) {
    assert(runtime && typeof runtime.codex === 'string', 'closed worker CLI runtime required');
    for (const [fileKey, hashKey, required] of [['executable', 'executableSha256', true],
        ['launcher', 'launcherSha256', false], ['nativeExecutable', 'nativeExecutableSha256', false]]) {
        const file = runtime[fileKey], digest = runtime[hashKey] ?? (fileKey === 'executable' ? runtime.codexSha256 : undefined);
        if (!required && file === undefined && digest === undefined) continue;
        assert(typeof file === 'string' && path.isAbsolute(file), 'closed CLI path missing: ' + fileKey);
        assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'CLI artifact must be a physical regular file');
        assert.match(digest ?? '', /^[a-f0-9]{64}$/u);
        assert.equal(sha256(fs.readFileSync(file)), digest, 'worker CLI bytes differ before imports/probes: ' + fileKey);
    }
    if (runtime.launcher || /\.[cm]?js$/u.test(runtime.executable)) {
        assert(runtime.nativeExecutable && runtime.nativeExecutableSha256, 'Node CLI launcher requires pinned native CLI bytes');
    }
    assert.equal(sha256(fs.readFileSync(process.execPath)), runtime.nodeSha256, 'CLI interpreter differs before imports/probes');
}

/** Admit only the immutable image's reviewed policy file, not its enforcement. */
function admitManagedFilesystemRequirements(trust, implementation) {
    const relative = 'quality/bugbot/evidence/issue974/qualification-requirements.toml';
    const policy = '/etc/codex/requirements.toml';
    const expected = committed(trust.git, implementation, relative);
    for (const directory of ['/etc', '/etc/codex']) {
        const stat = fs.lstatSync(directory, { bigint: true });
        assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0n && (stat.mode & 0o022n) === 0n,
            'managed requirements parent must be a protected root-owned directory');
        assert.equal(fs.realpathSync(directory), directory, 'managed requirements parent cannot traverse links');
    }
    assert.equal(fs.realpathSync(policy), policy, 'managed requirements must be a canonical file');
    assert(Number.isInteger(fs.constants.O_NOFOLLOW) && fs.constants.O_NOFOLLOW > 0,
        'managed requirements admission needs physical-file open support');
    const fd = fs.openSync(policy, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const before = fs.fstatSync(fd, { bigint: true });
        assert(before.isFile() && before.uid === 0n && (before.mode & 0o7777n) === 0o444n,
            'managed requirements must be a root-owned0444 regular file');
        assert.equal(before.size, BigInt(expected.length), 'managed requirements size differs from committed source');
        const bytes = Buffer.alloc(expected.length + 1);
        let length = 0;
        while (length < bytes.length) {
            const count = fs.readSync(fd, bytes, length, bytes.length - length, length);
            assert(Number.isInteger(count) && count >= 0 && count <= bytes.length - length, 'invalid managed requirements read');
            if (count === 0) break;
            length += count;
        }
        assert(length === expected.length && bytes.subarray(0, length).equals(expected),
            'managed requirements bytes differ from committed source');
        const after = fs.fstatSync(fd, { bigint: true }), current = fs.lstatSync(policy, { bigint: true });
        for (const key of ['dev', 'ino', 'size', 'uid', 'gid', 'mode', 'mtimeNs', 'ctimeNs']) {
            assert.equal(after[key], before[key], 'managed requirements changed during admission');
            assert.equal(current[key], after[key], 'managed requirements path changed during admission');
        }
        assert.equal(fs.realpathSync(policy), policy, 'managed requirements path cannot become a link');
        return { path: policy, bytes: expected.length, sha256: sha256(expected), ownerUid: 0, mode: '0444',
            enforcementObserved: false };
    } finally { fs.closeSync(fd); }
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
    assert(mode === 'native-control' ? plan.purpose === 'native-control' && plan.containment
        : plan.purpose !== 'native-control', 'native controls cannot authorize measurement');
    assert(mode === 'runtime-admission' ? plan.purpose === 'runtime-admission' && plan.containment
        : plan.purpose !== 'runtime-admission', 'runtime admission cannot authorize measurement');
    assert(plan.schemaVersion !== 2 || mode !== 'normal-flow', 'v2 qualification has no normal-flow admission route');
    assert.equal(plan.publication, 'dry-run', 'qualification must remain dry-run');
    assert.match(plan.implementation ?? '', /^[a-f0-9]{40}$/u);
    git('merge-base', '--is-ancestor', plan.implementation, revision);
    const base = prefix + (mode === 'normal-flow' ? 'normal-flow-shadow/' : 'ev07-shadow/');
    const inventory = mode === 'normal-flow' ? normal : plan.schemaVersion === 2 ? [...ev07,
        '../../issue974/corpus-selection.cjs', '../../issue974/attempt-ledger.cjs', ...(plan.containment
            ? ['operation-containment.cjs', 'qualification-seccomp.cjs', 'qualification-supervisor.cjs', 'qualification-runtime.Dockerfile', 'qualification-requirements.toml', 'containment-native-fixture.cjs', 'sdk-runtime-admission.cjs']
                .map(name => '../../issue974/' + name) : [])] : ev07;
    const expected = mode === 'normal-flow' ? plan.drivers : plan.inspectedArtifacts;
    const admitted = [];
    for (const driver of inventory) {
        const relative = path.posix.normalize(base + driver), trusted = committed(git, revision, relative);
        assert.equal(sha256(trusted), expected?.[driver], 'committed driver differs from reviewed plan: ' + driver);
        assert(fs.readFileSync(physical(root, relative)).equals(trusted), 'working driver differs: ' + driver);
        admitted.push([relative, trusted]);
    }
    if (plan.containment) {
        // This helper is core-only and every byte was admitted above. Reject
        // malformed closed profiles before application imports/version probes.
        const profile = require(path.join(root, prefix, '../issue974/operation-containment.cjs')).requireProfile(plan.containment);
        if (!process.channel) assert.equal(sha256(fs.readFileSync(process.execPath)), profile.hostNodeSha256,
            'host launcher differs before imports/probes');
        assert.equal(profile.supervisorSha256, sha256(committed(git, revision,
            path.posix.normalize(prefix + '../issue974/qualification-supervisor.cjs'))), 'reviewed supervisor differs');
    }
    if (mode === 'runtime-admission') require(path.join(root, prefix,
        '../issue974/sdk-runtime-admission.cjs')).requireAdmissionPlan(plan);
    return { root, trust, bytes, plan, admitted };
}

function spawnReviewedLaunch(request, env, options = {}) {
    assert(Object.keys(options).every(key => key === 'stdio'), 'unsupported qualification child options');
    assert.equal(sha256(fs.readFileSync(__filename)), request.proof.bootstrapSha256, 'executing bootstrap changed');
    const { proof, root, mode, args, corpusCampaign } = request;
    // No IPC admission endpoint: every process enters the complete public
    // validation/materialization path with the same independently supplied pins.
    const modeArgs = mode === 'review' ? [corpusCampaign, ...args] : args;
    return spawn(process.execPath, [__filename, root, proof.planCommit, proof.planPath,
        proof.planSha256, proof.bootstrapSha256, mode, ...modeArgs],
    { env, stdio: options.stdio ?? 'inherit', cwd: process.cwd() });
}

async function executePrivate(request) {
    assert(request && Array.isArray(request.args) && request.args.every(arg => typeof arg === 'string'),
        'invalid admitted invocation');
    const { root: repository, proof, mode } = request;
    const { root, plan } = reviewedPlan(repository, proof.planCommit, proof.planPath,
        proof.planSha256, proof.bootstrapSha256, mode);
    // This function is reachable only from launch after private materialization.
    // There is no message handler or exported API that initializes admission.
    // Repeat private bytes before imports; a checkout receipt has no authority.
    const verifier = require(path.join(root, prefix, 'execution-provenance.cjs'));
    verifier.attestSource(root, plan.implementation);
    verifier.attestRuntime(root, plan.containment && !request.operation ? plan.hostRuntime : plan.runtime);
    verifier.initializeBootstrapContext(root, proof, (nextMode, args, options) => {
        assert(mode === 'full-review' && nextMode === 'full-review-runner'
            || mode === 'full-review-runner' && nextMode === 'review', 'unadmitted qualification child route');
        assert(!plan.containment || nextMode !== 'review', 'contained review slots use private complete-inventory dispatch');
        const corpusCampaign = mode === 'full-review' ? request.args[0] : request.corpusCampaign;
        return spawnReviewedLaunch({ root, proof, mode: nextMode, args, corpusCampaign }, process.env, options);
    }, request.operation, request.corpusCampaign);
    if (mode === 'review') {
        assert(typeof request.corpusCampaign === 'string', 'paired review requires its passing corpus');
        require(path.join(root, prefix, entries['full-review'])).requirePassingCorpus(request.corpusCampaign);
    }
    const driver = require(path.join(root, prefix, entries[mode]));
    assert.equal(typeof driver.run, 'function', 'admitted driver entry is unavailable');
    if (!request.operation) return driver.run(...request.args);
    assert(request.scopePort && request.scopePort.signal === request.operation.signal, 'private live scope missing');
    require(path.join(root, prefix, 'ev07-shadow/load.cjs'));
    verifier.admitQualificationModules(root);
    const { withQualificationOperationScope } = require(path.join(root, 'src/infrastructure/agents/qualification_operation_scope'));
    return withQualificationOperationScope(request.scopePort, () => driver.run(...request.args));
}

async function launch(repository, revision, planPath, planSha256, bootstrapSha256, mode, ...args) {
    assert(Object.hasOwn(entries, mode), 'unsupported qualification entrypoint; worker admission endpoint removed');
    assert(mode === 'normal-flow' ? args.length === 3
        : mode === 'full-review' || mode === 'full-review-runner' ? args.length === 1
        : mode === 'review' ? args.length === 5 : ['native-control', 'runtime-admission'].includes(mode) ? args.length === 1
        : args.length === 1 || args.length === 2 && args[1] === '--preflight', 'invalid qualification arguments');
    const { root, trust, bytes, plan, admitted } = reviewedPlan(repository, revision,
        planPath, planSha256, bootstrapSha256, mode);
    assert(!plan.containment || mode !== 'review', 'contained review slots are not a public case-selection route');
    assert(!fs.realpathSync(__filename).startsWith(root + path.sep), 'materialize the reviewed bootstrap outside the checkout');
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bugbot-qualified-source-')));
    fs.chmodSync(scratch, 0o700);
    const isolated = path.join(scratch, 'source');
    let verifier, succeeded = false;
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
        verifier = require(path.join(isolated, prefix, 'execution-provenance.cjs'));
        verifier.attestSource(root, plan.implementation);
        verifier.attestRuntime(root, plan.containment ? plan.hostRuntime : plan.runtime);
        assert(!fs.existsSync(path.join(isolated, 'node_modules')), 'tracked dependency installation refused');
        fs.cpSync(path.join(root, 'node_modules'), path.join(isolated, 'node_modules'),
            { recursive: true, verbatimSymlinks: true, dereference: false, mode: fs.constants.COPYFILE_FICLONE });
        verifier.attestSource(isolated, plan.implementation);
        verifier.attestRuntime(isolated, plan.containment ? plan.hostRuntime : plan.runtime);
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
        const corpusCampaign = mode === 'review' || mode === 'full-review-runner' ? args[0] : undefined;
        const childArgs = mode === 'normal-flow' ? [...args, path.join(isolated, planPath)]
            : mode === 'review' ? args.slice(1) : args;
        const previousEnvironment = process.env;
        process.env = env;
        try {
            // Import and run in this verified bootstrap process, never through
            // an internal CLI/IPC message that can bypass public admission.
            const result = await executePrivate({ root: isolated, proof, mode, args: childArgs, corpusCampaign });
            succeeded = result !== 1 && result !== 130 && result?.status !== 'failed' && result?.status !== 'interrupted';
            return result;
        } finally { process.env = previousEnvironment; }

    } finally {
        if (!plan.containment || succeeded && verifier?.bootstrapCleanupAllowed(isolated)) fs.rmSync(scratch, { recursive: true, force: true });
        // A contained failure/unknown scope retains the authenticated source.
        // A process close or failed metadata read cannot authorize cleanup.
    }
}

function privateMessage() {
    return new Promise((resolve, reject) => {
        const disconnected = () => { process.removeListener('message', received); reject(new Error('Private owner disconnected.')); };
        const received = value => { process.removeListener('disconnect', disconnected); resolve(value); };
        process.once('message', received); process.once('disconnect', disconnected);
    });
}

function privateFile(relative) {
    const file = physical('/qualification-input', relative), stat = fs.statSync(file);
    assert(stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'private worker input ownership differs');
    return file;
}

function operationSlot(plan, mode, identity, slot, root) {
    assert(slot && typeof slot === 'object' && !Array.isArray(slot), 'closed operation slot required');
    if (mode === 'runtime-admission') {
        assert.equal(plan.purpose, 'runtime-admission'); assert.equal(identity.purpose, 'runtime-admission');
        assert.deepEqual(Object.keys(slot), []); assert.equal(identity.operationId, 'runtime:admission');
        return ['/qualification-output/runtime-admission'];
    }
    if (mode === 'corpus') {
        assert.equal(identity.purpose, 'corpus-case');
        assert.equal(Object.keys(slot).length, 2);
        assert(Number.isSafeInteger(slot.index) && slot.index >= 0 && slot.index < plan.corpus.cases);
        const corpusBytes = fs.readFileSync(physical(root, safePath(plan.corpus.path)));
        assert.equal(sha256(corpusBytes), plan.corpus.sha256);
        assert.equal(JSON.parse(corpusBytes).cases[slot.index]?.id, slot.caseId);
        assert.equal(identity.operationId, 'corpus:' + slot.caseId);
        return ['/qualification-output/corpus-v3'];
    }
    if (mode === 'review') {
        assert.equal(identity.purpose, 'paired-review');
        assert.equal(Object.keys(slot).length, 2);
        assert(plan.repositoryCohort.order.includes(slot.subjectId) && [1, 2, 3].includes(slot.repetition));
        assert.equal(identity.operationId, 'review:' + slot.subjectId + ':r' + slot.repetition);
        return ['/qualification-input/campaign/fixtures/full-review/' + slot.subjectId, slot.subjectId,
            String(slot.repetition), '/qualification-output/review.jsonl'];
    }
    assert.equal(mode, 'native-control'); assert.equal(identity.purpose, 'native-control');
    assert.equal(Object.keys(slot).length, 1);
    assert.deepEqual(plan.nativeControl?.cases, ['ev974-C32', 'ev974-C33', 'ev974-C34', 'ev974-C35']);
    assert(plan.nativeControl.cases.includes(slot.caseId));
    assert.equal(identity.operationId, 'control:' + slot.caseId);
    return ['/qualification-output/native'];
}

/** Not exported and not a public CLI mode. Only the immutable image's PID1
 * may fork this exact external bootstrap over a private inherited IPC fd. */
function createContainedWorkerScratch() {
    // Each complete operation has its own fresh PID namespace and /tmp tmpfs.
    // Literal deny_read roots mask directories; Codex's glob scan returns files only.
    assert.equal(os.tmpdir(), '/tmp', 'fixed contained tmpfs required');
    assert.equal(fs.realpathSync('/tmp'), '/tmp', 'canonical contained tmpfs required');
    const scratch = '/tmp/bugbot-contained-worker';
    fs.mkdirSync(scratch, { mode: 0o700 }); // Exclusive: never adopt an existing path.
    return scratch;
}

async function launchContainedWorker() {
    assert(process.channel && process.connected && process.argv.length === 2, 'private image worker unavailable');
    assert.equal(process.platform, 'linux'); assert.equal(process.ppid, 1);
    assert.equal(process.getuid(), 0); assert.equal(process.execPath, '/usr/local/bin/node');
    assert.equal(fs.realpathSync(__filename), '/qualification-bootstrap.cjs');
    const owner = await privateMessage();
    assert(owner && Object.keys(owner).length === 3 && owner.kind === 'scope-owner');
    for (const key of ['workerUid', 'workerGid']) assert(Number.isSafeInteger(owner[key]) && owner[key] > 0);
    assert.deepEqual(fs.readFileSync('/proc/1/cmdline', 'utf8').split('\0').filter(Boolean),
        ['/usr/local/bin/node', '/qualification-supervisor.cjs', String(owner.workerUid), String(owner.workerGid)]);
    process.setgroups([]); process.setgid(owner.workerGid); process.setuid(owner.workerUid);
    assert.equal(process.getuid(), owner.workerUid); assert.equal(process.geteuid(), owner.workerUid);
    assert.equal(process.getgid(), owner.workerGid); assert(process.getgroups().every(group => group === owner.workerGid));
    process.once('disconnect', () => process.exit(143));
    for (const directory of ['/qualification-input', '/qualification-output']) {
        const stat = fs.lstatSync(directory);
        assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === owner.workerUid && (stat.mode & 0o077) === 0);
    }
    assert.equal(fs.statSync('/sdk').uid, owner.workerUid, 'immutable SDK must belong to its reviewed unprivileged worker');
    assert.equal(fs.statSync('/sdk/.git').uid, owner.workerUid, 'immutable SDK Git owner differs');
    const input = JSON.parse(fs.readFileSync(privateFile('invocation.json'), 'utf8'));
    const fields = ['schemaVersion', 'identity', 'scopeId', 'proof', 'mode', 'slot', 'bundleSha256', 'preflight'];
    assert(input && Object.keys(input).length === fields.length && fields.every(key => Object.hasOwn(input, key)) && input.schemaVersion === 1);
    assert(['corpus', 'review', 'native-control', 'runtime-admission'].includes(input.mode));
    assert(typeof input.preflight === 'boolean' && (input.mode === 'corpus' || input.preflight === false));
    assert.match(input.scopeId, /^[a-f0-9]{64}$/u); assert.match(input.bundleSha256, /^[a-f0-9]{64}$/u);
    const proof = input.proof;
    assert(proof && Object.keys(proof).length === 4);
    assert.match(proof.planCommit, /^[a-f0-9]{40}$/u); safePath(proof.planPath);
    assert.match(proof.planSha256, /^[a-f0-9]{64}$/u); assert.equal(sha256(fs.readFileSync(__filename)), proof.bootstrapSha256);
    const bundle = privateFile('plan.bundle'); assert.equal(sha256(fs.readFileSync(bundle)), input.bundleSha256);
    const scratch = createContainedWorkerScratch();
    const root = path.join(scratch, 'source'), imageTrust = gitFor('/sdk');
    execFileSync(imageTrust.executable, ['-c', 'core.hooksPath=' + os.devNull, 'clone', '--quiet', '--shared',
        '--no-checkout', '--template=', '/sdk', root], { env: imageTrust.env });
    const staged = gitFor(root);
    staged.git('remote', 'remove', 'origin');
    staged.git('fetch', '--quiet', '--no-tags', '--no-write-fetch-head', bundle, proof.planCommit);
    staged.git('checkout', '--quiet', '--detach', proof.planCommit);
    const { plan } = reviewedPlan(root, proof.planCommit, proof.planPath, proof.planSha256, proof.bootstrapSha256, input.mode);
    admitCliBytes(plan.runtime);
    const managedRequirements = admitManagedFilesystemRequirements(imageTrust, plan.implementation);
    assert(plan.containment, 'contained worker profile missing');
    assert.equal(plan.containment.workerUid, owner.workerUid); assert.equal(plan.containment.workerGid, owner.workerGid);
    assert.equal(sha256(fs.readFileSync('/qualification-supervisor.cjs')), plan.containment.supervisorSha256);
    assert.equal(input.identity.planSha256, proof.planSha256); assert.equal(input.identity.implementation, plan.implementation);
    assert.equal(input.identity.imageSha256, plan.containment.image.slice(7));
    const args = operationSlot(plan, input.mode, input.identity, input.slot, root);
    if (input.preflight) args.push('--preflight');
    const verifier = require(path.join(root, prefix, 'execution-provenance.cjs'));
    verifier.attestSource('/sdk', plan.implementation); verifier.attestSource(root, plan.implementation);
    verifier.attestRuntime('/sdk', plan.runtime);
    assert(!fs.existsSync(path.join(root, 'node_modules')));
    fs.cpSync('/sdk/node_modules', path.join(root, 'node_modules'),
        { recursive: true, verbatimSymlinks: true, dereference: false, mode: fs.constants.COPYFILE_FICLONE });
    verifier.attestRuntime(root, plan.runtime);
    fs.writeFileSync('/qualification-output/managed-requirements.json', JSON.stringify({
        sourceImplementation: plan.implementation, ...managedRequirements,
    }) + '\n', { flag: 'wx', mode: 0o600 });
    process.env.COPILOT_EV07_PLAN = path.join(root, proof.planPath);
    process.env.COPILOT_QUALIFICATION_MANIFEST_SHA256 = proof.planSha256;
    process.env.COPILOT_QUALIFICATION_PLAN_COMMIT = proof.planCommit;
    process.env.BUGBOT_VERIFICATION_MODE = 'disabled';
    require(path.join(root, prefix, 'ev07-shadow/load.cjs'));
    const credentialPolicy = require(path.join(root, 'src/data/repository/agent_credential_policy'));
    const credentials = JSON.parse(fs.readFileSync(privateFile('private-credentials.json'), 'utf8'));
    assert(credentials && Object.keys(credentials).length === 3 && credentials.environment && typeof credentials.environment === 'object');
    assert(Object.keys(credentials).every(key => ['environment', 'codexAuth', 'evidenceToken'].includes(key)));
    assert(Object.entries(credentials.environment).every(([key, value]) =>
        credentialPolicy.allowedCredentialVariables('codex', 'openai').includes(key) && typeof value === 'string'));
    assert(credentials.codexAuth === null || typeof credentials.codexAuth === 'string');
    assert(credentials.evidenceToken === null || typeof credentials.evidenceToken === 'string');
    if (input.mode === 'native-control') assert(Object.keys(credentials.environment).length === 0 && credentials.codexAuth === null && credentials.evidenceToken === null,
        'native fixture purpose cannot receive model or GitHub credentials');
    const home = path.join(scratch, 'home'); fs.mkdirSync(home, { mode: 0o700 });
    process.env.HOME = home; process.env.CODEX_HOME = path.join(home, '.codex');
    fs.mkdirSync(process.env.CODEX_HOME, { mode: 0o700 });
    if (credentials.codexAuth !== null) fs.writeFileSync(path.join(process.env.CODEX_HOME, 'auth.json'), credentials.codexAuth, { flag: 'wx', mode: 0o600 });
    Object.assign(process.env, credentials.environment);
    if (credentials.evidenceToken !== null) process.env.COPILOT_EVIDENCE_TOKEN = credentials.evidenceToken;
    const cancel = new AbortController(), identity = Object.freeze({ ...input.identity });
    const operation = Object.freeze({ identity, scopeId: input.scopeId, slot: Object.freeze({ ...input.slot }), preflight: input.preflight,
        signal: cancel.signal, abort: () => cancel.abort() });
    const correlation = sha256(JSON.stringify({ identity, scopeId: input.scopeId, proof }));
    const accepted = privateMessage(); process.send({ kind: 'scope-ready', correlation });
    assert.deepEqual(await accepted, { kind: 'scope-ready-accepted', correlation });
    process.once('SIGINT', operation.abort); process.once('SIGTERM', operation.abort);
    const scopePort = Object.freeze({ identity, scopeId: input.scopeId, signal: cancel.signal,
        // Only the outer owner can observe stopped PID1. This worker is killed
        // by namespace teardown and can never manufacture that confirmation.
        stopped: new Promise(() => undefined), requestStop(reason) {
            process.send({ kind: reason === 'completed' ? 'scope-complete' : 'scope-stop', correlation, reason });
        } });
    // The same admitted execution function used by the public bootstrap. No
    // exported worker endpoint, alternate detector or serialized live grant.
    return executePrivate({ root, proof, mode: input.mode, args, operation, scopePort,
        corpusCampaign: input.mode === 'review' ? '/qualification-input/campaign' : undefined });
}

module.exports = { launch };
if (require.main === module) {
    (process.channel ? launchContainedWorker() : launch(...process.argv.slice(2))).then(code => {
        process.exitCode = Number.isInteger(code) ? code : code?.status === 'interrupted' ? 130 : code?.status === 'failed' ? 1 : 0;
    }).catch(error => {
        // Keep an early private worker failure after UID drop, including source
        // or CLI admission errors, before the stopped container is removed.
        // This file is diagnostic evidence, never an admission/stop receipt.
        if (process.channel && process.platform === 'linux' && process.ppid === 1 && process.getuid() > 0
            && __filename === '/qualification-bootstrap.cjs') {
            try {
                const directory = '/qualification-output', stat = fs.lstatSync(directory);
                if (stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0) {
                    const fd = fs.openSync(path.join(directory, 'worker-failure.json'), 'wx', 0o600);
                    try { fs.writeFileSync(fd, JSON.stringify({ event: 'worker-failure', diagnostic: error.stack ?? error.message }) + '\n'); fs.fsyncSync(fd); }
                    finally { fs.closeSync(fd); }
                }
            } catch { /* Retain existing prefixes; diagnostics cannot grant success. */ }
        }
        console.error(error.message); process.exitCode = 1;
    });
}
