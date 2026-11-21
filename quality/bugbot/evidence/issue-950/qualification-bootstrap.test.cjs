'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { test } = require('node:test');
const proof = require('./execution-provenance.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = 'quality/bugbot/evidence/issue-950/';

function fixture(t, crlfCheckout = false, brokerGit = false, cancellation = false, bootstrapBytes) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qualified-bootstrap-control-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const root = path.join(directory, 'project');
    fs.mkdirSync(root);
    const write = (file, bytes) => {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), bytes);
    };
    const env = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };
    const git = (...args) => execFileSync(proof.trustedGitExecutable(), ['-C', root, ...args], { env, encoding: 'utf8' }).trim();
    git('init', '--quiet', '--template=');
    write('.gitignore', 'node_modules/\n');
    write('src/app.ts', 'export const answer = 42;\n');
    write('package.json', '{}\n');
    write('tsconfig.json', '{}\n');
    write('pnpm-lock.yaml', 'lockfileVersion: 9\n');
    write('node_modules/typescript/package.json', JSON.stringify({ name: 'typescript', version: 'fixture', main: 'index.js' }));
    write('node_modules/typescript/index.js', 'module.exports = {};\n');
    const marker = path.join(directory, 'tampered-code-executed'), output = path.join(directory, 'result.json');
    const drivers = ['run.cjs', '../execution-provenance.cjs', '../ev07-shadow/load.cjs',
        '../ev07-shadow/implementation.cjs', '../ev07-shadow/configuration.cjs', '../qualification-bootstrap.cjs'];
    for (const file of drivers) write(path.posix.normalize(prefix + 'normal-flow-shadow/' + file), 'module.exports = {};\n');
    write(prefix + 'execution-provenance.cjs', fs.readFileSync(path.join(__dirname, 'execution-provenance.cjs')));
    write(prefix + 'qualification-bootstrap.cjs', bootstrapBytes ?? fs.readFileSync(path.join(__dirname, 'qualification-bootstrap.cjs')));
    write(prefix + 'normal-flow-shadow/run.cjs', 'exports.run=(lab,number,output)=>{const fs=require("node:fs"),path=require("node:path"),'
        + 'root=path.resolve(__dirname,"../../../../..");fs.writeFileSync(output,JSON.stringify({cwd:process.cwd(),isolated:__dirname,'
        + 'mode:process.env.BUGBOT_VERIFICATION_MODE,admission:require("../execution-provenance.cjs").requireBootstrapAdmission(root),'
        + 'checkoutReceipt:fs.existsSync(path.join(root,".qualification-admission.json"))}));};\n');
    if (brokerGit) {
        for (const file of ['git.cjs', 'hash.cjs']) write('src/infrastructure/bugbot/shadow/' + file,
            fs.readFileSync(path.resolve(__dirname, '../../../../src/infrastructure/bugbot/shadow', file)));
        write(prefix + 'normal-flow-shadow/run.cjs', 'exports.run=(lab,number,output)=>{const fs=require("node:fs"),'
            + '{git}=require("../../../../../src/infrastructure/bugbot/shadow/git.cjs");'
            + 'fs.writeFileSync(output,JSON.stringify({head:git(lab,["rev-parse","HEAD"]).trim()}));};\n');
    }
    if (cancellation) write(prefix + 'normal-flow-shadow/run.cjs',
        'exports.run=(lab,number,output)=>new Promise(resolve=>{'
        + 'const keepAlive=setInterval(()=>{},1000);process.once("SIGTERM",()=>{clearInterval(keepAlive);'
        + 'require("node:fs").writeFileSync(output,"interrupted");resolve(143);});'
        + 'process.stdout.write(JSON.stringify({ready:true,pid:process.pid})+"\\n");});\n');
    if (crlfCheckout) write('.gitattributes', '*.cjs text eol=crlf\n');
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Trusted fixture implementation');
    const implementation = git('rev-parse', 'HEAD');
    const plan = { implementation, publication: 'dry-run', runtime: proof.runtimeIdentity(root),
        drivers: Object.fromEntries(drivers.map(file => [file, hash(fs.readFileSync(path.join(root, prefix, 'normal-flow-shadow', file)))])) };
    const planPath = prefix + 'normal-flow-shadow/fixture-plan.json';
    write(planPath, JSON.stringify(plan));
    git('add', planPath);
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Reviewed synthetic preregistration');
    const revision = git('rev-parse', 'HEAD'), planSha256 = hash(fs.readFileSync(path.join(root, planPath)));
    const bootstrap = path.join(directory, 'reviewed-bootstrap.cjs');
    fs.writeFileSync(bootstrap, execFileSync(proof.trustedGitExecutable(), ['-C', root, 'show', revision + ':' + prefix + 'qualification-bootstrap.cjs'], { env }));
    const bootstrapSha256 = hash(fs.readFileSync(bootstrap));
    const launch = (extra = {}) => spawnSync(process.execPath, [bootstrap, root, revision, planPath,
        planSha256, bootstrapSha256, 'normal-flow', brokerGit ? root : 'relative-lab', '1', output],
    { cwd: directory, env: { ...env, ...extra }, encoding: 'utf8' });
    return { directory, root, marker, output, write, git, plan, planPath, revision, planSha256, launch, bootstrap };
}

