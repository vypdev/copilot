'use strict';
// Real Git, actual prepared() source and pure profile validation. No native
// Engine, bootstrap process, provider or model is launched by these controls.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os');
const path = require('node:path'), vm = require('node:vm'), Module = require('node:module');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto'), { test } = require('node:test');
const root = path.resolve(__dirname, '../../../..');
const sourceFile = path.join(root, 'quality/bugbot/evidence/issue974/containment-native.test.cjs');
const selectedSource = sourceFile;
const source = fs.readFileSync(selectedSource, 'utf8'), sourceRequire = Module.createRequire(sourceFile);
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(t, trusted) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-native-pin-admission-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const config = path.join(directory, 'empty-global'); fs.writeFileSync(config, '');
  const env = { ...Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1' };
  const git = args => execFileSync('git', args, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--initial-branch=main']);
  const bootstrap = path.join(directory, 'supplied-bootstrap.cjs');
  const canonical = fs.readFileSync(path.join(root, 'quality/bugbot/evidence/issue-950/qualification-bootstrap.cjs'));
  fs.writeFileSync(bootstrap, trusted ? canonical : Buffer.from('// Arbitrary untrusted script; deliberately never executed by this test.\n'));
  const hostHarness = path.join(directory, 'quality/bugbot/evidence/issue974/containment-native.test.cjs');
  const hostBootstrap = path.join(directory, 'quality/bugbot/evidence/issue-950/qualification-bootstrap.cjs');
  fs.mkdirSync(path.dirname(hostHarness), { recursive: true }); fs.mkdirSync(path.dirname(hostBootstrap), { recursive: true });
  fs.writeFileSync(hostHarness, source); fs.writeFileSync(hostBootstrap, canonical);
  const profile = { schemaVersion: 1, image: 'sha256:' + 'a'.repeat(64), imageConfigSha256: 'b'.repeat(64),
    hostNodeSha256: 'c'.repeat(64), socketPath: path.join(directory, 'never-contacted.sock'), supervisorSha256: 'd'.repeat(64),
    workerUid: 1000, workerGid: 1000, engine: { version: 'fixture', apiVersion: '1.56', os: 'linux', arch: 'fixture', kernelVersion: 'fixture' } };
  const ids = ['ev974-C32', 'ev974-C33', 'ev974-C34', 'ev974-C35'];
  const contents = ids.map(id => JSON.stringify({ purpose: 'native-control', containment: profile,
    nativeControl: { selectedCase: id, harnessSha256: hash(source) } }));
  ids.forEach((id, index) => fs.writeFileSync(path.join(directory, id + '.json'), contents[index]));
  git(['add', '.']); git(['-c', 'user.name=Controlled Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Model-free control plans']);
  const revision = git(['rev-parse', 'HEAD']).toString().trim();
  const records = ids.map((caseId, index) => ({ bootstrapPath: bootstrap, bootstrapSha256: hash(fs.readFileSync(bootstrap)),
    caseId, planPath: caseId + '.json', planSha256: hash(contents[index]), repository: directory, revision }));
  const file = path.join(directory, 'control-records.json'); fs.writeFileSync(file, JSON.stringify(records));
  const environment = { COPILOT_NATIVE_CONTROL_PLANS: file,
    COPILOT_NATIVE_CONTROL_PLANS_SHA256: hash(fs.readFileSync(file)) };
  const exported = { exports: {} }, launches = [];
  const controlledRequire = name => name === 'node:test' ? { test() {} }
    : name === 'node:child_process' ? { execFileSync, spawn(node, args) {
      const child = new (require('node:events').EventEmitter)();
      launches.push({ node, args, child }); return child;
    } } : sourceRequire(name);
  t.after(() => {
    for (const call of launches) {
      call.child.emit('close', 0, null);
      const directory = path.dirname(call.args.at(-1));
      assert(path.basename(directory).startsWith('ev974-native-'));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  vm.runInNewContext(source + '\nmodule.exports = { prepared, launch };\n', {
    require: controlledRequire, module: exported, __filename: hostHarness, __dirname: path.dirname(hostHarness),
    process: { env: environment, execPath: process.execPath }, Buffer,
  }, { filename: sourceFile });
  return { ...exported.exports, launches, bootstrap, canonical, directory, records, controlFile: file,
    environment, hostBootstrap, hostHarness, git };
}
test('ev974-C26 canonical bootstrap bytes remain admissible to the native preparation control', t => {
  assert.equal(fixture(t, true).prepared().length, 4);
});
test('ev974-C26 a co-supplied bootstrap and its own digest cannot establish executable authority', t => {
  assert.throws(() => fixture(t, false).prepared(), /bootstrap|trusted|pin/i);
});
test('ev974-C26 launch uses a private verified snapshot after the supplied bootstrap path is replaced', t => {
  const f = fixture(t, true), entry = f.prepared()[0];
  fs.writeFileSync(f.bootstrap, '// Changed after admission; never execute this path.\n');
  f.launch(entry, 'snapshot-control');
  assert.equal(f.launches.length, 1);
  const selected = f.launches[0].args[0];
  assert.notEqual(selected, f.bootstrap);
  assert.equal(hash(fs.readFileSync(selected)), hash(f.canonical));
  assert.equal(fs.statSync(selected).mode & 0o777, 0o400);
});
test('ev974-C26 a serialized lookalike cannot obtain the private launch capability', t => {
  const f = fixture(t, true), entry = f.prepared()[0];
  assert.throws(() => f.launch({ ...entry }, 'forged-control'), /private|prepared|authority/i);
  assert.equal(f.launches.length, 0);
});

test('ev974-C26 an admitted private bootstrap remains available after the supplied file is deleted', t => {
  const f = fixture(t, true), entry = f.prepared()[0];
  fs.unlinkSync(f.bootstrap);
  f.launch(entry, 'deleted-input-control');
  assert.equal(f.launches.length, 1);
  const selected = f.launches[0].args[0];
  assert.notEqual(selected, f.bootstrap);
  assert.equal(hash(fs.readFileSync(selected)), hash(f.canonical));
});

test('ev974-C26 dirty host bootstrap bytes cannot be authorized by a matching supplied digest', t => {
  const f = fixture(t, true), changed = Buffer.from(f.canonical); changed[0] ^= 1;
  fs.writeFileSync(f.hostBootstrap, changed); fs.writeFileSync(f.bootstrap, changed);
  for (const row of f.records) row.bootstrapSha256 = hash(changed);
  fs.writeFileSync(f.controlFile, JSON.stringify(f.records));
  f.environment.COPILOT_NATIVE_CONTROL_PLANS_SHA256 = hash(fs.readFileSync(f.controlFile));
  assert.throws(() => f.prepared());
  assert.equal(f.launches.length, 0);
});

test('ev974-C26 canonical committed bytes remain eligible beside a dirty host working copy', t => {
  const f = fixture(t, true), changed = Buffer.from(f.canonical); changed[0] ^= 1;
  fs.writeFileSync(f.hostBootstrap, changed);
  const entry = f.prepared()[0]; f.launch(entry, 'committed-reference-control');
  assert.equal(f.launches.length, 1);
  assert.equal(hash(fs.readFileSync(f.launches[0].args[0])), hash(f.canonical));
});

test('ev974-C26 a dirty executing harness cannot be authorized by resigning its plan digest', t => {
  const f = fixture(t, true);
  fs.appendFileSync(f.hostHarness, '\n// Changed after its independently committed source.\n');
  for (const row of f.records) {
    const file = path.join(f.directory, row.planPath), plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    plan.nativeControl.harnessSha256 = hash(fs.readFileSync(f.hostHarness));
    fs.writeFileSync(file, JSON.stringify(plan));
  }
  f.git(['add', '--', ...f.records.map(row => row.planPath)]);
  f.git(['-c', 'user.name=Controlled Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Resigned input plans only']);
  const revision = f.git(['rev-parse', 'HEAD']).toString().trim();
  for (const row of f.records) { row.revision = revision; row.planSha256 = hash(fs.readFileSync(path.join(f.directory, row.planPath))); }
  fs.writeFileSync(f.controlFile, JSON.stringify(f.records));
  f.environment.COPILOT_NATIVE_CONTROL_PLANS_SHA256 = hash(fs.readFileSync(f.controlFile));
  assert.throws(() => f.prepared());
  assert.equal(f.launches.length, 0);
});

for (const mutation of ['symlink', 'directory', 'truncated', 'oversized', 'same-size-wrong-bytes']) {
  test('ev974-C26 rejects supplied bootstrap ' + mutation + ' before any launch', t => {
    const f = fixture(t, true);
    if (mutation === 'symlink') {
      const target = path.join(f.directory, 'canonical-linked-target.cjs');
      fs.writeFileSync(target, f.canonical);
      fs.unlinkSync(f.bootstrap); fs.symlinkSync(target, f.bootstrap);
    } else if (mutation === 'directory') {
      fs.unlinkSync(f.bootstrap); fs.mkdirSync(f.bootstrap);
    } else if (mutation === 'truncated') fs.writeFileSync(f.bootstrap, f.canonical.subarray(0, -1));
    else if (mutation === 'oversized') fs.appendFileSync(f.bootstrap, '\n');
    else {
      const wrong = Buffer.from(f.canonical); wrong[0] ^= 1; fs.writeFileSync(f.bootstrap, wrong);
    }
    assert.throws(() => f.prepared());
    assert.equal(f.launches.length, 0);
  });
}

function interceptSnapshot(f, scenario, verify) {
  const original = { openSync: fs.openSync, fstatSync: fs.fstatSync, readSync: fs.readSync, closeSync: fs.closeSync };
  let descriptor, closed = false, intercepted = false;
  fs.openSync = function (file, ...args) {
    const flags = args[0];
    const reading = flags === undefined || flags === 'r' || typeof flags === 'number'
      && !(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_TRUNC));
    const selected = String(file) === f.bootstrap && reading;
    if (selected && scenario === 'inode-replaced') {
      fs.renameSync(f.bootstrap, f.bootstrap + '.old'); fs.writeFileSync(f.bootstrap, f.canonical);
    }
    const fd = original.openSync.call(this, file, ...args);
    if (selected) descriptor = fd;
    return fd;
  };
  fs.fstatSync = function (fd, ...args) {
    const result = original.fstatSync.call(this, fd, ...args);
    if (fd === descriptor && scenario === 'grew-after-stat') { intercepted = true; fs.appendFileSync(f.bootstrap, '\n'); }
    return result;
  };
  fs.readSync = function (fd, ...args) {
    if (fd === descriptor && scenario === 'read-failed') { intercepted = true; throw new Error('controlled snapshot read failure'); }
    return original.readSync.call(this, fd, ...args);
  };
  fs.closeSync = function (fd, ...args) {
    const result = original.closeSync.call(this, fd, ...args);
    if (fd === descriptor) closed = true;
    return result;
  };
  try { verify(() => f.prepared()); }
  finally { Object.assign(fs, original); }
  assert.notEqual(descriptor, undefined, 'actual supplied-file descriptor was opened');
  assert(closed, 'failed verification must close the actual file descriptor');
  assert.throws(() => fs.fstatSync(descriptor), error => error.code === 'EBADF');
  if (scenario !== 'inode-replaced') assert(intercepted, 'selected post-open fault was actually reached');
  assert.equal(f.launches.length, 0);
}
for (const scenario of ['inode-replaced', 'grew-after-stat', 'read-failed']) {
  test('ev974-C26 supplied bootstrap ' + scenario + ' closes its descriptor and cannot launch', t => {
    const f = fixture(t, true);
    interceptSnapshot(f, scenario, run => assert.throws(run));
  });
}

for (const pin of [undefined, 'not-a-reviewed-sha256']) {
  test('ev974-C26 rejects ' + (pin === undefined ? 'missing' : 'malformed') + ' independent native inventory pin', t => {
    const f = fixture(t, true);
    if (pin === undefined) delete f.environment.COPILOT_NATIVE_CONTROL_PLANS_SHA256;
    else f.environment.COPILOT_NATIVE_CONTROL_PLANS_SHA256 = pin;
    assert.throws(() => f.prepared(), /independently reviewed native-control inventory digest/u);
    assert.equal(f.launches.length, 0);
  });
}

function replacePlanRevision(f) {
  for (const row of f.records) {
    const file = path.join(f.directory, row.planPath), plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    plan.containment.image = 'sha256:' + 'e'.repeat(64);
    fs.writeFileSync(file, JSON.stringify(plan));
  }
  f.git(['add', '--', ...f.records.map(row => row.planPath)]);
  f.git(['-c', 'user.name=Controlled Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-m', 'Different self-consistent native plan revision']);
  const revision = f.git(['rev-parse', 'HEAD']).toString().trim();
  for (const row of f.records) {
    row.revision = revision; row.planSha256 = hash(fs.readFileSync(path.join(f.directory, row.planPath)));
  }
  fs.writeFileSync(f.controlFile, JSON.stringify(f.records));
}

test('ev974-C26 self-consistent replacement plan revision cannot replace the independently reviewed inventory', t => {
  const f = fixture(t, true), originalPin = f.environment.COPILOT_NATIVE_CONTROL_PLANS_SHA256;
  replacePlanRevision(f);
  assert.notEqual(hash(fs.readFileSync(f.controlFile)), originalPin);
  assert.throws(() => f.prepared(), /native-control inventory differs from independently reviewed digest/u);
  assert.equal(f.launches.length, 0);
});

test('ev974-C26 a separately reviewed inventory digest admits its exact replacement tuple', t => {
  const f = fixture(t, true);
  replacePlanRevision(f);
  // Model the operator's separate reviewed input, never derive authority from
  // the untrusted records inside prepared(). This is not a native observation.
  f.environment.COPILOT_NATIVE_CONTROL_PLANS_SHA256 = hash(fs.readFileSync(f.controlFile));
  const entries = f.prepared();
  assert.equal(entries.length, 4);
  assert(entries.every(entry => entry.plan.containment.image === 'sha256:' + 'e'.repeat(64)));
  assert.equal(f.launches.length, 0);
});

for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) {
  test('ev974-C26 ambient ' + key + ' cannot redirect the native bootstrap Git fixture', t => {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-native-git-env-')));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const env = { ...Object.fromEntries(Object.entries(process.env)
      .filter(([name]) => !name.toUpperCase().startsWith('GIT_'))),
      GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1' };
    const git = (...args) => execFileSync('git', ['-C', directory, '-c', 'core.hooksPath=' + os.devNull, ...args],
      { env, stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '--initial-branch=control'); fs.writeFileSync(path.join(directory, 'owned-marker.txt'), 'Owned fixture only\n');
    git('add', '.'); git('-c', 'user.name=Controlled Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-m', 'Separate owned Git baseline');
    const snapshot = () => ({ head: git('rev-parse', 'HEAD').toString().trim(),
      status: git('status', '--porcelain').toString(), index: hash(fs.readFileSync(path.join(directory, '.git/index'))) });
    const before = snapshot(), target = key === 'GIT_DIR' ? path.join(directory, '.git')
      : key === 'GIT_INDEX_FILE' ? path.join(directory, '.git/index') : directory;
    const childEnvironment = { ...env, [key]: target }; delete childEnvironment.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, ['--no-sparkplug', '--test', '--test-reporter=tap',
      '--test-name-pattern=^ev974-C26 canonical bootstrap bytes remain admissible to the native preparation control$', __filename],
      { cwd: root, env: childEnvironment, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    assert.deepEqual(snapshot(), before, 'ambient binding modified the separate owned repository');
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /^# tests 1$/mu);
    assert.match(child.stdout, /^# pass 1$/mu);
    assert.match(child.stdout, /^# skipped 0$/mu);
  });
}
