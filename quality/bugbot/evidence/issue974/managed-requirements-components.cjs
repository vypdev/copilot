'use strict';
// Real Git and temporary file bytes, with explicitly modeled Linux root
// metadata. These controls do not execute a CLI/image/model or prove denial.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os');
const path = require('node:path'), vm = require('node:vm'), Module = require('node:module');
const { execFileSync, spawnSync } = require('node:child_process'), { createHash } = require('node:crypto');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../../../..');
const file = path.join(root, 'quality/bugbot/evidence/issue-950/qualification-bootstrap.cjs');
const requireSource = Module.createRequire(file), source = fs.readFileSync(file, 'utf8');
const relative = 'quality/bugbot/evidence/issue974/qualification-requirements.toml';
const fixed = '/etc/codex/requirements.toml', digest = b => createHash('sha256').update(b).digest('hex');
const posixTest = process.platform === 'win32' ? test.skip : test;
const fixtureEnvironment = () => ({ ...Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1' });

function fixture(t, options = {}) {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-managed-policy-')));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const expected = fs.readFileSync(path.join(root, relative));
    const committedFile = path.join(directory, relative);
    fs.mkdirSync(path.dirname(committedFile), { recursive: true }); fs.writeFileSync(committedFile, expected);
    const env = fixtureEnvironment();
    const git = (...args) => execFileSync('git', ['-C', directory, '-c', 'core.hooksPath=' + os.devNull, ...args], { env });
    git('init', '--initial-branch=control'); git('add', '.');
    git('-c', 'user.name=Controlled Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Reviewed policy');
    const revision = git('rev-parse', 'HEAD').toString().trim();
    const actual = path.join(directory, 'image-requirements.toml');
    fs.writeFileSync(actual, expected, { mode: 0o444 });
    let closes = 0, reads = 0, opens = 0;
    const stats = stat => Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
        uid: options.owner ?? 0n, mode: options.mode ?? 0o100444n,
    });
    const modeled = { ...fs, constants: { ...fs.constants,
        ...(options.noPhysicalOpen ? { O_NOFOLLOW: undefined } : {}) } };
    modeled.realpathSync = name => ['/etc', '/etc/codex', fixed].includes(name) ? name : fs.realpathSync(name);
    modeled.lstatSync = (name, flags) => {
        if (['/etc', '/etc/codex'].includes(name)) return {
            isDirectory: () => true, isSymbolicLink: () => options.parentLink === name,
            uid: 0n, mode: 0o40755n,
        };
        return stats(fs.lstatSync(name === fixed ? actual : name, flags));
    };
    modeled.openSync = (name, flags) => {
        opens++; assert.equal(name, fixed);
        const fd = fs.openSync(actual, flags);
        if (options.replaceOnOpen) {
            const replacement = actual + '.replacement'; fs.writeFileSync(replacement, expected, { mode: 0o444 });
            fs.renameSync(replacement, actual);
        }
        return fd;
    };
    modeled.fstatSync = (fd, flags) => stats(fs.fstatSync(fd, flags));
    modeled.readSync = (...args) => {
        reads++;
        if (options.readError) throw new Error('controlled read failure');
        const count = fs.readSync(...args);
        if (options.mutateDuringRead && reads === 1) {
            fs.chmodSync(actual, 0o644); fs.writeFileSync(actual, expected); fs.chmodSync(actual, 0o444);
        }
        return count;
    };
    modeled.closeSync = fd => {
        closes++; fs.closeSync(fd);
        if (options.closeError) throw new Error('controlled close failure');
    };
    const exports = { exports: {} };
    vm.runInNewContext(source + '\nmodule.exports = { admitManagedFilesystemRequirements };\n', {
        require: name => name === 'node:fs' ? modeled : requireSource(name), module: exports,
        __filename: file, __dirname: path.dirname(file), process, Buffer,
    }, { filename: file });
    return { expected, actual, git, committedFile,
        admit: () => exports.exports.admitManagedFilesystemRequirements({ git }, revision),
        counts: () => ({ closes, reads, opens }),
        replace(bytes) { fs.chmodSync(actual, 0o644); fs.writeFileSync(actual, bytes); fs.chmodSync(actual, 0o444); } };
}