test('the reviewed external bootstrap runs immutable drivers in a disposable private source tree', t => {
    const f = fixture(t), run = f.launch();
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(fs.readFileSync(f.output));
    assert.equal(result.cwd, fs.realpathSync(f.directory));
    assert.equal(result.mode, 'disabled');
    assert.equal(result.admission.planCommit, f.revision);
    assert.equal(result.checkoutReceipt, false);
    assert.notEqual(result.isolated, path.join(f.root, prefix, 'normal-flow-shadow'));
    assert.equal(fs.existsSync(result.isolated), false, 'private source is removed after execution');
    assert.equal(fs.existsSync(f.marker), false);
});

for (const driver of ['execution-provenance.cjs', 'normal-flow-shadow/run.cjs']) {
    test('a changed ' + driver + ' cannot execute before immutable admission', t => {
        const f = fixture(t), file = prefix + driver;
        f.write(file, 'require("node:fs").writeFileSync(' + JSON.stringify(f.marker) + ',"executed");\n' + fs.readFileSync(path.join(f.root, file)));
        // Causal counter-control: directly loading that working-tree file runs it.
        const old = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', path.join(f.root, file)], { encoding: 'utf8' });
        assert.equal(fs.existsSync(f.marker), true, old.stderr);
        fs.rmSync(f.marker);
        const run = f.launch();
        assert.notEqual(run.status, 0);
        assert.match(run.stderr, /working driver differs/u);
        assert.equal(fs.existsSync(f.marker), false);
        assert.equal(fs.existsSync(f.output), false);
    });
}

test('an invented matching executable digest in a modified manifest cannot run even its version probe', t => {
    const f = fixture(t), executable = path.join(f.directory, 'untrusted-cli');
    fs.writeFileSync(executable, '#!' + process.execPath + '\nrequire("node:fs").writeFileSync('
        + JSON.stringify(f.marker) + ',"executed");process.stdout.write("fixture-cli");\n', { mode: 0o700 });
    const runtime = { executable, codex: 'fixture-cli', codexSha256: hash(fs.readFileSync(executable)) };
    require('./ev07-shadow/implementation.cjs').requirePinnedCliProbe(runtime);
    assert.equal(fs.existsSync(f.marker), true, 'the former self-declared runtime admits the executable');
    fs.rmSync(f.marker);
    f.write(f.planPath, JSON.stringify({ ...f.plan, runtime }));
    const run = f.launch();
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /working plan differs/u);
    assert.equal(fs.existsSync(f.marker), false);
    assert.equal(fs.existsSync(f.output), false);
});

test('materialized checkout transformations are refused before loading the immutable helper', t => {
    const f = fixture(t, true), run = f.launch();
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /materialized driver differs/u);
    assert.equal(fs.existsSync(f.output), false);
});

test('committed manifest authentication admits exact bytes through the supplied repository path', t => {
    const f = fixture(t), result = proof.attestCommittedArtifact(f.root, path.join(f.root, f.planPath), f.planSha256, f.revision);
    assert.deepEqual(JSON.parse(result.bytes), f.plan);
    assert.equal(result.provenance.commit, f.revision);
    assert.equal(result.provenance.sha256, f.planSha256);
});

