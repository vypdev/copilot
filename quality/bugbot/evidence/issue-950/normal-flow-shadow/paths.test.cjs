'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { authenticatedFixture } = require('./authenticated-fixture.cjs');
const { attestSource, attestRuntime, attestDrivers, runtimeIdentity, dependencyIdentity, trustedGitExecutable } = require('../execution-provenance.cjs');

function sourceFixture(t) {
    const directory = mkdtempSync(path.join(tmpdir(), 'bugbot-source-proof-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const root = path.join(directory, 'actual'), clean = path.join(directory, 'clean');
    mkdirSync(path.join(root, 'src'), { recursive: true });
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).trim();
    git('init', '--quiet', '--template=');
    writeFileSync(path.join(root, 'src/app.ts'), 'export const value = 1;\n');
    writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    writeFileSync(path.join(root, 'tsconfig.json'), '{}\n');
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Pinned fixture');
    const pin = git('rev-parse', 'HEAD');
    execFileSync('git', ['clone', '--quiet', '--template=', root, clean]);
    return { directory, root, clean, pin, git, file: path.join(root, 'src/app.ts') };
}

test('clean admission records the actual tree, source inventory and lockfile bytes', t => {
    const f = sourceFixture(t), proof = attestSource(f.root, f.pin);
    assert.equal(proof.implementation, f.pin);
    assert.equal(proof.tree, f.git('rev-parse', f.pin + '^{tree}'));
    assert.equal(proof.dependencyLockSha256, createHash('sha256').update(readFileSync(path.join(f.root, 'pnpm-lock.yaml'))).digest('hex'));
    assert.match(proof.sourceSha256, /^[a-f0-9]{64}$/u);
});

for (const mode of ['dirty', 'staged', 'untracked', 'ignored', 'lockfile', 'compiler', 'assume-unchanged', 'symlink']) {
    test('physical source admission refuses ' + mode + ' bytes', t => {
        const f = sourceFixture(t);
        if (mode === 'staged') {
            writeFileSync(f.file, 'staged'); f.git('add', 'src'); writeFileSync(f.file, 'export const value = 1;\n');
        } else if (mode === 'untracked' || mode === 'ignored') {
            if (mode === 'ignored') { mkdirSync(path.join(f.root, '.git/info')); writeFileSync(path.join(f.root, '.git/info/exclude'), '*.js\n'); }
            writeFileSync(path.join(f.root, 'src/app.js'), 'untracked runtime shadow');
        } else if (mode === 'symlink') {
            rmSync(f.file); require('node:fs').symlinkSync(path.join(f.clean, 'src/app.ts'), f.file);
        } else {
            if (mode === 'assume-unchanged') f.git('update-index', '--assume-unchanged', 'src/app.ts');
            const file = mode === 'lockfile' ? 'pnpm-lock.yaml' : mode === 'compiler' ? 'tsconfig.json' : 'src/app.ts';
            writeFileSync(path.join(f.root, file), 'changed bytes');
        }
        assert.throws(() => attestSource(f.root, f.pin), /does not match|untracked|symlink/u);
    });
}

for (const mode of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT', 'local-core-worktree']) {
    test('sanitized admission defeats redirection through ' + mode, t => {
        const f = sourceFixture(t);
        const env = { ...process.env };
        writeFileSync(f.file, 'dirty actual source');
        if (mode === 'GIT_DIR') env.GIT_DIR = path.join(f.clean, '.git');
        if (mode === 'GIT_WORK_TREE') env.GIT_WORK_TREE = f.clean;
        if (mode === 'GIT_INDEX_FILE') {
            writeFileSync(f.file, 'staged dirty source'); f.git('add', 'src'); writeFileSync(f.file, 'export const value = 1;\n');
            env.GIT_INDEX_FILE = path.join(f.clean, '.git/index');
        }
        if (mode === 'GIT_CONFIG_COUNT') Object.assign(env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.worktree', GIT_CONFIG_VALUE_0: f.clean });
        if (mode === 'local-core-worktree') f.git('config', 'core.worktree', f.clean);
        const child = spawnSync(process.execPath, ['-e',
            'require(process.argv[1]).attestSource(process.argv[2],process.argv[3])',
            path.resolve(__dirname, '../execution-provenance.cjs'), f.root, f.pin], { env, encoding: 'utf8' });
        assert.notEqual(child.status, 0);
        assert.match(child.stderr, /does not match/u);
    });
}

test('local fsmonitor configuration cannot execute during source admission', t => {
    const f = sourceFixture(t), marker = path.join(f.directory, 'hook-ran'), hook = path.join(f.directory, 'monitor');
    writeFileSync(hook, '#!/bin/sh\ntouch "' + marker + '"\n', { mode: 0o700 });
    f.git('config', 'core.fsmonitor', hook);
    assert.equal(attestSource(f.root, f.pin).implementation, f.pin);
    assert.equal(existsSync(marker), false);
});

test('a missing committed source pin cannot admit work', t => {
    const f = sourceFixture(t);
    assert.throws(() => attestSource(f.root, 'f'.repeat(40)));
});

test('driver proof records actual bytes and rejects a modified driver', t => {
    const f = sourceFixture(t), file = path.join(f.directory, 'driver.cjs');
    writeFileSync(file, 'original');
    const expected = { 'driver.cjs': createHash('sha256').update(readFileSync(file)).digest('hex') };
    assert.deepEqual(attestDrivers(f.directory, expected, ['driver.cjs']), expected);
    writeFileSync(file, 'changed');
    assert.throws(() => attestDrivers(f.directory, expected, ['driver.cjs']), /driver differs/u);
});

test('runtime proof binds Node and TypeScript versions and actual executable bytes', () => {
    const root = path.resolve(__dirname, '../../../../..'), runtime = runtimeIdentity(root);
    assert.deepEqual(attestRuntime(root, runtime), runtime);
    assert.throws(() => attestRuntime(root, { ...runtime, nodeSha256: 'f'.repeat(64) }), /runtime differs/u);
    assert.throws(() => attestRuntime(root, { ...runtime, typescriptSha256: 'f'.repeat(64) }), /runtime differs/u);
    assert.throws(() => attestRuntime(root, { ...runtime, gitSha256: 'f'.repeat(64) }), /runtime differs/u);
});

test('clean admission never executes an inherited PATH Git shim', t => {
    const f = sourceFixture(t), bin = path.join(f.directory, 'bin'), marker = path.join(f.directory, 'shim-ran');
    mkdirSync(bin);
    writeFileSync(path.join(bin, 'git'), '#!' + process.execPath + '\nrequire("node:fs").writeFileSync('
        + JSON.stringify(marker) + ', "unexpected");process.exit(91);\n', { mode: 0o700 });
    const child = spawnSync(process.execPath, ['-e',
        'require(process.argv[1]).attestSource(process.argv[2],process.argv[3])',
        path.resolve(__dirname, '../execution-provenance.cjs'), f.root, f.pin], {
        encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(existsSync(marker), false);
});

test('a Git shim can forge the old proof but cannot admit changed physical source now', t => {
    const f = sourceFixture(t), bin = path.join(f.directory, 'bin'), marker = path.join(f.directory, 'shim-ran');
    mkdirSync(bin);
    writeFileSync(f.file, 'export const value = 2;\n'); f.git('add', 'src');
    f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'different source');
    const alternate = f.git('rev-parse', 'HEAD');
    const shim = `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process');
fs.appendFileSync(${JSON.stringify(marker)},'called\\n');
let args=process.argv.slice(2);
if(args.includes('diff'))process.exit(0);
if(args.includes('ls-tree'))args=args.map(x=>x===${JSON.stringify(f.pin)}?${JSON.stringify(alternate)}:x);
if(args.includes('rev-parse'))args=args.map(x=>x===${JSON.stringify(f.pin + '^{tree}')}?${JSON.stringify(alternate + '^{tree}')}:x);
const child=cp.spawnSync(${JSON.stringify(trustedGitExecutable())},args,{input:fs.readFileSync(0)});
if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);process.exit(child.status??1);
`;
    writeFileSync(path.join(bin, 'git'), shim, { mode: 0o700 });
    const current = path.resolve(__dirname, '../execution-provenance.cjs'), legacy = path.join(f.directory, 'bare-git.cjs');
    const source = readFileSync(current, 'utf8');
    assert(source.includes('const executable = trustedGitExecutable();'));
    // Counter-control: change only the original PATH-resolution choice.
    writeFileSync(legacy, source.replace('const executable = trustedGitExecutable();', "const executable = 'git';"));
    const launch = file => spawnSync(process.execPath, ['-e',
        'process.stdout.write(JSON.stringify(require(process.argv[1]).attestSource(process.argv[2],process.argv[3])))',
        file, f.root, f.pin], { encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } });
    const bypass = launch(legacy);
    assert.equal(bypass.status, 0, bypass.stderr);
    assert.equal(JSON.parse(bypass.stdout).implementation, f.pin);
    assert.equal(JSON.parse(bypass.stdout).tree, f.git('rev-parse', alternate + '^{tree}'));
    assert.equal(existsSync(marker), true);
    rmSync(marker);
    const refused = launch(current);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /does not match/u);
    assert.equal(existsSync(marker), false);
});

for (const runner of ['normal-flow-shadow/run.cjs', 'ev07-shadow/corpus.cjs', 'ev07-shadow/review.cjs']) {
    test('the real ' + runner + ' refuses a foreign pin before application imports or model work', t => {
        const directory = mkdtempSync(path.join(tmpdir(), 'bugbot-before-import-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const marker = path.join(directory, 'application-imported'), preload = path.join(directory, 'preload.cjs');
        const plan = path.join(directory, 'plan.json');
        writeFileSync(plan, JSON.stringify({ implementation: 'f'.repeat(40) }));
        writeFileSync(preload, `const Module=require('node:module'),fs=require('node:fs'),load=Module._load;
Module._load=function(name,...args){if(name.includes('/src/')||name.endsWith('/typescript')||name==='@actions/github'){
fs.writeFileSync(process.env.IMPORT_MARKER,name);throw Error('unexpected application import');}return load.call(this,name,...args);};`);
        const child = spawnSync(process.execPath, ['--require', preload, path.resolve(__dirname, '..', runner),
            directory, '1', path.join(directory, 'result.jsonl'), plan], { encoding: 'utf8',
            env: { ...process.env, COPILOT_EV07_PLAN: plan, IMPORT_MARKER: marker } });
        assert.notEqual(child.status, 0);
        assert.equal(existsSync(marker), false, child.stderr);
        assert.equal(existsSync(path.join(directory, 'result.jsonl')), false);
        assert.match(child.stderr, /rev-parse|commit|pin|immutable bootstrap/u);
    });
}

function dependencyFixture(t) {
    const directory = mkdtempSync(path.join(tmpdir(), 'qualification-dependency-proof-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const modules = path.join(directory, 'node_modules');
    mkdirSync(path.join(modules, 'typescript'), { recursive: true });
    writeFileSync(path.join(modules, 'typescript/package.json'), JSON.stringify({ name: 'typescript', version: 'fixture', main: 'index.js' }));
    writeFileSync(path.join(modules, 'typescript/index.js'), 'module.exports = {};\n');
    mkdirSync(path.join(modules, '@actions/github'), { recursive: true });
    const file = path.join(modules, '@actions/github/index.js');
    writeFileSync(file, 'module.exports = {};\n');
    return { directory, modules, file };
}

test('dependency admission binds actual files and refuses additions, loader shadows and escaping symlinks', t => {
    const f = dependencyFixture(t), original = dependencyIdentity(f.directory);
    assert.match(original.dependencyTreeSha256, /^[a-f0-9]{64}$/u);
    writeFileSync(path.join(f.modules, 'extra.js'), 'unadmitted');
    assert.notEqual(dependencyIdentity(f.directory).dependencyTreeSha256, original.dependencyTreeSha256);
    symlinkSync('platform-optional.js', path.join(f.modules, 'optional'));
    const missingOptional = dependencyIdentity(f.directory);
    writeFileSync(path.join(f.modules, 'platform-optional.js'), 'materialized');
    assert.notEqual(dependencyIdentity(f.directory).dependencyTreeSha256, missingOptional.dependencyTreeSha256);
    symlinkSync(f.directory, path.join(f.modules, 'outside'));
    assert.throws(() => dependencyIdentity(f.directory), /symlink escapes/u);
    rmSync(path.join(f.modules, 'outside'));
    mkdirSync(path.join(f.directory, 'quality/node_modules'), { recursive: true });
    assert.throws(() => dependencyIdentity(f.directory), /dependency shadow/u);
});

test('a synthetic omitted dependency proof admits changed bytes while the current proof refuses before import', t => {
    const f = dependencyFixture(t), runtime = runtimeIdentity(f.directory), marker = path.join(f.directory, 'dependency-executed');
    writeFileSync(f.file, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "executed");\n');
    const helper = path.resolve(__dirname, '../execution-provenance.cjs'), old = path.join(f.directory, 'old-proof.cjs');
    // Build this omission control from fixed historical bytes, not the current
    // implementation's formatting. This mutated helper is a synthetic negative
    // control, not a claim that the frozen helper omitted dependency identity.
    const source = readFileSync(path.resolve(__dirname, '../../issue-970/legacy-verifier-01097099.cjs.txt'), 'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), 'c0471ff35e10cd39ff75a84e02830f4aa98f6f97bb3b47345e241cb77d3877d8');
    assert(source.includes('return { ...dependencies, node:'));
    writeFileSync(old, source.replace('return { ...dependencies, node:', 'return { node:'));
    const run = file => spawnSync(process.execPath, ['-e',
        'require(process.argv[1]).attestRuntime(process.argv[2],JSON.parse(process.argv[3]));require(process.argv[2]+"/node_modules/@actions/github")',
        file, f.directory, JSON.stringify(runtime)], { encoding: 'utf8' });
    const bypass = run(old);
    assert.equal(bypass.status, 0, bypass.stderr);
    assert.equal(existsSync(marker), true);
    rmSync(marker);
    const refused = run(helper);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /runtime differs before probes: dependencyTreeSha256/u);
    assert.equal(existsSync(marker), false);
});

for (const mode of ['require', 'import']) {
    test('the normal workspace portal is inventoried but cannot execute through ' + mode, t => {
        const f = dependencyFixture(t), portal = path.join(f.modules, '.pnpm/node_modules/@vypdev');
        mkdirSync(portal, { recursive: true });
        mkdirSync(path.join(f.directory, 'extension'));
        const marker = path.join(f.directory, 'portal-executed'), external = path.join(f.directory, 'extension/index.cjs');
        writeFileSync(external, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "executed");\n');
        symlinkSync('../../../../extension', path.join(portal, 'copilot-browser-extension'));
        assert.match(dependencyIdentity(f.directory).dependencyTreeSha256, /^[a-f0-9]{64}$/u);
        const program = 'require(process.argv[1]).admitQualificationModules(process.argv[2]);'
            + (mode === 'require' ? 'require(process.argv[3]);' : 'import(require("node:url").pathToFileURL(process.argv[3])).catch(e=>{console.error(e);process.exitCode=1;});');
        const child = spawnSync(process.execPath, ['-e', program, path.resolve(__dirname, '../execution-provenance.cjs'), f.directory, external], { encoding: 'utf8' });
        assert.notEqual(child.status, 0);
        assert.match(child.stderr, /outside the admitted qualification closure/u);
        assert.equal(existsSync(marker), false);
    });
}

test('the actual runner resolves a relative lab before entering its private checkout, without model calls', t => {
    const directory = mkdtempSync(path.join(tmpdir(), 'bugbot-relative-lab-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const source = path.join(directory, 'lab', 'project.git');
    mkdirSync(source, { recursive: true });
    const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet', '--template=');
    writeFileSync(path.join(source, 'index.ts'), 'export const answer = 42;\n');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixed source');
    const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
    const manifest = { publication: 'dry-run', effort: 'xhigh', subjects: [{ repository: 'owner/project', number: 1, baseRef: 'master', headRef: 'review', head, base: head,
            tree, baseTree: tree, model: 'gpt-6-luna' }] };
    const fixture = authenticatedFixture(t, manifest);
    const run = fixture.launch('lab', 1, 'result.jsonl', directory);
    assert.equal(run.status, 0, run.stderr);
    const rows = readFileSync(path.join(directory, 'result.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const result = rows.find(row => row.event === 'workflow-result');
    assert.deepEqual(result.writes, []);
    assert.equal(result.checkoutUnchanged, true);
    assert.equal(result.peakVerifierConcurrency, 0);
    assert.equal(rows.filter(row => row.event === 'detector-start').length, 0);
    assert.equal(existsSync(fixture.forbidden), false);
});