posixTest('ev974-C26 admits exact committed policy bytes with modeled protected root metadata', t => {
    const f = fixture(t), actual = f.admit();
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), { path: fixed, bytes: f.expected.length,
        sha256: digest(f.expected), ownerUid: 0, mode: '0444', enforcementObserved: false });
    assert.equal(f.counts().closes, 1);
});
posixTest('ev974-C26 missing image policy rejects before reading or loading credentials', t => {
    const f = fixture(t); fs.unlinkSync(f.actual); assert.throws(f.admit, /ENOENT/u);
    assert.equal(f.counts().reads, 0); assert.equal(f.counts().closes, 0);
});
posixTest('ev974-C26 a linked policy file cannot bypass the physical descriptor open', t => {
    const f = fixture(t), target = f.actual + '.target'; fs.renameSync(f.actual, target); fs.symlinkSync(target, f.actual);
    assert.throws(f.admit, /ELOOP/u); assert.equal(f.counts().reads, 0);
});
posixTest('ev974-C26 a linked protected parent rejects before file open', t => {
    const f = fixture(t, { parentLink: '/etc/codex' }); assert.throws(f.admit, /protected root-owned/u);
    assert.equal(f.counts().opens, 0);
});
posixTest('ev974-C26 nonroot image policy ownership is not admitted', t => {
    const f = fixture(t, { owner: 1001n }); assert.throws(f.admit, /root-owned0444/u);
    assert.equal(f.counts().closes, 1); assert.equal(f.counts().reads, 0);
});
posixTest('ev974-C26 writable policy mode rejects with the descriptor closed', t => {
    const f = fixture(t, { mode: 0o100644n }); assert.throws(f.admit, /root-owned0444/u);
    assert.equal(f.counts().closes, 1); assert.equal(f.counts().reads, 0);
});
posixTest('ev974-C26 equal-size unreviewed policy bytes are not accepted', t => {
    const f = fixture(t), changed = Buffer.from(f.expected); changed[0] ^= 1; f.replace(changed);
    assert.throws(f.admit, /bytes differ/u); assert.equal(f.counts().closes, 1);
});
posixTest('ev974-C26 oversized image policy rejects before reading its bytes', t => {
    const f = fixture(t); f.replace(Buffer.concat([f.expected, Buffer.from('extra')]));
    assert.throws(f.admit, /size differs/u); assert.equal(f.counts().reads, 0); assert.equal(f.counts().closes, 1);
});
posixTest('ev974-C26 replacing the policy path after open cannot authorize another inode', t => {
    const f = fixture(t, { replaceOnOpen: true }); assert.throws(f.admit, /changed during admission/u);
    assert.equal(f.counts().closes, 1);
});
posixTest('ev974-C26 mutation during read rejects even when the original bytes are restored', t => {
    const f = fixture(t, { mutateDuringRead: true }); assert.throws(f.admit, /changed during admission/u);
    assert.equal(f.counts().closes, 1);
});
posixTest('ev974-C26 read failure cannot leak the image policy descriptor', t => {
    const f = fixture(t, { readError: true }); assert.throws(f.admit, /controlled read failure/u);
    assert.equal(f.counts().closes, 1);
});
posixTest('ev974-C26 a close failure cannot return admitted policy metadata', t => {
    const f = fixture(t, { closeError: true }); assert.throws(f.admit, /controlled close failure/u);
    assert.equal(f.counts().closes, 1);
});
posixTest('ev974-C26 hosts without physical-open support fail before file open', t => {
    const f = fixture(t, { noPhysicalOpen: true }); assert.throws(f.admit, /physical-file open support/u);
    assert.equal(f.counts().opens, 0);
});
test('ev974-C26 the qualification-only system artifact covers every fixed private data surface', () => {
    const text = fs.readFileSync(path.join(root, relative), 'utf8').split('\n').filter(line => !line.startsWith('#')).join('\n').trim();
    assert(text.startsWith('[permissions.filesystem]\ndeny_read = '));
    const paths = JSON.parse(text.slice(text.indexOf('=') + 1));
    assert.deepEqual(paths, ['/proc', '/sdk', '/tmp/bugbot-contained-worker/source',
        '/tmp/bugbot-contained-worker/home/.codex/auth.json', '/qualification-input/private-credentials.json',
        '/qualification-input/invocation.json', '/qualification-input/plan.bundle',
        '/qualification-input/campaign/corpus-v3', '/qualification-output']);
});

for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) {
    posixTest('ev974-C26 ambient ' + key + ' cannot redirect the controlled Git fixture', t => {
        const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-git-env-control-')));
        t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
        const git = (...args) => execFileSync('git', ['-C', directory, '-c', 'core.hooksPath=' + os.devNull, ...args],
            { env: fixtureEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] });
        git('init', '--initial-branch=control'); fs.writeFileSync(path.join(directory, 'owned-marker.txt'), 'Owned control\n');
        git('add', '.'); git('-c', 'user.name=Controlled Fixture', '-c', 'user.email=fixture@example.invalid',
            'commit', '-m', 'Protected controlled baseline');
        const snapshot = () => ({ head: git('rev-parse', 'HEAD').toString().trim(),
            status: git('status', '--porcelain').toString(), index: digest(fs.readFileSync(path.join(directory, '.git/index'))) });
        const before = snapshot(), target = key === 'GIT_DIR' ? path.join(directory, '.git')
            : key === 'GIT_INDEX_FILE' ? path.join(directory, '.git/index') : directory;
        // Select only the pre-existing successful case. The three outer cases
        // cannot recursively run themselves; every redirect target is owned here.
        const environment = { ...fixtureEnvironment(), [key]: target };
        delete environment.NODE_TEST_CONTEXT;
        const child = spawnSync(process.execPath, ['--no-sparkplug', '--test', '--test-reporter=tap',
            '--test-name-pattern=^ev974-C26 admits exact committed policy bytes with modeled protected root metadata$', __filename],
        { cwd: root, env: environment, encoding: 'utf8', maxBuffer: 1024 * 1024 });
        assert.equal(child.status, 0, child.stdout + child.stderr);
        assert.match(child.stdout, /^# tests 1$/mu, 'the selected child control must actually execute');
        assert.match(child.stdout, /^# pass 1$/mu, 'the selected child control must pass');
        assert.match(child.stdout, /^# skipped 0$/mu, 'the child cannot substitute a skip');
        assert.deepEqual(snapshot(), before, 'ambient Git binding changed the separate controlled repository');
    });
}