for (const mode of ['uncommitted', 'symlink', 'foreign-digest', 'foreign-commit']) {
    test('committed manifest authentication refuses ' + mode + ' input before using runtime data', t => {
        const f = fixture(t), file = path.join(f.root, f.planPath);
        let digest = f.planSha256, revision = f.revision;
        if (mode === 'uncommitted') fs.appendFileSync(file, '\n');
        if (mode === 'symlink') { fs.renameSync(file, file + '.original'); fs.symlinkSync(file + '.original', file); }
        if (mode === 'foreign-digest') digest = 'f'.repeat(64);
        if (mode === 'foreign-commit') revision = f.plan.implementation;
        assert.throws(() => proof.attestCommittedArtifact(f.root, file, digest, revision));
        assert.equal(fs.existsSync(f.marker), false);
    });
}

test('immutable bootstrap ignores Git redirection and PATH Git shims', t => {
    const f = fixture(t), bin = path.join(f.directory, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\ntouch "' + f.marker + '"\nexit 91\n', { mode: 0o700 });
    const run = f.launch({ PATH: bin + path.delimiter + process.env.PATH, GIT_DIR: '/unavailable', GIT_WORK_TREE: '/unavailable',
        GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.worktree', GIT_CONFIG_VALUE_0: '/unavailable' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(fs.existsSync(f.marker), false);
});

test('changed installed dependencies are refused before the immutable entrypoint runs', t => {
    const f = fixture(t);
    f.write('node_modules/typescript/index.js', 'require("node:fs").writeFileSync(' + JSON.stringify(f.marker) + ',"executed");\n');
    const run = f.launch();
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /runtime differs before probes: dependencyTreeSha256/u);
    assert.equal(fs.existsSync(f.marker), false);
    assert.equal(fs.existsSync(f.output), false);
});

test('the actual application Git adapter cannot execute an inherited PATH shim after admission', t => {
    const f = fixture(t, false, true), bin = path.join(f.directory, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'git'), '#!' + process.execPath + '\nconst fs=require("node:fs"),cp=require("node:child_process");'
        + 'fs.writeFileSync(' + JSON.stringify(f.marker) + ',"executed");'
        + 'process.stdout.write(cp.execFileSync(' + JSON.stringify(proof.trustedGitExecutable()) + ',process.argv.slice(2)));\n', { mode: 0o700 });
    const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH };
    const old = spawnSync(process.execPath, ['-e', 'process.stdout.write(require(process.argv[1]).git(process.argv[2],["rev-parse","HEAD"]))',
        path.join(f.root, 'src/infrastructure/bugbot/shadow/git.cjs'), f.root], { env, encoding: 'utf8' });
    assert.equal(old.status, 0, old.stderr);
    assert.equal(fs.existsSync(f.marker), true, 'the old inherited PATH reaches the shim');
    fs.rmSync(f.marker);
    const admitted = f.launch({ PATH: env.PATH });
    assert.equal(admitted.status, 0, admitted.stderr);
    assert.equal(JSON.parse(fs.readFileSync(f.output)).head, f.revision);
    assert.equal(fs.existsSync(f.marker), false, 'the admitted application adapter uses the pinned OS Git');
});

test('a self-consistent checkout receipt is not bootstrap admission', t => {
    const f = fixture(t);
    const fabricated = { bootstrapSha256: hash(fs.readFileSync(f.bootstrap)),
        planCommit: f.revision, planPath: f.planPath, planSha256: f.planSha256 };
    f.write('.qualification-admission.json', JSON.stringify(fabricated));
    const previous = path.join(f.directory, 'previous-verifier.cjs');
    // Preserve the actual historical bytes without depending on an unmerged
    // branch commit remaining fetchable after squash or branch cleanup.
    const legacy = fs.readFileSync(path.join(__dirname,
        '../issue-970/legacy-verifier-01097099.cjs.txt'));
    assert.equal(hash(legacy), 'c0471ff35e10cd39ff75a84e02830f4aa98f6f97bb3b47345e241cb77d3877d8');
    fs.writeFileSync(previous, legacy);
    assert.deepEqual(require(previous).requireBootstrapAdmission(f.root), fabricated,
        'the previous verifier accepts this receipt without any external bootstrap invocation');
    assert.throws(() => proof.requireBootstrapAdmission(f.root), /independently reviewed immutable bootstrap/u);
});

