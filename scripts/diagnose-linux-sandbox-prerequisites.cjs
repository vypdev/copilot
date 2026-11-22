'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable, Transform } = require('node:stream');
const policy = require('./lib/linux-sandbox-diagnostic-policy.cjs');
const hash = data => createHash('sha256').update(data).digest('hex');

// Fixed diagnostic commands only. This technical bound never wraps a model or
// research operation. Keep actual child close distinct from wrapper rejection.
function execute(command, args, { cwd, env, signal, timeout = 20000 }) {
  if (signal.aborted) return Promise.resolve({ cancelled: true, stdout: '', stderr: '', exitCode: null, signal: null });
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const result = { stdout: '', stderr: '', exitCode: null, signal: null, cancelled: false, timedOut: false, truncated: false };
    let escalation;
    const kill = name => {
      try { if (child.pid) process.kill(-child.pid, name); }
      catch (error) { if (error.code !== 'ESRCH') result.error ??= 'termination-unavailable'; }
    };
    const terminate = kind => {
      if (result[kind]) return;
      result[kind] = true; kill('SIGTERM');
      escalation ??= setTimeout(() => kill('SIGKILL'), 1000);
    };
    const abort = () => terminate('cancelled');
    const timer = setTimeout(() => terminate('timedOut'), timeout);
    const consume = key => chunk => {
      const text = chunk.toString('utf8');
      if (Buffer.byteLength(result[key]) + chunk.length > 65536) terminate('truncated');
      else result[key] += text;
    };
    child.stdout.on('data', consume('stdout')); child.stderr.on('data', consume('stderr'));
    child.once('error', error => { result.error = error.code || 'launch-unavailable'; });
    child.once('close', (exitCode, childSignal) => {
      clearTimeout(timer); clearTimeout(escalation); signal.removeEventListener('abort', abort);
      result.exitCode = exitCode; result.signal = childSignal; resolve(result);
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function probeCommands(runtime) {
  const shellPolicy = mode => ['--ignore-user-config', '--ignore-rules', 'sandbox',
    '--config', 'sandbox_mode="read-only"', '--config', `shell_environment_policy.inherit="${mode}"`,
    ...(mode === 'core' ? ['--config', 'shell_environment_policy.ignore_default_excludes=false',
      '--config', 'shell_environment_policy.include_only=["PATH"]'] : []), '--'];
  const read = 'process.stdout.write(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))';
  const write = 'try{require("node:fs").writeFileSync(process.argv[1],"owned-write-canary");process.stdout.write("WROTE");process.exitCode=9}catch(e){if(["EACCES","EPERM","EROFS"].includes(e.code))process.stdout.write("DENIED");else process.exitCode=44}';
  return [
    ['unshare-user-network', '/usr/bin/unshare', ['--user', '--map-root-user', '--net', '/bin/true']],
    ['bwrap-user-network', '/usr/bin/bwrap', ['--unshare-user', '--unshare-net', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '/bin/true']],
    ['bwrap-root-user-network', '/usr/bin/bwrap', ['--unshare-user', '--uid', '0', '--gid', '0', '--unshare-net', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '/bin/true']],
    ['codex-empty-start', runtime.codex, [...shellPolicy('none'), '/bin/true']],
    ['codex-path-start', runtime.codex, [...shellPolicy('core'), '/bin/true']],
    ['codex-fixture-read', runtime.codex, [...shellPolicy('core'), runtime.node, '-e', read, runtime.fixture], runtime.fixtureSha256],
    ['codex-write-denial', runtime.codex, [...shellPolicy('core'), runtime.node, '-e', write, runtime.writeTarget], 'DENIED'],
  ];
}

async function diagnose(ports) {
  const receipt = { schemaVersion: 1, kind: 'model-free-linux-sandbox-diagnostic', ...ports.identity,
    preparation: { state: 'unavailable' }, probes: [], qualificationModelCalls: 0, evaluatedPilotWrites: 0,
    productionSettingChanged: false, qualifiedProfiles: [], actualSdkOrModelToolAcceptance: false };
  let runtime;
  try {
    const candidate = await ports.prepare();
    assert.equal(candidate.version, policy.CODEX_VERSION, 'exact diagnostic CLI version required');
    runtime = candidate;
    receipt.preparation = { state: 'observed', runtime: runtime.identity };
    for (const [id, executable, args, expected] of probeCommands(runtime)) {
      if (ports.signal.aborted) { receipt.probes.push(policy.notRun(id, 'cancelled')); continue; }
      const result = await ports.execute(executable, args);
      const observation = policy.observation(id, result, expected);
      const canaryMismatch = id === 'codex-write-denial' && !await ports.writeAbsent();
      receipt.probes.push({ ...observation, ...(canaryMismatch ? { state: 'fail', reason: 'unexpected-write' } : {}),
        stdout: ports.project(result.stdout), stderr: ports.project(result.stderr),
        stdoutSha256: hash(result.stdout), stderrSha256: hash(result.stderr), outputTruncated: result.truncated === true });
    }
  } catch (error) {
    if (!runtime) receipt.preparation = { state: ports.signal.aborted ? 'cancelled' : 'failed',
      cause: error.code === 'ENOENT' ? 'missing-prerequisite' : 'preparation-or-provenance-failed',
      boundary: ['official-download', 'archive-inventory', 'extraction', 'executable-identity', 'version', 'fixture'].includes(error.diagnosticBoundary)
        ? error.diagnosticBoundary : 'unknown' };
    else receipt.executionIncomplete = true;
    for (const id of policy.PROBE_IDS.slice(receipt.probes.length)) receipt.probes.push(policy.notRun(id,
      ports.signal.aborted ? 'cancelled' : runtime ? 'observation-unavailable' : 'preparation-failed'));
  } finally {
    try { receipt.engine = await ports.engine(); }
    catch { receipt.engine = { state: 'unavailable', cause: 'observation-unavailable' }; }
    try { await ports.release(); receipt.cleanup = 'completed'; }
    catch { receipt.cleanup = 'failed'; }
  }
  return receipt;
}

async function downloadArchive(archive, target, signal) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  const response = await fetch(archive.url, { signal });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('official release download unavailable');
  }
  let bytes = 0; const digest = createHash('sha256');
  const meter = new Transform({ transform(chunk, encoding, done) {
    bytes += chunk.length;
    if (bytes > archive.bytes) return done(new Error('official archive length mismatch'));
    digest.update(chunk); done(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal });
  assert.equal(bytes, archive.bytes, 'official archive length mismatch');
  assert.equal(digest.digest('hex'), archive.sha256, 'official archive digest mismatch');
}

function engineObservation(signal) {
  if (signal.aborted) return Promise.resolve({ state: 'unavailable', cause: 'cancelled' });
  let request, response, responseClosed, resolveClosed, complete = false;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const pending = new Promise(resolve => {
    const socket = '/var/run/docker.sock';
    const finish = value => { if (!complete) { complete = true; request?.destroy(); response?.destroy(); resolve(value); } };
    const abort = () => finish({ state: 'unavailable', cause: 'cancelled' });
    try {
    request = http.request({ socketPath: socket, path: '/version', method: 'GET', agent: false, timeout: 3000 }, incoming => {
      response = incoming; responseClosed = new Promise(done => incoming.once('close', done));
      if (complete) { incoming.destroy(); return; }
      let data = ''; incoming.on('data', chunk => { data += chunk; if (Buffer.byteLength(data) > 8192) finish({ state: 'unavailable', cause: 'invalid-metadata' }); });
      incoming.once('error', () => finish({ state: 'unavailable', cause: 'transport-unavailable' }));
      incoming.once('aborted', () => finish({ state: 'unavailable', cause: 'transport-unavailable' }));
      incoming.once('end', () => {
        try {
          const value = JSON.parse(data);
          assert.equal(incoming.statusCode, 200);
          assert(/^[0-9][0-9A-Za-z.+-]{0,63}$/u.test(value.Version));
          assert(/^\d{1,3}\.\d{1,3}$/u.test(value.ApiVersion));
          finish({ state: 'observed', version: value.Version, apiVersion: value.ApiVersion, workloadExecuted: false });
        } catch { finish({ state: 'unavailable', cause: 'invalid-metadata' }); }
      });
    });
    request.once('close', resolveClosed);
    request.once('close', () => signal.removeEventListener('abort', abort));
    request.once('error', () => finish({ state: 'unavailable', cause: 'local-engine-unavailable' }));
    request.once('timeout', () => finish({ state: 'unavailable', cause: 'transport-timeout' }));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else request.end();
    } catch {
      if (!request) resolveClosed();
      finish({ state: 'unavailable', cause: 'local-engine-unavailable' });
    }
  });
  return pending.finally(async () => { request?.destroy(); response?.destroy(); await closed; if (responseClosed) await responseClosed; });
}

function nativePorts(signal, dependencies = {}) {
  assert.equal(dependencies.platform ?? process.platform, 'linux', 'Linux diagnostic only');
  const archive = policy.archiveFor(dependencies.architecture ?? process.arch);
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-linux-sandbox-')); fs.chmodSync(privateRoot, 0o700);
  const home = path.join(privateRoot, 'home'), temporary = path.join(privateRoot, 'tmp');
  fs.mkdirSync(home, { mode: 0o700 }); fs.mkdirSync(temporary, { mode: 0o700 });
  const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, CODEX_HOME: path.join(home, '.codex'),
    XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: temporary, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  const run = (executable, args) => (dependencies.execute ?? execute)(executable, args, { cwd: privateRoot, env, signal });
  const fixture = path.join(privateRoot, 'fixture.txt'), writeTarget = path.join(privateRoot, 'write-canary.txt');
  return { signal,
    identity: { sourceCommit: /^[a-f0-9]{40}$/u.test(process.env.GITHUB_SHA || '') ? process.env.GITHUB_SHA : null,
      driverSha256: hash(fs.readFileSync(__filename)), policySha256: hash(fs.readFileSync(require.resolve('./lib/linux-sandbox-diagnostic-policy.cjs'))),
      os: 'linux', architecture: process.arch, kernel: os.release(), effectiveUid: process.geteuid() },
    project: text => policy.outputProjection(text, privateRoot), execute: run,
    async prepare() {
      let boundary = 'official-download';
      try {
      const target = path.join(privateRoot, 'codex.tar.gz'); await (dependencies.downloadArchive ?? downloadArchive)(archive, target, signal);
      boundary = 'archive-inventory';
      const list = await run('/usr/bin/tar', ['-tzf', target]);
      assert.equal(list.exitCode, 0); assert(!list.truncated && !list.error && !list.signal);
      const members = list.stdout.trim().split('\n');
      assert.deepEqual(members, [`codex-${archive.target}`], 'unexpected official archive inventory');
      boundary = 'extraction';
      const extracted = await run('/usr/bin/tar', ['-xzf', target, '-C', privateRoot]);
      assert.equal(extracted.exitCode, 0); assert(!extracted.error && !extracted.signal);
      boundary = 'executable-identity';
      const codex = path.join(privateRoot, members[0]); const stat = fs.lstatSync(codex);
      assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid());
      fs.chmodSync(codex, 0o700);
      const executableSha256 = hash(fs.readFileSync(codex)), nodeSha256 = hash(fs.readFileSync(process.execPath));
      boundary = 'version';
      const version = await run(codex, ['--version']);
      assert.equal(version.exitCode, 0); assert(!version.error && !version.signal && !version.truncated);
      assert.equal(version.stdout.trim(), 'codex-cli ' + policy.CODEX_VERSION);
      boundary = 'fixture';
      fs.writeFileSync(fixture, 'owned model-free Linux sandbox read fixture\n', { flag: 'wx', mode: 0o600 });
      const fixtureSha256 = hash(fs.readFileSync(fixture));
      return { version: policy.CODEX_VERSION, codex, node: process.execPath, fixture, writeTarget, fixtureSha256,
        identity: { version: policy.CODEX_VERSION, executableSha256, distributionSha256: archive.sha256,
          nodeVersion: process.versions.node, nodeSha256, fixtureSha256 } };
      } catch (error) { error.diagnosticBoundary = boundary; throw error; }
    },
    writeAbsent: async () => !fs.existsSync(writeTarget),
    engine: () => engineObservation(signal),
    release: async () => fs.rmSync(privateRoot, { recursive: true, force: true }),
  };
}

async function main(dependencies = {}) {
  assert.equal(process.argv.length, 2, 'diagnostic accepts no arguments');
  assert(/^\d+$/u.test(process.env.GITHUB_RUN_ID || '') && /^\d+$/u.test(process.env.GITHUB_RUN_ATTEMPT || ''), 'native run identity required');
  const reportRoot = fs.realpathSync(process.env.RUNNER_TEMP);
  const report = path.join(reportRoot, `copilot-linux-sandbox-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}.json`);
  const controller = new AbortController(), abort = () => controller.abort();
  process.once('SIGTERM', abort); process.once('SIGINT', abort);
  try {
    const receipt = await diagnose((dependencies.nativePorts ?? nativePorts)(controller.signal));
    fs.writeFileSync(report, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const summary = policy.renderSummary(receipt);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log(summary);
    process.exitCode = receipt.preparation.state === 'observed' && receipt.cleanup === 'completed' && !receipt.executionIncomplete ? 0 : 1;
  } finally { process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort); }
}

module.exports = { execute, probeCommands, diagnose, downloadArchive, engineObservation, nativePorts, main };
if (require.main === module) void main().catch(() => { console.error('Linux diagnostic preparation unavailable; no qualification result.'); process.exitCode = 1; });
