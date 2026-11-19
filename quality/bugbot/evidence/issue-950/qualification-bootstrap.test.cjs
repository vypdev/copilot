'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const proof = require('./execution-provenance.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = 'quality/bugbot/evidence/issue-950/';

function fixture(t, crlfCheckout = false, brokerGit = false) {
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
    write(prefix + 'qualification-bootstrap.cjs', fs.readFileSync(path.join(__dirname, 'qualification-bootstrap.cjs')));
    write(prefix + 'normal-flow-shadow/run.cjs', 'const fs=require("node:fs");fs.writeFileSync(process.argv[4],JSON.stringify({cwd:process.cwd(),isolated:__dirname,mode:process.env.BUGBOT_VERIFICATION_MODE}));\n');
    if (brokerGit) {
        for (const file of ['git.cjs', 'hash.cjs']) write('src/infrastructure/bugbot/shadow/' + file,
            fs.readFileSync(path.resolve(__dirname, '../../../../src/infrastructure/bugbot/shadow', file)));
        write(prefix + 'normal-flow-shadow/run.cjs', 'const fs=require("node:fs"),{git}=require("../../../../../src/infrastructure/bugbot/shadow/git.cjs");'
            + 'fs.writeFileSync(process.argv[4],JSON.stringify({head:git(process.argv[2],["rev-parse","HEAD"]).trim()}));\n');
    }
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
    assert.match(run.stderr, /runtime differs: dependencyTreeSha256/u);
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