test('a direct runner refuses a forged receipt before importing a checkout verifier', t => {
    const f = fixture(t);
    f.write('.qualification-admission.json', JSON.stringify({ bootstrapSha256: hash(fs.readFileSync(f.bootstrap)),
        planCommit: f.revision, planPath: f.planPath, planSha256: f.planSha256 }));
    f.write(prefix + 'shadow-real-prs/official.json', '{}');
    f.write(prefix + 'shadow-verification/plan.json', '{}');
    f.write(prefix + 'execution-provenance.cjs', 'require("node:fs").writeFileSync('
        + JSON.stringify(f.marker) + ',"imported");\n' + fs.readFileSync(path.join(__dirname, 'execution-provenance.cjs')));
    const runner = path.join(f.root, prefix, 'normal-flow-shadow/run.cjs');
    f.write(prefix + 'normal-flow-shadow/run.cjs', fs.readFileSync(path.join(__dirname, 'normal-flow-shadow/run.cjs')));
    const run = spawnSync(process.execPath, [runner, 'lab', '1', f.output, fs.realpathSync(path.join(f.root, f.planPath))],
        { cwd: f.directory, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.equal(fs.existsSync(f.marker), false);
    assert.match(run.stderr, /independently reviewed immutable bootstrap/u);
    assert.equal(fs.existsSync(f.output), false);
});

test('the removed internal worker entry refuses direct invocation before any admission', t => {
    const f = fixture(t);
    const run = spawnSync(process.execPath, [f.bootstrap, '--admitted-worker'], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /unsupported qualification entrypoint|worker admission.*removed/u);
    assert.equal(fs.existsSync(f.marker), false);
    assert.equal(fs.existsSync(f.output), false);
});

function nestedFixture(t, tamper) {
    const f = fixture(t);
    const names = ['configuration.cjs', 'implementation.cjs', 'load.cjs', 'corpus.cjs', 'review.cjs',
        'full-review.cjs', 'launch-full-review.cjs', 'score-review.py', '../execution-provenance.cjs', '../qualification-bootstrap.cjs'];
    const base = prefix + 'ev07-shadow/';
    for (const name of names.filter(name => !name.startsWith('../'))) f.write(base + name, 'module.exports={};\n');
    const wait = 'const wait=child=>new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",code=>resolve(code??1));});';
    f.write(base + 'launch-full-review.cjs', wait
        + 'exports.requirePassingCorpus=campaign=>{require("node:assert/strict").equal(campaign,'
        + JSON.stringify(f.directory) + ');return campaign;};exports.run=campaign=>wait(require("../execution-provenance.cjs")'
        + '.spawnQualificationDriver("full-review-runner",[campaign]));\n');
    f.write(base + 'full-review.cjs', 'const fs=require("node:fs"),path=require("node:path"),helper=require("../execution-provenance.cjs");'
        + wait + 'exports.run=campaign=>{'
        + (tamper ? 'const file=path.resolve(__dirname,"../execution-provenance.cjs");'
            + 'fs.writeFileSync(file,\'require("node:fs").writeFileSync(\'+JSON.stringify('
            + JSON.stringify(f.marker) + ')+\',"executed");\\n\'+fs.readFileSync(file));' : '')
        + 'return wait(helper.spawnQualificationDriver("review",["fixture-checkout","id","1",'
        + JSON.stringify(f.output) + '],{stdio:"inherit"}));};\n');
    f.write(base + 'review.cjs', 'exports.run=(checkout,id,repetition,output)=>{const fs=require("node:fs"),path=require("node:path"),'
        + 'root=path.resolve(__dirname,"../../../../..");fs.writeFileSync(output,JSON.stringify({admission:'
        + 'require("../execution-provenance.cjs").requireBootstrapAdmission(root),'
        + 'checkoutReceipt:fs.existsSync(path.join(root,".qualification-admission.json"))}));};\n');
    const plan = { implementation: f.plan.implementation, publication: 'dry-run', runtime: proof.runtimeIdentity(f.root),
        inspectedArtifacts: Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(f.root, base, name)))])) };
    const relative = base + 'fixture-plan.json';f.write(relative, JSON.stringify(plan));f.git('add', '.');
    f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Reviewed nested-driver fixture');
    const revision = f.git('rev-parse', 'HEAD');
    const result = spawnSync(process.execPath, [f.bootstrap, f.root, revision, relative,
        hash(fs.readFileSync(path.join(f.root, relative))), hash(fs.readFileSync(f.bootstrap)), 'full-review', f.directory],
    { cwd: f.directory, encoding: 'utf8' });
    return { ...f, result, revision };
}

test('nested qualification processes repeat the complete reviewed external launch', t => {
    const f = nestedFixture(t, false);
    assert.equal(f.result.status, 0, f.result.stderr);
    const result = JSON.parse(fs.readFileSync(f.output));
    assert.equal(result.admission.planCommit, f.revision);
    assert.equal(result.checkoutReceipt, false);
    assert.equal(fs.existsSync(f.marker), false);
});

test('each nested worker rechecks private driver bytes before importing a changed verifier', t => {
    const f = nestedFixture(t, true);
    assert.notEqual(f.result.status, 0);
    assert.match(f.result.stderr, /working driver differs/u);
    assert.equal(fs.existsSync(f.marker), false);
    assert.equal(fs.existsSync(f.output), false);
});

test('explicit cancellation reaches the admitted worker and preserves its interrupted exit', { timeout: 30000 }, async t => {
    // This timeout cleans up an owned synthetic fixture, never a model investigation.
    const f = fixture(t, false, false, true);
    const child = spawn(process.execPath, [f.bootstrap, f.root, f.revision, f.planPath, f.planSha256,
        hash(fs.readFileSync(f.bootstrap)), 'normal-flow', 'relative-lab', '1', f.output],
    { cwd: f.directory, stdio: ['ignore', 'pipe', 'pipe'] });
    let workerPid, stderr = '';
    child.stderr.on('data', bytes => { stderr += bytes; });
    t.after(() => {
        if (child.exitCode === null) {
            child.kill('SIGKILL');
            if (workerPid) try { process.kill(workerPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
    });
    const [bytes] = await Promise.race([once(child.stdout, 'data'), once(child, 'close').then(() => {
        throw new Error('fixture exited before readiness: ' + stderr);
    })]);
    const ready = JSON.parse(bytes.toString());workerPid = ready.pid;assert.equal(ready.ready, true);
    child.kill('SIGTERM');
    const [code, signal] = await once(child, 'close');
    assert.equal(signal, null, stderr);
    assert.equal(code, 143, stderr);
    assert.equal(fs.readFileSync(f.output, 'utf8'), 'interrupted');
});

test('an arbitrary IPC parent cannot initialize qualification admission, unlike the frozen previous worker', { timeout: 30000 }, async t => {
    // An owned model-free process cleanup, never an investigation deadline.
    const previous = fs.readFileSync(path.join(__dirname, '../issue-970/legacy-bootstrap-f583e40c.cjs.txt'));
    assert.equal(hash(previous), 'e809d86426f33ac20bae21cf463253fcbf8f489aff4888c532e82afa40d2f609');
    for (const legacy of [true, false]) {
        const f = fixture(t, false, false, false, legacy ? previous : undefined);
        const child = require('node:child_process').fork(f.bootstrap, ['--admitted-worker'],
            { cwd: f.directory, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        let stderr = ''; child.stderr.on('data', bytes => { stderr += bytes; });
        t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
        child.send({ root: f.root, proof: { planCommit: f.revision, planPath: f.planPath,
            planSha256: f.planSha256, bootstrapSha256: hash(fs.readFileSync(f.bootstrap)) },
            mode: 'normal-flow', args: ['relative-lab', '1', f.output] });
        const [code] = await once(child, 'close');
        if (legacy) {
            assert.equal(code, 0, stderr);
            const result = JSON.parse(fs.readFileSync(f.output));
            assert.equal(result.admission.planCommit, f.revision,
                'the real previous worker accepts the arbitrary IPC parent without the public launch path');
        } else {
            assert.notEqual(code, 0, 'arbitrary IPC parent initialized bootstrap context: ' + stderr);
            assert.match(stderr, /private image worker unavailable/u);
            assert.equal(fs.existsSync(f.output), false);
        }
        assert.equal(fs.existsSync(f.marker), false);
    }
});
